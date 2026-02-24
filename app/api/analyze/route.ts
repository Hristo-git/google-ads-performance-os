import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import anthropic from "@/lib/anthropic";
import { ANALYSIS_SYSTEM_PROMPT_V3, getAdGroupAnalysisPrompt, REPORT_TEMPLATES, buildAdvancedAnalysisPrompt } from "@/lib/prompts-v2";
import { upsertReport, querySimilarReports } from "@/lib/pinecone";
import { runPreAnalysis, type SearchTermInput } from "@/lib/account-health";
import { logActivity } from "@/lib/activity-logger";
import { prepareSearchTermData } from "@/lib/ai-data-prep";
import {
    getAuctionInsights,
    getConversionActions,
    getAudiencePerformance,
    getNetworkPerformance,
    getPMaxSearchInsights,
    getDemographicsPerformance
} from "@/lib/google-ads";
// ANALYSIS_SYSTEM_PROMPT_V3 and buildAdvancedAnalysisPrompt already imported above

// Allow up to 300s for 2-pass Claude Opus analysis (requires Vercel Pro)
export const maxDuration = 300;

// ============================================
// HELPER: Human-readable bidding strategy labels
// ============================================
const BIDDING_LABELS: Record<number | string, string> = {
    0: 'Unspecified',
    1: 'Unknown',
    2: 'Manual CPC',
    3: 'Manual CPM',
    4: 'Manual CPV',
    5: 'Maximize Conversions',
    6: 'Maximize Conversion Value',
    7: 'Target CPA',
    8: 'Target ROAS',
    9: 'Target Impression Share',
    10: 'Manual CPC (Enhanced)',
    11: 'Maximize Conversions',
    12: 'Maximize Conversion Value',
    13: 'Target Spend',
};

function getBiddingLabel(code: number | string | undefined): string {
    if (code === undefined || code === null) return 'N/A';
    return BIDDING_LABELS[code] || `Strategy ${code}`;
}

// ============================================
// HELPER: Enrich campaign data with readable labels
// ============================================
function enrichCampaignData(campaigns: any[]): any[] {
    return campaigns.map(c => ({
        ...c,
        biddingStrategyLabel: getBiddingLabel(c.biddingStrategyType),
    }));
}

