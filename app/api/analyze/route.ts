import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import anthropic from "@/lib/anthropic";
import { ANALYSIS_SYSTEM_PROMPT, getAdGroupAnalysisPrompt, REPORT_TEMPLATES } from "@/lib/prompts";
import { upsertReport, querySimilarReports } from "@/lib/pinecone";
import { runPreAnalysis, type SearchTermInput } from "@/lib/account-health";
import { logActivity } from "@/lib/activity-logger";

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
// BUILD PROMPT (v2 — uses system prompt framework)
// ============================================
function buildPrompt(data: any): string {
    const { level, language = 'bg', analysisType, category } = data;
    const isEn = language === 'en';

    const languageInstruction = isEn
        ? 'IMPORTANT: Your entire response MUST be in English language.'
        : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

    // ============================================
    // AD GROUP LEVEL — use dedicated v2 prompt
    // ============================================
    if (level === 'adgroup') {
        return getAdGroupAnalysisPrompt(data, language);
    }

    // ============================================
    // CATEGORY-SPECIFIC ANALYSIS
    // ============================================
    if (analysisType === 'category' && category) {
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

    // ============================================
    // ACCOUNT LEVEL
    // ============================================
    if (level === 'account' || analysisType === 'account-overview') {
        const campaigns = enrichCampaignData(data.campaigns || []);
        const adGroups = data.adGroups || [];
        const keywords = data.keywords || [];
        const ads = data.ads || [];
        const negativeKeywords = data.negativeKeywords || [];

        // Convert search terms to the expected format (if available)
        const searchTermInputs: SearchTermInput[] | undefined = data.searchTerms?.map((st: any) => ({
            searchTerm: st.searchTerm || st.term || '',
            impressions: st.impressions || 0,
            clicks: st.clicks || 0,
            cost: st.cost || 0,
            conversions: st.conversions || 0,
            conversionValue: st.conversionValue || 0,
        }));

        // Run pre-analysis for health score and n-grams
        const { healthBlock, ngramBlock } = runPreAnalysis(
            campaigns,
            adGroups,
            keywords,
            ads,
            negativeKeywords,
            searchTermInputs
        );

        const totalSpend = campaigns.reduce((sum: number, c: any) => sum + (c?.cost || 0), 0);
        const totalConversions = campaigns.reduce((sum: number, c: any) => sum + (c?.conversions || 0), 0);
        const totalConversionValue = campaigns.reduce((sum: number, c: any) => sum + (c?.conversionValue || 0), 0);
        const totalClicks = campaigns.reduce((sum: number, c: any) => sum + (c?.clicks || 0), 0);
        const totalImpressions = campaigns.reduce((sum: number, c: any) => sum + (c?.impressions || 0), 0);
        const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : 0;
        const avgCPA = totalConversions > 0 ? (totalSpend / totalConversions).toFixed(2) : 0;
        const accountROAS = totalSpend > 0 ? (totalConversionValue / totalSpend).toFixed(2) : 0;

        // Strategic breakdown
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
                const label = key === 'pmax_sale' ? 'PMax - Sale' :
                    key === 'pmax_aon' ? 'PMax - AON' :
                        key === 'search_dsa' ? 'Search - DSA' :
                            key === 'search_nonbrand' ? 'Search - NonBrand' :
                                key === 'upper_funnel' ? 'Video/Display' :
                                    key === 'brand' ? 'Brand' : 'Other';
                return `- ${label}: €${d.spend.toFixed(0)} (${pct}%) | ${d.campaigns} campaigns | ${d.conversions.toFixed(1)} conv | ROAS ${roas}x`;
            })
            .join('\n');

        return `${languageInstruction}

=== ACCOUNT OVERVIEW ANALYSIS MISSION ===
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

PRE-CALCULATED DATA:
You will receive two pre-calculated analysis blocks:
1. ACCOUNT HEALTH SCORE — a weighted 0-100 score with category breakdowns. 
   USE THIS as the basis for your Diagnosis section. Do NOT recalculate the scores.
   You SHOULD interpret them, add context, and prioritize actions based on them.
2. N-GRAM ANALYSIS — word-level spend and conversion patterns from search terms.
   USE THIS for your negative keyword recommendations and keyword expansion suggestions.
   The negative candidates list is pre-filtered (€1+ spend, 0 conversions, 2+ terms).
   Add your expert judgment on which are safe to add as negatives vs. which need review.

${healthBlock}

${ngramBlock}

=== ACCOUNT TOTALS (PRE-CALCULATED — USE THESE EXACT VALUES) ===
- Total Spend: €${totalSpend.toFixed(2)}
- Total Conversions: ${totalConversions.toFixed(2)}
- Total Conversion Value: €${totalConversionValue.toFixed(2)}
- Account ROAS: ${accountROAS}x
- Total Clicks: ${totalClicks.toLocaleString()}
- Total Impressions: ${totalImpressions.toLocaleString()}
- Average CTR: ${avgCTR}%
- Average CPA: €${avgCPA}
- Number of Campaigns: ${campaigns.length}
${totalConversions < 30 ? 'WARNING: Account-level conversion volume is below 30. Conclusions are DIRECTIONAL.' : ''}

=== STRATEGIC SPEND BREAKDOWN ===
${breakdownStr || 'No breakdown available'}

=== CAMPAIGNS DATA ===
${campaigns.map((c: any) => `
Campaign: ${c.name} | Status: ${c.status}
- Spend: €${(c.cost || 0).toFixed(2)} | Conv: ${(c.conversions || 0).toFixed(2)} | Conv Value: €${(c.conversionValue || 0).toFixed(2)}
- ROAS: ${c.cost > 0 ? ((c.conversionValue || 0) / c.cost).toFixed(2) : 0}x | CPA: €${c.conversions > 0 ? (c.cost / c.conversions).toFixed(2) : 'N/A'}
- Bidding: ${c.biddingStrategyLabel} ${c.targetRoas ? `| tROAS: ${c.targetRoas}x` : ''} ${c.targetCpa ? `| tCPA: €${c.targetCpa}` : ''}
- IS: ${((c.searchImpressionShare || 0) * 100).toFixed(1)}% | Lost IS Rank: ${((c.searchLostISRank || 0) * 100).toFixed(1)}% | Lost IS Budget: ${((c.searchLostISBudget || 0) * 100).toFixed(1)}%
- Category: ${c.category || 'other'}
`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
1. Use the ACCOUNT HEALTH SCORE to structure your diagnosis — focus on CRITICAL and WARNING items first
2. Performance health assessment with statistical confidence note
3. Strategic spend allocation analysis (Brand vs Non-Brand balance, PMax vs Search)
4. Smart Bidding effectiveness — flag campaigns deviating >20% from targets
5. Impression share opportunity analysis — rank vs budget separation
6. Top scaling opportunities with € projections
7. Risk flags requiring immediate attention
${ngramBlock ? '8. Use N-GRAM ANALYSIS for negative keyword recommendations and keyword expansion suggestions' : ''}

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "string", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
    }

    // ============================================
    // CAMPAIGN LEVEL
    // ============================================
    if (level === 'campaign') {
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

        // Search campaign
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

    // ============================================
    // STRATEGIC CATEGORY
    // ============================================
    if (level === 'strategic_category') {
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

    // Fallback
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

        // For adgroup level, the system prompt is already embedded in getAdGroupAnalysisPrompt
        // For other levels, we need to add it as the system message
        const systemPrompt = data.level === 'adgroup'
            ? undefined  // Already included in the prompt via getAdGroupAnalysisPrompt
            : `${ANALYSIS_SYSTEM_PROMPT}
LANGUAGE CONSTRAINT:
${isEn
                ? "Your entire response MUST be in English. Campaign names may be in Bulgarian — translate insights."
                : "Целият ти отговор ТРЯБВА да бъде на български език."
            }`;

        console.log(`[AI Analysis] Level: ${data.level}, Prompt: ${finalPrompt.length} chars, Language: ${language}`);

        const response = await anthropic.messages.create({
            model: "claude-opus-4-6",
            max_tokens: 16000,  // Increased to support two-document output
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
                model: "claude-opus-4-6",
                max_tokens: 16000,
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
