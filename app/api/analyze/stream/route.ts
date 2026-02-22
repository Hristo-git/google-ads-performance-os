import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import anthropic from "@/lib/anthropic";
import { ANALYSIS_SYSTEM_PROMPT_V3, getAdGroupAnalysisPrompt } from "@/lib/prompts-v2";
import { upsertReport } from "@/lib/pinecone";
import { saveReport } from "@/lib/supabase";
import { runPreAnalysis, type SearchTermInput } from "@/lib/account-health";
import { logActivity } from "@/lib/activity-logger";
import { calculateDerivedMetrics, buildEnhancedDataInventory } from "@/lib/derived-metrics";
import { getBiddingLabel, enrichCampaignData } from "@/lib/bidding-labels";
import { rateLimitAI } from "@/lib/rate-limit";

// Streaming bypasses Vercel's time-to-first-byte timeout
export const maxDuration = 300;

// ============================================
// BUILD PROMPT (imported logic from parent route)
// ============================================
// Data inventory is now shared from lib/derived-metrics.ts (buildEnhancedDataInventory)

function buildPrompt(data: any): string {
    const { level, language = 'bg', analysisType, category } = data;
    const isEn = language === 'en';
    const languageInstruction = isEn
        ? 'IMPORTANT: Your entire response MUST be in English language.'
        : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

    // Context signals (device/geo/hour/day/auction/LP/conversion actions + PMax)
    const contextBlock = data.contextBlock || '';
    const pmaxBlock = data.pmaxBlock || '';
    const dataInventory = buildEnhancedDataInventory(data);
    const derivedMetrics = calculateDerivedMetrics(data.campaigns, data.adGroups, data.deviceData);

    if (level === 'adgroup') {
        return getAdGroupAnalysisPrompt(data, language);
    }

    if (analysisType === 'category' && category) {
        const campaigns = enrichCampaignData(data.campaigns || []);
        const categoryLabels: Record<string, string> = {
            pmax_aon: 'Performance Max (AON)', pmax_sale: 'Performance Max (Sale)',
            search_nonbrand: 'Search Non-Brand', brand: 'Brand',
            search_dsa: 'Dynamic Search Ads', shopping: 'Shopping', upper_funnel: 'Video/Display'
        };
        const categoryName = categoryLabels[category] || category;
        const totalSpend = campaigns.reduce((sum: number, c: any) => sum + (c?.cost || 0), 0);
        const totalConversions = campaigns.reduce((sum: number, c: any) => sum + (c?.conversions || 0), 0);
        const totalConversionValue = campaigns.reduce((sum: number, c: any) => sum + (c?.conversionValue || 0), 0);
        const categoryROAS = totalSpend > 0 ? (totalConversionValue / totalSpend).toFixed(2) : 0;

        return `${languageInstruction}\n\n${dataInventory}\n\n${derivedMetrics}\n\n=== CATEGORY ANALYSIS MISSION: ${categoryName} ===\nProduce BOTH an Executive Summary and a Technical Analysis as specified in the output format.\n\n=== STATISTICAL CONTEXT ===\nTotal Campaigns: ${campaigns.length}\nTotal Spend: €${totalSpend.toFixed(2)}\nTotal Conversions: ${totalConversions.toFixed(2)}\nTotal Conversion Value: €${totalConversionValue.toFixed(2)}\nCategory ROAS: ${categoryROAS}x\n${totalConversions < 30 ? 'WARNING: Conversion volume is below 30. All performance conclusions are DIRECTIONAL ONLY.' : ''}\n\n=== CAMPAIGNS IN THIS CATEGORY ===\n${campaigns.map((c: any) => `Campaign: ${c.name}\n- Spend: €${(c.cost || 0).toFixed(2)} | Conv: ${c.conversions || 0} | Conv Value: €${(c.conversionValue || 0).toFixed(2)}\n- ROAS: ${c.cost > 0 ? ((c.conversionValue || 0) / c.cost).toFixed(2) : 0}x | CPA: €${c.conversions > 0 ? (c.cost / c.conversions).toFixed(2) : 'N/A'}\n- Bidding: ${c.biddingStrategyLabel} ${c.targetRoas ? `| Target ROAS: ${c.targetRoas}x` : ''} ${c.targetCpa ? `| Target CPA: €${c.targetCpa}` : ''}\n- Status: ${c.status || 'N/A'}\n- Lost IS Rank: ${((c.searchLostISRank || 0) * 100).toFixed(1)}% | Lost IS Budget: ${((c.searchLostISBudget || 0) * 100).toFixed(1)}%`).join('\n')}${contextBlock ? `\n\n${contextBlock}` : ''}\n\n=== ANALYSIS REQUIREMENTS ===\n1. Category performance assessment vs account averages\n2. Individual campaign comparison — winners vs underperformers\n3. Bidding strategy effectiveness — are targets being hit?\n4. Impression share opportunity analysis\n5. Scaling or reduction recommendation with € projections\n6. Use CONTEXT SIGNALS (if available) to enrich analysis with device/geo/hour insights\n\nMANDATORY CLOSING SECTIONS (DO NOT OMIT):\nYour Document 2 MUST end with these three sections from the output format:\n- Section 8: Scaling Scenarios (A/B/C — Conservative, Balanced, Aggressive)\n- Section 9: Decision Requests (3-5 concrete decisions for management to approve)\n- Section 10: Definition of Done (4-6 measurable success criteria for next 30 days)\nThe report is INCOMPLETE without these sections. Include them BEFORE the JSON block.\n\nAt the end, provide a JSON block wrapped in \`\`\`json tags:\n{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "string", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
    }

    if (level === 'account' || analysisType === 'account-overview') {
        const campaigns = enrichCampaignData(data.campaigns || []);
        const adGroups = data.adGroups || [];
        const keywords = data.keywords || [];
        const ads = data.ads || [];
        const negativeKeywords = data.negativeKeywords || [];

        const searchTermInputs: SearchTermInput[] | undefined = data.searchTerms?.map((st: any) => ({
            searchTerm: st.searchTerm || st.term || '',
            impressions: st.impressions || 0, clicks: st.clicks || 0,
            cost: st.cost || 0, conversions: st.conversions || 0, conversionValue: st.conversionValue || 0,
        }));

        const { healthBlock, ngramBlock } = runPreAnalysis(campaigns, adGroups, keywords, ads, negativeKeywords, searchTermInputs);

        const totalSpend = campaigns.reduce((sum: number, c: any) => sum + (c?.cost || 0), 0);
        const totalConversions = campaigns.reduce((sum: number, c: any) => sum + (c?.conversions || 0), 0);
        const totalConversionValue = campaigns.reduce((sum: number, c: any) => sum + (c?.conversionValue || 0), 0);
        const totalClicks = campaigns.reduce((sum: number, c: any) => sum + (c?.clicks || 0), 0);
        const totalImpressions = campaigns.reduce((sum: number, c: any) => sum + (c?.impressions || 0), 0);
        const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : 0;
        const avgCPA = totalConversions > 0 ? (totalSpend / totalConversions).toFixed(2) : 0;
        const accountROAS = totalSpend > 0 ? (totalConversionValue / totalSpend).toFixed(2) : 0;

        const breakdown: Record<string, { spend: number; conversions: number; convValue: number; campaigns: number }> = {};
        campaigns.forEach((c: any) => {
            const cat = c.category || 'other';
            if (!breakdown[cat]) breakdown[cat] = { spend: 0, conversions: 0, convValue: 0, campaigns: 0 };
            breakdown[cat].spend += c.cost || 0;
            breakdown[cat].conversions += c.conversions || 0;
            breakdown[cat].convValue += c.conversionValue || 0;
            breakdown[cat].campaigns += 1;
        });

        const breakdownStr = Object.entries(breakdown)
            .filter(([_, d]) => d.spend > 0)
            .sort(([, a], [, b]) => b.spend - a.spend)
            .map(([key, d]) => {
                const pct = totalSpend > 0 ? ((d.spend / totalSpend) * 100).toFixed(1) : 0;
                const roas = d.spend > 0 ? (d.convValue / d.spend).toFixed(2) : 'N/A';
                const label = key === 'pmax_sale' ? 'PMax - Sale' : key === 'pmax_aon' ? 'PMax - AON' :
                    key === 'search_dsa' ? 'Search - DSA' : key === 'search_nonbrand' ? 'Search - NonBrand' :
                        key === 'upper_funnel' ? 'Video/Display' : key === 'brand' ? 'Brand' : 'Other';
                return `- ${label}: €${d.spend.toFixed(0)} (${pct}%) | ${d.campaigns} campaigns | ${d.conversions.toFixed(1)} conv | ROAS ${roas}x`;
            }).join('\n');

        return `${languageInstruction}\n\n${dataInventory}\n\n${derivedMetrics}\n\n=== ACCOUNT OVERVIEW ANALYSIS MISSION ===\nProduce BOTH an Executive Summary and a Technical Analysis as specified in the output format.\n\nPRE-CALCULATED DATA:\nYou will receive two pre-calculated analysis blocks:\n1. ACCOUNT HEALTH SCORE — a weighted 0-100 score with category breakdowns.\n   USE THIS as the basis for your Diagnosis section. Do NOT recalculate the scores.\n2. N-GRAM ANALYSIS — word-level spend and conversion patterns from search terms.\n   USE THIS for your negative keyword recommendations and keyword expansion suggestions.\n\n${healthBlock}\n\n${ngramBlock}\n\n=== ACCOUNT TOTALS (PRE-CALCULATED — USE THESE EXACT VALUES) ===\n- Total Spend: €${totalSpend.toFixed(2)}\n- Total Conversions: ${totalConversions.toFixed(2)}\n- Total Conversion Value: €${totalConversionValue.toFixed(2)}\n- Account ROAS: ${accountROAS}x\n- Total Clicks: ${totalClicks.toLocaleString()}\n- Total Impressions: ${totalImpressions.toLocaleString()}\n- Average CTR: ${avgCTR}%\n- Average CPA: €${avgCPA}\n- Number of Campaigns: ${campaigns.length}\n${totalConversions < 30 ? 'WARNING: Account-level conversion volume is below 30. Conclusions are DIRECTIONAL.' : ''}\n\n=== STRATEGIC SPEND BREAKDOWN ===\n${breakdownStr || 'No breakdown available'}\n\n=== CAMPAIGNS DATA ===\n${campaigns.map((c: any) => `Campaign: ${c.name} | Status: ${c.status}\n- Spend: €${(c.cost || 0).toFixed(2)} | Conv: ${(c.conversions || 0).toFixed(2)} | Conv Value: €${(c.conversionValue || 0).toFixed(2)}\n- ROAS: ${c.cost > 0 ? ((c.conversionValue || 0) / c.cost).toFixed(2) : 0}x | CPA: €${c.conversions > 0 ? (c.cost / c.conversions).toFixed(2) : 'N/A'}\n- Bidding: ${c.biddingStrategyLabel} ${c.targetRoas ? `| tROAS: ${c.targetRoas}x` : ''} ${c.targetCpa ? `| tCPA: €${c.targetCpa}` : ''}\n- IS: ${((c.searchImpressionShare || 0) * 100).toFixed(1)}% | Lost IS Rank: ${((c.searchLostISRank || 0) * 100).toFixed(1)}% | Lost IS Budget: ${((c.searchLostISBudget || 0) * 100).toFixed(1)}%\n- Category: ${c.category || 'other'}`).join('\n')}${contextBlock ? `\n\n${contextBlock}` : ''}${pmaxBlock ? `\n\n${pmaxBlock}` : ''}\n\n=== ANALYSIS REQUIREMENTS ===\n1. Use the ACCOUNT HEALTH SCORE to structure your diagnosis\n2. Performance health assessment with statistical confidence note\n3. Strategic spend allocation analysis\n4. Smart Bidding effectiveness\n5. Impression share opportunity analysis\n6. Top scaling opportunities with € projections\n7. Risk flags requiring immediate attention\n${ngramBlock ? '8. Use N-GRAM ANALYSIS for negative keyword recommendations' : ''}\n9. Use CONTEXT SIGNALS to flag device/geo/hour skews and competitive pressure\n10. Flag landing page health issues (speed, mobile-friendliness)\n\nMANDATORY CLOSING SECTIONS (DO NOT OMIT):\nYour Document 2 MUST end with these three sections from the output format:\n- Section 8: Scaling Scenarios (A/B/C — Conservative, Balanced, Aggressive)\n- Section 9: Decision Requests (3-5 concrete decisions for management to approve)\n- Section 10: Definition of Done (4-6 measurable success criteria for next 30 days)\nThe report is INCOMPLETE without these sections. Include them BEFORE the JSON block.\n\nAt the end, provide a JSON block wrapped in \`\`\`json tags:\n{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "string", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
    }

    if (level === 'campaign') {
        const isPMax = data.campaign?.advertisingChannelType === 'PERFORMANCE_MAX' ||
            data.campaign?.name?.toLowerCase().includes('pmax');
        const assetGroups = data.assetGroups || [];

        if (isPMax && assetGroups.length > 0) {
            return `${languageInstruction}\n\n${dataInventory}\n\n=== PMAX CAMPAIGN ANALYSIS MISSION ===\nProduce BOTH an Executive Summary and a Technical Analysis.\n\nCampaign: ${data.campaign?.name || 'Unknown'} | Status: ${data.campaign?.status || 'UNKNOWN'}\nBidding: ${getBiddingLabel(data.campaign?.biddingStrategyType)}\n${data.campaign?.targetRoas ? `Target ROAS: ${data.campaign.targetRoas}x` : ''}\n\n=== ASSET GROUPS (${assetGroups.length} total) ===\n${assetGroups.map((ag: any) => `Asset Group: ${ag.name} | Status: ${ag.status}\n- Spend: €${(ag.cost || 0).toFixed(2)} | Conv: ${ag.conversions || 0} | ROAS: ${ag.cost > 0 ? ((ag.conversionValue || 0) / ag.cost).toFixed(2) : 0}x\n- CTR: ${(ag.ctr || 0).toFixed(2)}% | Clicks: ${ag.clicks || 0}`).join('\n')}${pmaxBlock ? `\n\n${pmaxBlock}` : ''}${contextBlock ? `\n\n${contextBlock}` : ''}\n\nAt the end, provide a JSON block wrapped in \`\`\`json tags:\n{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "string", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
        }

        const adGroups = data.adGroups || [];
        return `${languageInstruction}\n\n${dataInventory}\n\n=== SEARCH CAMPAIGN ANALYSIS MISSION ===\nProduce BOTH an Executive Summary and a Technical Analysis.\n\nCampaign: ${data.campaign?.name || 'Unknown'} | Bidding: ${getBiddingLabel(data.campaign?.biddingStrategyType)}\n\n=== AD GROUPS (${adGroups.length} total) ===\n${adGroups.map((ag: any) => `Ad Group: ${ag.name} | Status: ${ag.status}\n- Spend: €${(ag.cost || 0).toFixed(2)} | Conv: ${ag.conversions || 0} | ROAS: ${ag.roas || 0}x\n- CTR: ${(ag.ctr || 0).toFixed(2)}% | Avg QS: ${ag.avgQualityScore || 'N/A'} | Ad Strength: ${ag.adStrength || 'N/A'}`).join('\n')}${contextBlock ? `\n\n${contextBlock}` : ''}\n\nAt the end, provide a JSON block wrapped in \`\`\`json tags:\n{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "string", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
    }

    return `Analyze this Google Ads data and provide optimization recommendations. Produce BOTH an Executive Summary and a Technical Analysis.\n${JSON.stringify(data, null, 2)}`;
}

// ============================================
// STREAMING API ROUTE (single-pass, no expert mode)
// ============================================
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401, headers: { 'Content-Type': 'application/json' }
            });
        }

        // Rate limit: 5 AI analyses per minute per user
        const rl = rateLimitAI(session.user.id);
        if (!rl.success) {
            return new Response(JSON.stringify({ error: "Too many requests. Please wait before running another analysis." }), {
                status: 429, headers: { 'Content-Type': 'application/json', ...rl.headers }
            });
        }

        const data = await request.json();

        const hasData =
            (data.level === 'account' && data.campaigns?.length > 0) ||
            (data.level === 'campaign' && (data.adGroups?.length > 0 || data.assetGroups?.length > 0)) ||
            (data.level === 'adgroup' && data.adGroup) ||
            (data.level === 'strategic_category' && data.campaigns?.length > 0) ||
            (data.analysisType === 'category' && data.campaigns?.length > 0);

        if (!hasData) {
            return new Response(JSON.stringify({ error: "No data available to analyze" }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }

        const prompt = buildPrompt(data);
        const { language = 'bg' } = data;
        const isEn = language === 'en';

        // Each analysis is a clean snapshot — no RAG/history injection
        const finalPrompt = prompt;

        const systemPrompt = data.level === 'adgroup'
            ? undefined
            : `${ANALYSIS_SYSTEM_PROMPT_V3}\nLANGUAGE CONSTRAINT:\n${isEn
                ? "Your entire response MUST be in English. Campaign names may be in Bulgarian — translate insights."
                : "Целият ти отговор ТРЯБВА да бъде на български език."
            }`;

        // Model selection (allow override for A/B testing)
        // Using latest Claude model IDs — update here when new versions release
        const ALLOWED_MODELS: Record<string, string> = {
            'opus-4.6': 'claude-opus-4-6',
            'sonnet-4.6': 'claude-sonnet-4-6',   // default — latest Sonnet
            'haiku-4.5': 'claude-haiku-4-5-20251001',
            // Keep legacy aliases for backwards compatibility
            'sonnet-4.5': 'claude-sonnet-4-6',   // redirect old alias to current
        };
        const requestedModel = data.model ? ALLOWED_MODELS[data.model] : undefined;
        const modelId = requestedModel || 'claude-sonnet-4-6';
        const modelLabel = Object.entries(ALLOWED_MODELS).find(([, v]) => v === modelId)?.[0] || 'sonnet-4.6';

        // Stream from Anthropic with prompt caching on the system prompt.
        // The system prompt (ANALYSIS_SYSTEM_PROMPT_V3) is ~470 lines / ~6K tokens.
        // Caching it saves ~90% of input token cost on repeat calls (5-min cache window).
        // Cache write = 1.25x normal price; cache read = 0.1x normal price.
        const stream = anthropic.messages.stream({
            model: modelId,
            max_tokens: 16000,
            ...(systemPrompt ? {
                system: [
                    {
                        type: "text",
                        text: systemPrompt,
                        cache_control: { type: "ephemeral" },
                    }
                ]
            } : {}),
            messages: [{ role: "user", content: finalPrompt }],
        });

        let fullText = "";

        const readable = new ReadableStream({
            async start(controller) {
                try {
                    for await (const event of stream) {
                        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            const chunk = event.delta.text;
                            fullText += chunk;
                            controller.enqueue(new TextEncoder().encode(chunk));
                        }
                    }
                    // Store in Pinecone + log BEFORE closing stream
                    // (Vercel serverless may kill the function after controller.close())
                    try {
                        let contextLabel = 'Акаунт';
                        if (data.level === 'adgroup' && data.adGroup?.name) contextLabel = `AG: ${data.adGroup.name}`;
                        else if (data.level === 'campaign' && data.campaign?.name) contextLabel = `Camp: ${data.campaign.name}`;
                        else if (data.analysisType === 'category') contextLabel = `Cat: ${data.category || ''}`;

                        let periodLabel = '';
                        if (data.dateRange) {
                            const s = data.dateRange.start || data.dateRange.startDate;
                            const e = data.dateRange.end || data.dateRange.endDate;
                            if (s && e) periodLabel = ` (${s} — ${e})`;
                        }

                        const reportTitle = `[${modelLabel}] ${contextLabel} Analysis${periodLabel} - ${new Date().toLocaleDateString('bg-BG')}`;
                        const reportId = `insight_${data.level}_${data.analysisType || 'gen'}_${Date.now()}`;

                        await Promise.all([
                            // Save to SQL (Reliable History)
                            saveReport({
                                id: reportId,
                                customer_id: data.customerId || 'unknown',
                                template_id: `analysis_${data.level || 'account'}`,
                                title: reportTitle,
                                analysis: fullText,
                                audience: 'specialist',
                                language: data.language || 'bg',
                                model: modelLabel,
                                metadata: { level: data.level, analysisType: data.analysisType, periodLabel },
                            }),
                            // Save to Vector DB (Search/RAG)
                            upsertReport(reportId, fullText, {
                                customerId: data.customerId || 'unknown',
                                campaignId: data.campaignId || 'unknown',
                                timestamp: new Date().toISOString(),
                                type: 'ai_analysis',
                                title: reportTitle,
                                model: modelId,
                                analysis_content: fullText,
                            }),
                            session?.user?.id ? logActivity(session.user.id, 'AI_ANALYSIS', {
                                level: data.level,
                                analysisType: data.analysisType,
                                context: contextLabel,
                                streaming: true,
                            }) : Promise.resolve(),
                        ]);
                    } catch (storeErr) {
                        console.error("Post-stream storage failed:", storeErr);
                    }

                    controller.close();
                } catch (err) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    controller.enqueue(new TextEncoder().encode(`\n\n[ERROR: ${errMsg}]`));
                    controller.close();
                }
            }
        });

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Transfer-Encoding': 'chunked',
            },
        });

    } catch (error: any) {
        console.error("Stream analysis error:", error);
        return new Response(JSON.stringify({
            error: error.message || "Failed to analyze data",
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