// ============================================
// BUILD PROMPT (v3 — uses new Data Prep + System Prompt V3)
// ============================================
function buildPrompt(data: any): string {
    const { level, language = 'bg', analysisType, category } = data;
    const isEn = language === 'en';

    // 1. Prepare Data (Block 1)
    const rawSearchTerms = data.searchTerms || [];
    // Aggregate Total Cost for Validation
    const totalCampaignCost = (data.campaigns || []).reduce((acc: number, c: any) => acc + (c.cost || 0), 0);

    // Calculate days in period
    const start = new Date(data.dateRange?.startDate || data.dateRange?.start || Date.now());
    const end = new Date(data.dateRange?.endDate || data.dateRange?.end || Date.now());
    const daysInPeriod = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const periodStart = start.toISOString().split('T')[0];
    const periodEnd = end.toISOString().split('T')[0];



    const preparedData = prepareSearchTermData(
        rawSearchTerms,
        data.campaigns || [],
        totalCampaignCost,
        daysInPeriod,
        periodStart,
        periodEnd,
        data.auctionInsights || [],
        data.conversionActions || [],
        data.audiencePerformance || [],
        data.networkPerformance || [],
        data.pmaxInsights || [],
        data.demographicPerformance || [],
        language
    );

    // 2. Build Advanced Prompt (Block 2)
    // For Account Overview, use the new system
    if (level === 'account' || analysisType === 'account-overview') {
        const advancedContext = {
            daysInPeriod,
            periodStart,
            periodEnd,
        };
        return buildAdvancedAnalysisPrompt(preparedData, advancedContext);
    }

    // Fallback to V2 logic for other levels if needed, or implement V3 logic for them too.
    // Ideally, we should unify, but let's stick to the request for "Analysis Upgrade" which implies account/search term focus.
    // For now, if not account level, we might fall back to original logic or apply similar prep.
    // The user request was: "Upgrade this analysis... Block 1: Data Preparation... Block 2: Analysis Model".
    // This seems general but heavily implies Search Terms handling which is most critical at Account/Campaign/AdGroup levels.
    // Let's apply V3 logic primarily where Search Terms are key.

    // ... (Existing V2 Logic for other levels - simplified for brevity, in real impl we'd use full file) ...
    // NOTE: To avoid breaking existing functionality for other levels, I'll return the V2 prompt builder logic 
    // for non-account levels for now, OR I can try to adapt V3.
    // Given the complexity, I will use V3 for Account level where the request originated (context of "Account Overview").

    // Re-using V2 logic for compatibility if NOT Account Level
    // (Copied from original file, but omitted here to save context space if I can just reference it? No, I must replace entire file content)
    // So I will paste the original logic back for non-Account levels.

    const languageInstruction = isEn
        ? 'IMPORTANT: Your entire response MUST be in English language.'
        : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

    if (level === 'adgroup') {
        return getAdGroupAnalysisPrompt(data, language);
    }

    if (analysisType === 'category' && category) {
        // ... (Original V2 Category Logic) ...
        const campaigns = enrichCampaignData(data.campaigns || []);
        const categoryLabels: Record<string, string> = {
            pmax_aon: 'Performance Max (AON)',
            pmax_sale: 'Performance Max (Sale)',
            search_nonbrand: 'Search Non-Brand',
            brand: 'Brand',
            search_dsa: 'Dynamic Search Ads',
            shopping: 'Shopping',
            upper_funnel: 'Video/Display'
        };

        const categoryName = categoryLabels[category] || category;
        const totalSpend = campaigns.reduce((sum: number, c: any) => sum + (c?.cost || 0), 0);
        const totalConversions = campaigns.reduce((sum: number, c: any) => sum + (c?.conversions || 0), 0);
        const totalConversionValue = campaigns.reduce((sum: number, c: any) => sum + (c?.conversionValue || 0), 0);
        const categoryROAS = totalSpend > 0 ? (totalConversionValue / totalSpend).toFixed(2) : 0;

        return `${languageInstruction}

=== CATEGORY ANALYSIS MISSION: ${categoryName} ===
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== STATISTICAL CONTEXT ===
Total Campaigns: ${campaigns.length}
Total Spend: €${totalSpend.toFixed(2)}
Total Conversions: ${totalConversions.toFixed(2)}
Total Conversion Value: €${totalConversionValue.toFixed(2)}
Category ROAS: ${categoryROAS}x
${totalConversions < 30 ? 'WARNING: Conversion volume is below 30. All performance conclusions are DIRECTIONAL ONLY.' : ''}

=== CAMPAIGNS IN THIS CATEGORY ===
${campaigns.map((c: any) => `
Campaign: ${c.name}
- Spend: €${(c.cost || 0).toFixed(2)} | Conv: ${c.conversions || 0} | Conv Value: €${(c.conversionValue || 0).toFixed(2)}
- ROAS: ${c.cost > 0 ? ((c.conversionValue || 0) / c.cost).toFixed(2) : 0}x | CPA: €${c.conversions > 0 ? (c.cost / c.conversions).toFixed(2) : 'N/A'}
- Bidding: ${c.biddingStrategyLabel} ${c.targetRoas ? `| Target ROAS: ${c.targetRoas}x` : ''} ${c.targetCpa ? `| Target CPA: €${c.targetCpa}` : ''}
- Status: ${c.status || 'N/A'}
- Lost IS Rank: ${((c.searchLostISRank || 0) * 100).toFixed(1)}% | Lost IS Budget: ${((c.searchLostISBudget || 0) * 100).toFixed(1)}%
`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
1. Category performance assessment vs account averages
2. Individual campaign comparison — winners vs underperformers
3. Bidding strategy effectiveness — are targets being hit?
4. Impression share opportunity analysis
5. Scaling or reduction recommendation with € projections

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "string", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
    }

    if (level === 'campaign') {
        // ... (Original V2 Campaign Logic) ...
        const isPMax = data.campaign?.advertisingChannelType === 'PERFORMANCE_MAX' ||
            data.campaign?.name?.toLowerCase().includes('pmax') ||
            data.campaign?.name?.toLowerCase().includes('performance_max');
        const assetGroups = data.assetGroups || [];

        if (isPMax && assetGroups.length > 0) {
            return `${languageInstruction}

=== PMAX CAMPAIGN ANALYSIS MISSION ===
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

Campaign: ${data.campaign?.name || 'Unknown'} | Status: ${data.campaign?.status || 'UNKNOWN'}
Bidding: ${getBiddingLabel(data.campaign?.biddingStrategyType)}
${data.campaign?.targetRoas ? `Target ROAS: ${data.campaign.targetRoas}x` : ''}
${data.campaign?.targetCpa ? `Target CPA: €${data.campaign.targetCpa}` : ''}

=== ASSET GROUPS (${assetGroups.length} total) ===
${assetGroups.map((ag: any) => `
Asset Group: ${ag.name} | Status: ${ag.status}
- Spend: €${(ag.cost || 0).toFixed(2)} | Conv: ${ag.conversions || 0} | Conv Value: €${(ag.conversionValue || 0).toFixed(2)}
- ROAS: ${ag.cost > 0 ? ((ag.conversionValue || 0) / ag.cost).toFixed(2) : 0}x
- CTR: ${(ag.ctr || 0).toFixed(2)}% | Clicks: ${ag.clicks || 0} | Impressions: ${ag.impressions || 0}
`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
1. Asset group performance comparison — identify winners and laggards
2. Creative asset quality assessment — which groups need more/better assets
3. Spend distribution analysis — is budget flowing to the best performers?
4. Scaling potential at asset group level with € projections
5. Recommendations for new asset groups or consolidation

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "string", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
        }

        const adGroups = data.adGroups || [];
        const totalConversions = adGroups.reduce((sum: number, ag: any) => sum + (ag.conversions || 0), 0);

        return `${languageInstruction}

=== SEARCH CAMPAIGN ANALYSIS MISSION ===
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

Campaign: ${data.campaign?.name || 'Unknown'} | Status: ${data.campaign?.status || 'UNKNOWN'}
Bidding: ${getBiddingLabel(data.campaign?.biddingStrategyType)}
${data.campaign?.targetRoas ? `Target ROAS: ${data.campaign.targetRoas}x` : ''}
${data.campaign?.targetCpa ? `Target CPA: €${data.campaign.targetCpa}` : ''}

=== STATISTICAL CONTEXT ===
Total ad groups: ${adGroups.length}
Total conversions across ad groups: ${totalConversions}
${totalConversions < 30 ? 'WARNING: Conversion volume is below 30. Conclusions are DIRECTIONAL ONLY.' : ''}

=== AD GROUPS (${adGroups.length} total) ===
${adGroups.map((ag: any) => `
Ad Group: ${ag.name} | Status: ${ag.status}
- Spend: €${(ag.cost || 0).toFixed(2)} | Conv: ${ag.conversions || 0} | ROAS: ${ag.roas || 0}x
- CTR: ${(ag.ctr || 0).toFixed(2)}% | Avg QS: ${ag.avgQualityScore || 'N/A'}
- Ad Strength: ${ag.adStrength || 'N/A'} | Ads Count: ${ag.adsCount || 0} | Poor Ads: ${ag.poorAdsCount || 0}
`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
1. Quality Score patterns across ad groups — identify systemic issues
2. Ad Strength audit — flag ad groups with POOR/AVERAGE strength or >3 RSA ads
3. Performance distribution — which ad groups drive results vs waste budget
4. Structural assessment — is the campaign properly segmented by intent?
5. Top 3 optimization recommendations with € impact estimates

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "string", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
    }

    if (level === 'strategic_category') {
        // ... (Original V2 Strategic Category Logic) ...
        const campaigns = enrichCampaignData(data.campaigns || []);
        const { categoryName = 'Unknown', categoryKey = '', strategicBreakdown = {} } = data;
        const categoryData = strategicBreakdown[categoryKey] || {};

        const totalSpend = campaigns.reduce((sum: number, c: any) => sum + (c?.cost || 0), 0);
        const totalConversions = campaigns.reduce((sum: number, c: any) => sum + (c?.conversions || 0), 0);
        const totalConversionValue = campaigns.reduce((sum: number, c: any) => sum + (c?.conversionValue || 0), 0);
        const totalClicks = campaigns.reduce((sum: number, c: any) => sum + (c?.clicks || 0), 0);
        const totalImpressions = campaigns.reduce((sum: number, c: any) => sum + (c?.impressions || 0), 0);
        const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : 0;
        const avgCPA = totalConversions > 0 ? (totalSpend / totalConversions).toFixed(2) : 'N/A';
        const categoryROAS = totalSpend > 0 ? (totalConversionValue / totalSpend).toFixed(2) : 'N/A';

        return `${languageInstruction}

=== STRATEGIC CATEGORY ANALYSIS MISSION: ${categoryName} ===
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== CATEGORY OVERVIEW ===
Category: ${categoryName}
Campaigns: ${campaigns.length}
Total Spend: €${totalSpend.toFixed(2)} (${categoryData.percentage?.toFixed(1) || 'N/A'}% of account)
Total Conversions: ${totalConversions.toFixed(2)}
Total Conv Value: €${totalConversionValue.toFixed(2)}
Category ROAS: ${categoryROAS}x
Average CPA: €${avgCPA}
Average CTR: ${avgCTR}%
${totalConversions < 30 ? 'WARNING: Conversion volume is below 30. Conclusions are DIRECTIONAL ONLY.' : ''}

=== CAMPAIGNS IN THIS CATEGORY ===
${campaigns.map((c: any) => `
Campaign: ${c.name} | Status: ${c.status}
- Spend: €${(c.cost || 0).toFixed(2)} | Conv: ${(c.conversions || 0).toFixed(2)} | Conv Value: €${(c.conversionValue || 0).toFixed(2)}
- ROAS: ${c.cost > 0 ? ((c.conversionValue || 0) / c.cost).toFixed(2) : 0}x | CPA: €${c.conversions > 0 ? (c.cost / c.conversions).toFixed(2) : 'N/A'}
- Bidding: ${c.biddingStrategyLabel} ${c.targetRoas ? `| tROAS: ${c.targetRoas}x` : ''} ${c.targetCpa ? `| tCPA: €${c.targetCpa}` : ''}
- IS: ${((c.searchImpressionShare || 0) * 100).toFixed(1)}% | Lost IS Rank: ${((c.searchLostISRank || 0) * 100).toFixed(1)}% | Lost IS Budget: ${((c.searchLostISBudget || 0) * 100).toFixed(1)}%
`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
1. Category performance assessment — is spend allocation appropriate for its strategic role?
2. Campaign-level comparison — identify top performers vs underperformers
3. Bidding strategy effectiveness — are targets being met?
4. Scale vs reduce recommendation with € projections
5. Within-category budget reallocation opportunities

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "string", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
    }

    // Default Fallback
    return `Analyze this Google Ads data and provide optimization recommendations. Produce BOTH an Executive Summary and a Technical Analysis.\n${JSON.stringify(data, null, 2)}`;
}

// ============================================
// API ROUTE
// ============================================
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const data = await request.json();

        // Validate data
        const hasData =
            (data.level === 'account' && data.campaigns?.length > 0) ||
            (data.level === 'campaign' && (data.adGroups?.length > 0 || data.assetGroups?.length > 0)) ||
            (data.level === 'adgroup' && data.adGroup) ||
            (data.level === 'strategic_category' && data.campaigns?.length > 0) ||
            (data.analysisType === 'category' && data.campaigns?.length > 0);

        if (!hasData) {
            return NextResponse.json(
                { error: "No data available to analyze" },
                { status: 400 }
            );
        }

        // --- ENRICHMENT: Server-Side Data Fetching ---
        // Fetch additional context that isn't sent by the client (to reduce payload/latency on client)
        if (session.refreshToken && (data.level === 'account' || data.analysisType === 'account-overview')) {
            try {
                // Construct Date Range (YYYY-MM-DD)
                const start = new Date(data.dateRange?.startDate || data.dateRange?.start || Date.now()).toISOString().split('T')[0];
                const end = new Date(data.dateRange?.endDate || data.dateRange?.end || Date.now()).toISOString().split('T')[0];
                const dateRange = { start, end };
                const customerId = data.customerId;

                // IDs for filtering
                const campaignIds = data.campaigns?.map((c: any) => c.id).filter(Boolean);

                console.log(`[AI Analysis] Fetching enriched data for ${customerId}...`);

                const [
                    auctionInsights,
                    conversionActions,
                    audiencePerformance,
                    networkPerformance,
                    demographics
                ] = await Promise.all([
                    getAuctionInsights(session.refreshToken, undefined, customerId, dateRange),
                    getConversionActions(session.refreshToken, customerId, dateRange),
                    getAudiencePerformance(session.refreshToken, customerId, dateRange, campaignIds),
                    getNetworkPerformance(session.refreshToken, customerId, dateRange, campaignIds),
                    getDemographicsPerformance(session.refreshToken, customerId, dateRange)
                ]);

                // Attach to data object for buildPrompt
                data.auctionInsights = auctionInsights;
                data.conversionActions = conversionActions;
                data.audiencePerformance = audiencePerformance;
                data.networkPerformance = networkPerformance;
                data.demographicPerformance = demographics;

                // Fetch PMax insights only if we have PMax campaigns
                const pmaxCampaigns = data.campaigns?.filter((c: any) =>
                    c.advertisingChannelType === 'PERFORMANCE_MAX' ||
                    c.name?.toLowerCase().includes('pmax')
                ) || [];

                if (pmaxCampaigns.length > 0) {
                    // Fetch for top 3 PMax campaigns to avoid timeouts
                    const topPMax = pmaxCampaigns.slice(0, 3);
                    const pmaxInsightsPromises = topPMax.map((c: any) =>
                        getPMaxSearchInsights(session.refreshToken!, c.id, customerId)
                    );
                    const pmaxResults = await Promise.all(pmaxInsightsPromises);
                    data.pmaxInsights = pmaxResults.flat();
                }

                console.log(`[AI Analysis] Enriched data fetched: ${auctionInsights.length} auction, ${conversionActions.length} conv actions`);

            } catch (enrichError) {
                console.error("[AI Analysis] Data enrichment failed, proceeding with partial data:", enrichError);
                // Swallow error to allow partial analysis
            }
        }

        const promptBuilder = buildPrompt(data);
        const { language = 'bg' } = data;
        const isEn = language === 'en';

        // --- RAG: Retrieve past reports for context ---
        let historyContext = "";
        const currentCustomerId = data.customerId || undefined;
        try {
            // Construct a search query based on available data
            let searchQuery = `${data.level} analysis`;
            if (data.analysisType === 'category' && data.category) {
                searchQuery += ` ${data.category}`;
            } else if (data.level === 'campaign' && data.campaign?.name) {
                searchQuery += ` ${data.campaign.name}`;
            }

            const matches = await querySimilarReports(searchQuery, currentCustomerId, 2);

            if (matches && matches.length > 0) {
                const pastAnalyses = (matches as any[]).map((m: any, i: number) =>
                    `### PAST ANALYSIS ${i + 1} (${m.metadata?.timestamp || 'unknown date'})\n${m.metadata?.analysis_content || m.analysis_content || ''}`
                ).join('\n\n');

                historyContext = isEn
                    ? `\n\n=== SEMANTIC MEMORY: PREVIOUS ANALYSES ===\nBelow are relevant findings from previous reports. Use them to track progress, note if recommendations were followed, and ensure continuity.\n\n${pastAnalyses}`
                    : `\n\n=== СЕМАНТИЧНА ПАМЕТ: ПРЕДИШНИ АНАЛИЗИ ===\nПо-долу са подходящи констатации от предишни отчети. Използвайте ги, за да проследите прогреса, да отбележите дали препоръките са били спазени и да осигурите приемственост.\n\n${pastAnalyses}`;
            }
        } catch (ragError) {
            console.warn("RAG retrieval failed, proceeding without history:", ragError);
        }

        // Add history to prompt if available
        const finalPrompt = historyContext ? `${promptBuilder}\n${historyContext}` : promptBuilder;

        // Use V3 System Prompt for ALL levels to ensure enforcement of Data Enrichment & Interpretation Rules
        const systemPrompt = data.level === 'adgroup'
            ? undefined // Included in getAdGroupAnalysisPrompt (which uses V3 internal instructions now)
            : `${ANALYSIS_SYSTEM_PROMPT_V3}
LANGUAGE CONSTRAINT:
${isEn ? "Your entire response MUST be in English." : "Целият ти отговор ТРЯБВА да бъде на български език."}`;

        // Model selection (allow override for A/B testing)
        const ALLOWED_MODELS: Record<string, string> = {
            'opus-4.6': 'claude-opus-4-6',
            'sonnet-4.6': 'claude-sonnet-4-6',
            'sonnet-4.5': 'claude-sonnet-4-5-20250929',
            'haiku-4.5': 'claude-haiku-4-5-20251001',
        };
        const requestedModel = data.model ? ALLOWED_MODELS[data.model] : undefined;
        const modelId = requestedModel || 'claude-sonnet-4-6';

        console.log(`[AI Analysis] Level: ${data.level}, Prompt: ${finalPrompt.length} chars, Language: ${language}, Model: ${modelId}, Version: V3 (Enforced)`);

        const response = await anthropic.messages.create({
            model: modelId,
            max_tokens: 20000,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: [
                {
                    role: "user",
                    content: finalPrompt
                }
            ],
        });

        let analysis = response.content[0].type === 'text' ? response.content[0].text : 'No text output';

        // --- EXPERT MODE (2-Pass Refinement) ---
        // We default to Expert Mode for Strategic Insights as requested ("more advanced").
        const useExpertMode = data.expertMode !== false; // Default to true unless explicitly disabled

        if (useExpertMode) {
            console.log('[AI Analysis] Expert Mode enabled: Running second pass for refinement');

            const expertPrompt = isEn
                ? `You are a senior performance marketing expert reviewing the following AI-generated analysis.

${isEn ? "IMPORTANT: Your entire response MUST be in English." : "IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език."}

=== ORIGINAL ANALYSIS ===
${analysis}

=== YOUR TASK ===
1. **Evaluate** the quality of this analysis:
   - Are recommendations specific enough?
   - Are there any missing insights?
   - Is the prioritization logical?

2. **Enhance** the analysis:
   - Add depth where it's surface-level
   - Provide more specific numbers/examples
   - Sharpen recommendations

3. **Rewrite** the final output as an improved version.

Output the enhanced analysis in the same structure and format, but with deeper insights and more actionable recommendations.`
                : `Ти си senior performance marketing експерт, преглеждащ следния AI-генериран анализ.

${isEn ? "IMPORTANT: Your entire response MUST be in English." : "IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език."}

=== ОРИГИНАЛЕН АНАЛИЗ ===
${analysis}

=== ТВОЯТА ЗАДАЧА ===
1. **Оцени** качеството на този анализ:
   - Достатъчно ли специфични са препоръките?
   - Липсват ли важни прозрения?
   - Логична ли е приоритизацията?

2. **Подобри** анализа:
   - Добави дълбочина там, където е повърхностен
   - Предостави по-конкретни числа/примери
   - Изостри препоръките

3. **Препиши** финалния output като подобрена версия.

Изведи подобрения анализ в същата структура и формат, но с по-дълбоки прозрения и по-action-able препоръки.`;

            const secondPassResponse = await anthropic.messages.create({
                model: modelId,
                max_tokens: 20000,
                ...(systemPrompt ? { system: systemPrompt } : {}),
                messages: [
                    {
                        role: "user",
                        content: expertPrompt
                    }
                ],
            });

            analysis = secondPassResponse.content[0].type === 'text' ? secondPassResponse.content[0].text : analysis;
        }

        // Store in Pinecone and log activity
        try {
            // Build descriptive title
            let contextLabel = 'Акаунт';
            if (data.level === 'adgroup' && data.adGroup?.name) {
                contextLabel = `AG: ${data.adGroup.name}`;
            } else if (data.level === 'campaign' && data.campaign?.name) {
                contextLabel = `Camp: ${data.campaign.name}`;
            } else if (data.analysisType === 'category') {
                contextLabel = `Cat: ${data.category || data.categoryKey}`;
            }

            // Format date range
            let periodLabel = '';
            if (data.dateRange) {
                const start = data.dateRange.start || data.dateRange.startDate || data.dateRange.from;
                const end = data.dateRange.end || data.dateRange.endDate || data.dateRange.to;
                if (start && end) {
                    periodLabel = ` (${start} — ${end})`;
                }
            }

            const reportTitle = `${contextLabel} Analysis${periodLabel} - ${new Date().toLocaleDateString('bg-BG')}`;

            // Log activity
            if (session?.user?.id) {
                await logActivity(session.user.id, 'AI_ANALYSIS', {
                    level: data.level,
                    analysisType: data.analysisType,
                    context: contextLabel,
                    promptLength: promptBuilder?.length || 0,
                    responseLength: analysis?.length || 0,
                    expertMode: useExpertMode
                });
            }

            // Upsert report
            const reportId = `insight_${data.level}_${data.analysisType || 'gen'}_${Date.now()}`;
            await upsertReport(reportId, analysis, {
                customerId: data.customerId || 'unknown',
                campaignId: data.campaignId || 'unknown',
                timestamp: new Date().toISOString(),
                type: 'ai_analysis',
                title: reportTitle,
                analysis_content: analysis
            });

        } catch (storeError) {
            console.error("Failed to store/log insight:", storeError);
        }

        return NextResponse.json({ analysis });

    } catch (error: any) {
        console.error("Analysis error:", error);
        return NextResponse.json(
            {
                error: error.message || "Failed to analyze data",
                details: error.status ? `Status ${error.status}: ${JSON.stringify(error.error || {})}` : String(error)
            },
            { status: 500 }
        );
    }
}
