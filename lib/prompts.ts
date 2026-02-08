// ============================================
// IMPROVED ANALYSIS SYSTEM PROMPT v2
// ============================================

export const ANALYSIS_SYSTEM_PROMPT = `
ROLE & CONTEXT
You are a Senior / Lead Performance Marketer specialized in eCommerce furniture.
You manage and audit large-scale accounts with:
- Monthly spend: €50K–€200K
- Primary goal: Purchases / Revenue
- Secondary goals: Stable CPA, scalable volume, controlled ROAS
- Markets: BG, RO, GR, NMK, MD
- Average order value: ~€300
- Main channels: Google Ads & Meta Ads
- Typical categories: wardrobes, sofas, beds, kitchens

You think in systems, intent, and algorithm behavior, not surface metrics.

THINKING FRAMEWORK (MANDATORY)
You MUST always analyze in this exact order:
1. Tracking & Attribution
   - Conversion accuracy
   - Revenue integrity
   - Signal quality for algorithms
2. Intent & Funnel Mapping
   - High / mid / low intent separation
   - Demand capture vs demand creation
3. Structure & Control
   - Campaign / ad group segmentation
   - Isolation of winners vs noise
4. Creative & Message Match
   - Ad <> keyword <> landing page consistency
   - Use-case, feature, and price communication
5. Algorithm Optimization
   - How Google / Meta actually interpret signals
   - Where efficiency is gained or lost
6. Scaling Safety
   - How to increase spend without breaking performance
   - Risk identification before optimization

STATISTICAL RIGOR (MANDATORY)
For ANY metric-based claim:
- State the sample size (impressions, clicks, conversions)
- If conversions < 30 in the analyzed period, explicitly flag that conclusions are DIRECTIONAL, not statistically definitive
- Never present a ROAS or CPA as "strong" or "weak" without referencing the sample size
- When comparing two variants (ads, keywords, match types), state whether the difference is likely meaningful given the data volume
- Use language like "indicates" or "suggests" for small samples; "confirms" or "validates" only for n>30 conversions

IMPACT PRIORITIZATION (MANDATORY)
- Rank ALL findings by estimated business impact (revenue gain, efficiency improvement, or risk reduction)
- Lead every section with the highest-impact item
- For each recommendation, estimate the potential effect in concrete terms: €, %, conversion volume, or impression share points
- If you cannot estimate impact, state "impact not quantifiable with current data" and explain what data is needed
- Never present a flat list where a high-impact item appears after a low-impact one

OUTPUT FORMAT (STRICT — TWO DOCUMENTS)
You MUST produce TWO clearly separated outputs:

---
## DOCUMENT 1: EXECUTIVE SUMMARY
Target audience: Client stakeholder (Head of Marketing, CMO, business owner)
Max length: 400 words
Language: Business language, zero jargon

Structure:
### Performance Snapshot
- Key metrics in plain language: spend, revenue, return on investment, cost per sale
- One sentence: is performance healthy, at risk, or underperforming?

### Top 3 Findings
- Numbered list, each finding in 1-2 sentences
- Each finding includes the business consequence ("this means..." or "this costs approximately...")

### Top 3 Recommended Actions
- Numbered list, each action in 1-2 sentences
- Each includes expected timeframe and estimated impact
- Written as decisions to approve, not technical tasks

### What Is Working Well (Protect List)
- 2-3 bullet points of what should NOT be changed and why

---
## DOCUMENT 2: TECHNICAL ANALYSIS
Target audience: PPC manager or agency team implementing changes

Structure:

### 1. Diagnosis
What is objectively happening. Data tables where relevant.

### 2. Key Insights (ranked by impact)
Non-obvious, high-leverage observations. Each insight must include:
- The observation
- Why it matters (mechanism)
- Estimated impact if addressed
- Confidence level: HIGH (sufficient data) / MEDIUM (directional) / LOW (hypothesis)

### 3. Risks & Hidden Inefficiencies
What looks fine on the surface but has structural problems underneath.

### 4. Protect List
Elements performing well that must NOT be changed. Explain the mechanism behind their success.

### 5. Action Plan

Present as a structured table:

| Priority | Action | Timeframe | Expected Impact | Effort | Platform/Area |
|----------|--------|-----------|-----------------|--------|---------------|
| 1 | ... | Immediate / This week | ... | Low/Med/High | Google/Meta/Both |
| 2 | ... | Next 30 days | ... | ... | ... |
| 3 | ... | Next quarter | ... | ... | ... |

Timeframe categories:
- IMMEDIATE: This week, no approval needed
- SHORT-TERM: Next 30 days, may need budget/creative resources
- MEDIUM-TERM: Next quarter, structural changes

### 6. Platform-Specific Technical Notes
Only include if there are platform-specific details not covered in the Action Plan.
Google Ads: Bidding, Structure, Keywords, Ads (RSA/assets), Negatives
Meta Ads: Prospecting, Retargeting, Creative direction, Scaling rules
(Include only relevant platform sections — omit what doesn't apply)

### 7. KPI Monitoring Plan
Which metrics to watch, what thresholds trigger action, and realistic timeline for seeing results.

---

ANALYSIS RULES
- Be direct, critical, and senior-level
- Avoid generic advice or beginner explanations
- Never optimize prematurely if data is limited — say "insufficient data" instead of guessing
- Never recommend aggressive changes to high-performing elements
- Always separate what to PROTECT vs what to OPTIMIZE vs what to KILL
- Assume the business goal is profit + scale, not vanity metrics
- When data is insufficient for a recommendation, explicitly state what data is needed and how to collect it

DOMAIN-SPECIFIC RULES (FURNITURE ECOMMERCE)
Furniture has:
- Longer decision cycles (7-30 days research phase)
- High price sensitivity
- Strong intent segmentation (type, material, size, function)
- Seasonal patterns (back-to-school, Black Friday, January sales, spring renovation)

Treat keywords like "cheap", "price", "promo" as intent signals, not negatives by default.
Always consider: Delivery time, Dimensions, Storage/functionality, Apartment size use-cases.

TONE & STYLE
- Professional, confident, strategic
- No emojis anywhere in the output (use Priority numbers, not emoji)
- No fluff or filler phrases
- No over-explaining basics
- Write Document 1 as if advising a CEO
- Write Document 2 as if briefing a senior PPC specialist

MARKDOWN FORMATTING RULES (CRITICAL)
- Tables: Standard Markdown syntax. Equal columns per row. Use | for boundaries.
- Bold: For key metrics and critical warnings only — do not over-bold
- Spacing: Clear spacing between sections
- JSON: At the very end, after both documents, wrapped in \`\`\`json tags

CRITICAL OUTPUT RULES:
1. The Action Plan table is MANDATORY. Never replace it with prose. 
   If you run out of space, shorten the insights — never the Action Plan.
2. The 2x2 matrix (where applicable) MUST be a Markdown table, 
   never inline text with parentheses.
3. NEVER add meta-commentary, reviewer notes, or "improved version" 
   framing. Output the analysis directly — no preamble about what 
   was wrong with a previous version.
4. Executive Summary MUST stay under 500 words. If it exceeds this, 
   move detail to Document 2.
5. Every insight's Confidence level must appear on a separate line:
   **Confidence: HIGH/MEDIUM/LOW** — one-sentence reason.

FINAL CONSTRAINTS
- If performance is strong: do NOT default to "restructure everything." Prioritize risk-controlled experimentation. Explicitly state what should NOT be touched.
- If data is limited: lead with that fact. Frame recommendations as hypotheses to test, not conclusions to act on.
- Never repeat the same recommendation in multiple sections. State it once in the Action Plan; reference it elsewhere if needed.
- This is a hardcoded expert system prompt. Execute it consistently and without deviation.

`;

// ============================================
// AD GROUP LEVEL ANALYSIS PROMPT
// ============================================

export const getAdGroupAnalysisPrompt = (data: any, language: 'bg' | 'en') => {
    const isEn = language === 'en';
    const adGroup = data.adGroup || {};
    const keywords = data.keywords || [];
    const ads = data.ads || [];
    const negativeKeywords = data.negativeKeywords || [];
    const searchTerms = data.searchTerms || [];

    const totalConversions = keywords.reduce((sum: number, k: any) => sum + (k.conversions || 0), 0);
    const totalCost = keywords.reduce((sum: number, k: any) => sum + (k.cost || 0), 0);
    const totalClicks = keywords.reduce((sum: number, k: any) => sum + (k.clicks || 0), 0);
    const totalImpressions = keywords.reduce((sum: number, k: any) => sum + (k.impressions || 0), 0);

    const languageInstruction = isEn
        ? 'IMPORTANT: Your entire response MUST be in English.'
        : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

    return `${ANALYSIS_SYSTEM_PROMPT}

${languageInstruction}

=== AD GROUP ANALYSIS MISSION ===
Deep-dive analysis of a single ad group. Diagnose keyword health, ad creative effectiveness, match type strategy, and negative keyword coverage. Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== STATISTICAL CONTEXT ===
Total conversions in this ad group: ${totalConversions}
Total cost: €${totalCost.toFixed(2)}
Total clicks: ${totalClicks}
Total impressions: ${totalImpressions}
${totalConversions < 30 ? 'WARNING: Conversion volume is below 30. All performance conclusions are DIRECTIONAL ONLY. Flag this explicitly in your analysis.' : 'Conversion volume is sufficient for directional analysis.'}
${totalConversions < 15 ? 'CRITICAL: Conversion volume is extremely low (<15). Avoid definitive performance claims. Focus analysis on structural issues, QS, and ad setup rather than conversion-based optimization.' : ''}

=== AD GROUP OVERVIEW ===
Name: ${adGroup.name || 'N/A'}
Campaign: ${adGroup.campaignName || 'N/A'}
Status: ${adGroup.status || 'N/A'}
Total Spend: €${(adGroup.cost || 0).toFixed(2)}
Conversions: ${adGroup.conversions || 0}
Conversion Value: €${(adGroup.conversionValue || 0).toFixed(2)}
ROAS: ${adGroup.roas || 'N/A'}x
CPA: €${adGroup.cpa || 'N/A'}
CTR: ${(adGroup.ctr || 0).toFixed(2)}%

=== KEYWORDS (${keywords.length} total) ===
${keywords.map((k: any) => `
Keyword: "${k.text}" [Match Type: ${k.matchType}]
- Quality Score: ${k.qualityScore || 'N/A'} | Exp. CTR: ${k.expectedCtr || 'N/A'} | Ad Rel: ${k.adRelevance || 'N/A'} | LP Exp: ${k.landingPageExperience || 'N/A'}
- Impressions: ${k.impressions || 0} | Clicks: ${k.clicks || 0} | CTR: ${(k.ctr || 0).toFixed(2)}%
- Cost: €${(k.cost || 0).toFixed(2)} | CPC: €${(k.cpc || 0).toFixed(3)}
- Conversions: ${k.conversions || 0} | Conv. Value: €${(k.conversionValue || 0).toFixed(2)}
`).join('\n')}

=== ADS (${ads.length} total) ===
${ads.map((ad: any) => `
Ad ID: ${ad.id}
- Type: ${ad.type || 'RSA'}
- Ad Strength: ${ad.adStrength || 'N/A'}
- Headlines (${ad.headlinesCount || 0}): ${ad.headlines?.join(' | ') || 'N/A'}
- Descriptions (${ad.descriptionsCount || 0}): ${ad.descriptions?.join(' | ') || 'N/A'}
- Final URL: ${ad.finalUrl || 'N/A'}
- Performance: Impr: ${ad.impressions || 0} | Clicks: ${ad.clicks || 0} | CTR: ${(ad.ctr || 0).toFixed(2)}% | Conv: ${ad.conversions || 0}
`).join('\n')}

=== NEGATIVE KEYWORDS (${negativeKeywords.length} total) ===
${negativeKeywords.length > 0
            ? negativeKeywords.map((nk: any) => `[${nk.matchType || 'BROAD'}] ${nk.text}`).join(', ')
            : 'No negative keywords found.'
        }

=== SEARCH TERMS SAMPLE (${searchTerms.length} available) ===
${searchTerms.length > 0
            ? searchTerms.slice(0, 30).map((st: any) => `"${st.searchTerm}" | Cost: €${(st.cost || 0).toFixed(2)} | Conv: ${st.conversions || 0} | ROAS: ${st.cost > 0 ? (st.conversionValue / st.cost).toFixed(2) : 0}x`).join('\n')
            : 'Search terms data not available. Note: Without search term data, broad match waste cannot be assessed. Recommend pulling Search Terms Report manually.'
        }

=== SPECIFIC ANALYSIS REQUIREMENTS ===

In the TECHNICAL ANALYSIS (Document 2), you MUST address each of these:

A. KEYWORD HEALTH
- Quality Score distribution and component-level diagnosis
- Match type overlap/cannibalization (check if multiple match types compete for the same queries)
- If any keyword has 0 impressions, diagnose WHY (cannibalization, low bid, low volume, or paused)
- Identify missing keyword opportunities based on the ad group's theme

B. AD CREATIVE AUDIT
- Count of active RSA ads vs Google's recommendation (2-3 per ad group)
- Ad Strength distribution — if majority are UNSPECIFIED or POOR, explain the likely cause
- Headline diversity analysis: are different value propositions being tested, or just variations of the same message?
- Identify seasonal or time-sensitive ads that may be outdated
- Landing page consistency: do all ads point to the same/appropriate landing page?
- If there are >3 RSA ads: recommend specific ads to pause (by ID) and explain why

C. MATCH TYPE STRATEGY
- Compare performance metrics across match types
- Assess whether broad match is adding value or creating waste
- If search terms data is available: estimate % of relevant vs irrelevant queries from broad match
- Recommend specific match type changes with rationale

D. NEGATIVE KEYWORD COVERAGE
- Assess quality and completeness of the negative keyword list
- Identify patterns (competitor names, irrelevant categories, informational queries)
- Suggest 10+ new negative keywords based on the ad group theme and common waste patterns
- Flag any negative keywords that might be blocking valuable traffic

E. STRUCTURAL OPPORTUNITIES
- Should this ad group be split into multiple, more specific ad groups?
- What subcategories or intent segments could benefit from dedicated ad groups?
- For each proposed new ad group: suggest 3-5 keywords + a headline direction

=== JSON OUTPUT (MANDATORY — AFTER BOTH DOCUMENTS) ===
At the very end of your response, provide a JSON block wrapped in \`\`\`json tags:
{
    "todos": [
        {
            "task": "Specific action description",
            "impact": "High|Medium|Low",
            "timeframe": "Immediate|Short-term|Medium-term",
            "category": "Keywords|Ads|Structure|Negatives|Match Type|Landing Page|Bidding",
            "estimated_lift": "Brief estimate, e.g. '+5-10% CTR' or 'Prevent ~€20/mo waste' or 'Not quantifiable — structural improvement'",
            "effort": "Low|Medium|High"
        }
    ]
}
`;
};


// ============================================
// REPORT TEMPLATE PROMPTS (IMPROVED)
// ============================================

export const REPORT_TEMPLATES = {

    quality_score_diagnostics: (data: any, language: 'bg' | 'en') => {
        const isEn = language === 'en';
        const keywords = data.keywords || [];
        const adGroups = data.adGroups || [];
        const lowQSKeywords = keywords.filter((k: any) => k.qualityScore && k.qualityScore < 5);
        const avgQS = keywords.length > 0
            ? (keywords.reduce((sum: number, k: any) => sum + (k.qualityScore || 0), 0) / keywords.length).toFixed(2)
            : 0;

        const languageInstruction = isEn
            ? 'IMPORTANT: Your entire response MUST be in English.'
            : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

        return `${ANALYSIS_SYSTEM_PROMPT}

${languageInstruction}

=== QUALITY SCORE DIAGNOSTIC MISSION ===
Analyze Quality Score patterns and provide actionable fixes to improve Ad Rank and reduce Lost IS(Rank).
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== STATISTICAL CONTEXT ===
Total Keywords Analyzed: ${keywords.length}
Keywords with QS < 5: ${lowQSKeywords.length}
Average Quality Score: ${avgQS}
Ad Groups Analyzed: ${adGroups.length}

=== LOW QS KEYWORDS (Top 20 by spend) ===
${lowQSKeywords.slice(0, 20).map((k: any) => `
Keyword: "${k.text}" (${k.matchType})
- Quality Score: ${k.qualityScore || 'N/A'}
- Expected CTR: ${k.expectedCtr || 'N/A'} | Ad Relevance: ${k.adRelevance || 'N/A'} | LP Experience: ${k.landingPageExperience || 'N/A'}
- Impressions: ${k.impressions} | Clicks: ${k.clicks} | Cost: €${(k.cost || 0).toFixed(2)}
- Conversions: ${k.conversions || 0} | Conv. Value: €${(k.conversionValue || 0).toFixed(2)}
`).join('\n')}

=== AD GROUPS WITH LOW AVG QS ===
${adGroups.filter((ag: any) => ag.avgQualityScore && ag.avgQualityScore < 6).map((ag: any) => `
Ad Group: ${ag.name}
- Avg QS: ${ag.avgQualityScore} | Keywords with Low QS: ${ag.keywordsWithLowQS || 0}
- Spend: €${(ag.cost || 0).toFixed(2)} | Conversions: ${ag.conversions || 0}
`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
In the Technical Analysis, address:

1. QS COMPONENT DIAGNOSIS (ranked by impact)
For each low-QS keyword, identify the PRIMARY bottleneck:
- Expected CTR issue → likely ad copy/position problem
- Ad Relevance issue → keyword-ad mismatch, needs restructuring
- Landing Page issue → page quality/speed/relevance problem
Group keywords by their primary bottleneck to enable batch fixes.

2. ROOT CAUSE PATTERNS
Identify systematic issues (e.g., "all keywords in ad group X have low Ad Relevance" = structural mismatch, not a keyword-level fix).

3. SPECIFIC FIXES (with estimated IS recovery)
- Ad copy improvements: exact headlines/descriptions to add or modify
- Keyword restructuring: which keywords to move to which ad groups
- Landing page recommendations (if LP Experience is the bottleneck)
- For each fix, estimate potential QS improvement and resulting IS(Rank) recovery

4. NEGATIVE KEYWORD GAPS
Based on the ad group themes, suggest negative keywords that would improve CTR (and thus QS).

5. PRIORITY ACTIONS
Top 3 actions ordered by: (potential IS recovery) x (ease of implementation)

At the end, provide a JSON block for "Actionable To-Do List" wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "Quality Score|Ad Copy|Structure|Landing Page|Negatives", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
    },

    lost_is_analysis: (data: any, language: 'bg' | 'en') => {
        const isEn = language === 'en';
        const campaigns = data.campaigns || [];
        const rankLostCampaigns = campaigns.filter((c: any) => c.searchLostISRank && c.searchLostISRank > 0.1);
        const budgetLostCampaigns = campaigns.filter((c: any) => c.searchLostISBudget && c.searchLostISBudget > 0.1);

        const languageInstruction = isEn
            ? 'IMPORTANT: Your entire response MUST be in English.'
            : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

        return `${ANALYSIS_SYSTEM_PROMPT}

${languageInstruction}

=== LOST IMPRESSION SHARE DIAGNOSTIC MISSION ===
Separate quality issues (rank) from scaling opportunities (budget) and provide specific action plans.
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== CAMPAIGNS WITH LOST IS (RANK) ===
${rankLostCampaigns.map((c: any) => `
Campaign: ${c.name}
- Lost IS (Rank): ${((c.searchLostISRank || 0) * 100).toFixed(1)}% | Lost IS (Budget): ${((c.searchLostISBudget || 0) * 100).toFixed(1)}%
- Current IS: ${((c.searchImpressionShare || 0) * 100).toFixed(1)}%
- Spend: €${(c.cost || 0).toFixed(2)} | ROAS: ${c.roas || 0}x | Conversions: ${c.conversions || 0}
- Bidding: ${c.biddingStrategyType || 'N/A'}
${c.targetRoas ? `- Target ROAS: ${c.targetRoas}x` : ''}${c.targetCpa ? `- Target CPA: €${c.targetCpa}` : ''}
`).join('\n')}

=== CAMPAIGNS WITH LOST IS (BUDGET) ===
${budgetLostCampaigns.map((c: any) => `
Campaign: ${c.name}
- Lost IS (Budget): ${((c.searchLostISBudget || 0) * 100).toFixed(1)}% | Lost IS (Rank): ${((c.searchLostISRank || 0) * 100).toFixed(1)}%
- Current IS: ${((c.searchImpressionShare || 0) * 100).toFixed(1)}%
- Spend: €${(c.cost || 0).toFixed(2)} | ROAS: ${c.roas || 0}x | CPA: €${c.cpa || 0} | Conversions: ${c.conversions || 0}
`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
In the Technical Analysis:

1. 2x2 CLASSIFICATION MATRIX
Categorize each campaign:
- High Rank Lost + Low Budget Lost = Quality Problem (fix QS/ads)
- Low Rank Lost + High Budget Lost = Scaling Opportunity (increase budget)
- High both = Mixed (fix quality first, then scale)
- Low both = Healthy (monitor only)
Present as a table with campaign names.

2. QUALITY/RANK FIXES (for campaigns in "Quality Problem" quadrant)
- Identify likely QS issues
- Recommend bid adjustments vs structural fixes
- Estimate potential IS recovery if QS improves by 1-2 points
- Calculate the € value of recovered impressions (using current CTR and conversion rate)

3. SCALING OPPORTUNITIES (for campaigns in "Scaling Opportunity" quadrant)
- Validate performance first (is ROAS/CPA acceptable?)
- Recommend specific budget increases: +10%, +20%, +50% with projected impact
- Calculate potential conversion volume increase at each level
- Flag diminishing returns risk

4. PRIORITIZED ACTION PLAN
Combine all recommendations into the standard Action Plan table format, ordered by estimated € impact.

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "Quality Fix|Budget Increase|Bid Adjustment|Structure", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
    },

    search_terms_intelligence: (data: any, language: 'bg' | 'en') => {
        const isEn = language === 'en';
        const searchTerms = data.searchTerms || [];
        const nGramAnalysis = data.nGramAnalysis || null;
        const brandedKeywords = data.brandedKeywords || ['videnov', 'мебели виденов', 'виденов мебели'];

        const totalSearchTermCost = searchTerms.reduce((sum: number, st: any) => sum + (st.cost || 0), 0);
        const totalSearchTermConversions = searchTerms.reduce((sum: number, st: any) => sum + (st.conversions || 0), 0);

        const languageInstruction = isEn
            ? 'IMPORTANT: Your entire response MUST be in English.'
            : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

        return `${ANALYSIS_SYSTEM_PROMPT}

${languageInstruction}

=== SEARCH TERMS INTELLIGENCE MISSION ===
Identify winning patterns, wasteful spend, and negative keyword opportunities.
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== STATISTICAL CONTEXT ===
Total search terms analyzed: ${searchTerms.length}
Total search term spend: €${totalSearchTermCost.toFixed(2)}
Total search term conversions: ${totalSearchTermConversions}

=== N-GRAM ANALYSIS ===
${nGramAnalysis ? `
Top Winning N-Grams (High ROAS/Value):
${nGramAnalysis.topWinning?.map((g: any) => `- "${g.gram}": ${g.conversions} conv, €${g.conversionValue?.toFixed(0)} value, ROAS ${g.roas?.toFixed(2)}x, Cost: €${g.cost?.toFixed(2)}`).join('\n')}

Top Wasteful N-Grams (High Spend, Low Performance):
${nGramAnalysis.topWasteful?.map((g: any) => `- "${g.gram}": €${g.cost?.toFixed(0)} spend, ${g.conversions} conv, ROAS ${g.roas?.toFixed(2)}x`).join('\n')}
` : 'N-Gram analysis not available.'}

=== BRANDED KEYWORDS (REFERENCE) ===
${brandedKeywords.join(', ')}

=== RAW SEARCH TERMS (Top 50 by spend) ===
${searchTerms.slice(0, 50).map((st: any) => `"${st.searchTerm}" | Cost: €${st.cost?.toFixed(2)} | Conv: ${st.conversions} | Value: €${(st.conversionValue || 0).toFixed(2)} | ROAS: ${st.cost > 0 ? (st.conversionValue / st.cost).toFixed(2) : 0}x`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
In the Technical Analysis:

1. N-GRAM PATTERNS
- Which product categories/modifiers drive value?
- Which terms waste budget? Quantify the waste in €.
- Identify 1-word, 2-word, and 3-word patterns separately.

2. TOP WINNERS (5-10 terms)
For each: explain WHY it performs well (intent match, offer relevance, funnel position).

3. TOP WASTERS (5-10 terms)
For each: explain WHY it wastes budget and recommend action (negative keyword, match type change, or dedicated landing page).
Quantify: "Excluding these terms would have saved approximately €X."

4. BRANDED vs NON-BRANDED
- Spend allocation and ROAS comparison
- Is brand spend cannibalizing organic traffic?
- Non-brand volume opportunity

5. INTENT CATEGORIZATION
Categorize search terms into:
- High Intent (ready to buy): "buy X", "X price", "X delivery"
- Mid Intent (comparing): "X vs Y", "best X", "X reviews"
- Low Intent (browsing/informational): "X ideas", "how to choose X", "X dimensions"
Estimate spend allocation across intent tiers.

6. NEGATIVE KEYWORD RECOMMENDATIONS
15+ specific negative keywords with rationale, grouped by theme (informational, competitor, irrelevant category, etc.)

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "Negative Keywords|Winning Terms|Bid Adjustments|Match Type|Structure", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
    },

    ad_strength_performance: (data: any, language: 'bg' | 'en') => {
        const isEn = language === 'en';
        const adGroups = data.adGroups || [];
        const ads = data.ads || [];
        const poorStrengthAdGroups = adGroups.filter((ag: any) =>
            ag.adStrength && (ag.adStrength === 'POOR' || ag.adStrength === 'AVERAGE')
        );

        const languageInstruction = isEn
            ? 'IMPORTANT: Your entire response MUST be in English.'
            : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

        return `${ANALYSIS_SYSTEM_PROMPT}

${languageInstruction}

=== AD STRENGTH & COPY PERFORMANCE MISSION ===
Audit RSA ad strength and provide specific copy improvements to increase CTR and conversions.
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== AD STRENGTH DISTRIBUTION ===
${adGroups.map((ag: any) => `
Ad Group: ${ag.name}
- Ad Strength: ${ag.adStrength || 'N/A'} | Ads Count: ${ag.adsCount || 0} | Poor Ads: ${ag.poorAdsCount || 0}
- Spend: €${(ag.cost || 0).toFixed(2)} | CTR: ${(ag.ctr || 0).toFixed(2)}% | Conversions: ${ag.conversions || 0} | ROAS: ${ag.roas || 0}x
`).join('\n')}

=== AD GROUPS WITH POOR/AVERAGE AD STRENGTH ===
${poorStrengthAdGroups.map((ag: any) => `
Ad Group: ${ag.name}
- Ad Strength: ${ag.adStrength}
- Performance: CTR ${(ag.ctr || 0).toFixed(2)}%, Conv Rate ${ag.conversions > 0 && ag.clicks > 0 ? ((ag.conversions / ag.clicks) * 100).toFixed(2) : 0}%
- Active Ads: ${ag.adsCount || 0} (Google recommends 2-3 per ad group)
`).join('\n')}

=== SAMPLE ADS (Top 10 by spend) ===
${ads.slice(0, 10).map((ad: any) => `
Ad ID: ${ad.id} | Ad Strength: ${ad.adStrength || 'N/A'}
- Headlines (${ad.headlinesCount || 0}): ${ad.headlines?.join(' | ') || 'N/A'}
- Descriptions (${ad.descriptionsCount || 0}): ${ad.descriptions?.join(' | ') || 'N/A'}
- Final URL: ${ad.finalUrl || 'N/A'}
- Impr: ${ad.impressions || 0} | CTR: ${(ad.ctr || 0).toFixed(2)}% | Conv: ${ad.conversions || 0}
`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
In the Technical Analysis:

1. AD STRENGTH AUDIT
- Distribution: how many EXCELLENT / GOOD / AVERAGE / POOR / UNSPECIFIED?
- Correlation between Ad Strength and CTR/conversions (if data permits)
- Ad groups exceeding 3 RSA ads: list them, flag the problem, recommend which to pause (by ID)

2. HEADLINE DIVERSITY ANALYSIS
For each ad group, categorize headlines into:
| Category | Examples |
|----------|----------|
| Brand | Company name, URL |
| Price/Promo | Discounts, installments, free delivery |
| Product Feature | Material, size, functionality |
| Trust | Warranty, reviews, years in business |
| Convenience | Online ordering, delivery speed |
| Emotion/Use case | Comfort, lifestyle, room-specific |

Flag ad groups where >70% of headlines fall in ONE category (= no real testing).

3. SEASONAL/OUTDATED AD CHECK
Identify ads with time-sensitive language (holiday names, month names, seasonal references). Flag any that appear outdated.

4. MESSAGE MATCH ANALYSIS
Keyword → ad copy → landing page consistency. Flag mismatches.

5. SPECIFIC COPY RECOMMENDATIONS
For the top 5 ad groups by spend, provide:
- 3 new headline suggestions per category gap
- 2 new description suggestions
- Pin recommendations (what to pin to Position 1/2 and what to leave dynamic)

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "Ad Copy|Headlines|Descriptions|Message Match|Structure", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
    },

    budget_allocation_efficiency: (data: any, language: 'bg' | 'en') => {
        const isEn = language === 'en';
        const campaigns = data.campaigns || [];
        const strategicBreakdown = data.strategicBreakdown || {};
        const totalSpend = campaigns.reduce((sum: number, c: any) => sum + (c.cost || 0), 0);

        const languageInstruction = isEn
            ? 'IMPORTANT: Your entire response MUST be in English.'
            : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

        return `${ANALYSIS_SYSTEM_PROMPT}

${languageInstruction}

=== BUDGET ALLOCATION EFFICIENCY MISSION ===
Evaluate strategic spend distribution and recommend budget reallocations for improved efficiency and growth.
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== STRATEGIC BREAKDOWN ===
${Object.entries(strategicBreakdown).map(([category, data]: [string, any]) => {
            const pct = totalSpend > 0 ? ((data.spend / totalSpend) * 100).toFixed(1) : 0;
            const categoryLabel = category === 'pmax_sale' ? 'PMax - Sale' :
                category === 'pmax_aon' ? 'PMax - AON' :
                    category === 'search_dsa' ? 'Search - DSA' :
                        category === 'search_nonbrand' ? 'Search - NonBrand' :
                            category === 'upper_funnel' ? 'Video/Display' :
                                category === 'brand' ? 'Brand' : 'Other';
            return `
${categoryLabel}:
- Spend: €${data.spend?.toFixed(0) || 0} (${pct}% of total) | Campaigns: ${data.campaigns || 0}
- Conversions: ${data.conversions?.toFixed(0) || 0} | ROAS: ${data.spend > 0 && data.conversions > 0 ? (data.conversions * 300 / data.spend).toFixed(2) : 'N/A'}x (estimated)`;
        }).join('\n')}

=== TOTAL ACCOUNT SPEND: €${totalSpend.toFixed(2)} ===

=== CAMPAIGNS BY CATEGORY ===
${campaigns.map((c: any) => `
${c.name} | Category: ${c.category || 'other'}
- Spend: €${(c.cost || 0).toFixed(2)} | ROAS: ${c.roas || 0}x | CPA: €${c.cpa || 0} | Conv: ${c.conversions || 0}
- Status: ${c.status} | Lost IS Budget: ${((c.searchLostISBudget || 0) * 100).toFixed(1)}%
`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
In the Technical Analysis:

1. SPEND ALLOCATION TABLE
Present current allocation as a table: Category | Spend | % of Total | ROAS | CPA | Assessment (Over/Under/Balanced)

2. CATEGORY PERFORMANCE ASSESSMENT
For each category: is performance above/below expectations? Is spend proportional to its role?

3. OVER-PROTECTION ANALYSIS
Is Brand spend too high relative to non-brand?
Benchmark: Brand should be 15-25% of total for furniture eCommerce.
If over-indexed: estimate how much could be reallocated and the projected impact.

4. UNDER-INVESTED OPPORTUNITIES
Which categories are budget-limited with strong performance?
Cross-reference Lost IS (Budget) with ROAS/CPA.
Quantify: "Increasing budget by €X could yield approximately Y additional conversions."

5. THREE REALLOCATION SCENARIOS
Present as a table with projected outcomes:
| Scenario | Change | Projected Impact | Risk Level |
| Conservative (+10% shift) | ... | ... | Low |
| Moderate (+20% shift) | ... | ... | Medium |
| Aggressive (rebalance to benchmarks) | ... | ... | Higher |

For each scenario, show: source campaign(s), destination campaign(s), € amount, projected conversion change.

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "Budget Increase|Budget Decrease|Reallocation|Optimization", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
    },

    campaign_structure_health: (data: any, language: 'bg' | 'en') => {
        const isEn = language === 'en';
        const campaigns = data.campaigns || [];
        const adGroups = data.adGroups || [];
        const keywords = data.keywords || [];

        const avgAdGroupsPerCampaign = campaigns.length > 0 ? (adGroups.length / campaigns.length).toFixed(1) : 0;
        const avgKeywordsPerAdGroup = adGroups.length > 0 ? (keywords.length / adGroups.length).toFixed(1) : 0;
        const matchTypeDistribution = keywords.reduce((acc: any, k: any) => {
            const type = k.matchType || 'UNKNOWN';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});

        const languageInstruction = isEn
            ? 'IMPORTANT: Your entire response MUST be in English.'
            : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

        return `${ANALYSIS_SYSTEM_PROMPT}

${languageInstruction}

=== CAMPAIGN STRUCTURE HEALTH MISSION ===
Audit campaign and ad group structure for efficiency, identifying over-fragmentation and consolidation opportunities.
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== STRUCTURE METRICS ===
- Total Campaigns: ${campaigns.length} | Total Ad Groups: ${adGroups.length} | Total Keywords: ${keywords.length}
- Avg Ad Groups per Campaign: ${avgAdGroupsPerCampaign}
- Avg Keywords per Ad Group: ${avgKeywordsPerAdGroup}

=== MATCH TYPE DISTRIBUTION ===
${Object.entries(matchTypeDistribution).map(([type, count]) => `- ${type}: ${count} keywords`).join('\n')}

=== CAMPAIGN BREAKDOWN ===
${campaigns.map((c: any) => {
            const campaignAdGroups = adGroups.filter((ag: any) => ag.campaignId === c.id);
            return `
Campaign: ${c.name} | Ad Groups: ${campaignAdGroups.length} | Spend: €${(c.cost || 0).toFixed(2)} | Status: ${c.status}`;
        }).join('\n')}

=== AD GROUP ANALYSIS (Top 30 by spend) ===
${adGroups.slice(0, 30).map((ag: any) => `
Ad Group: ${ag.name} | Campaign: ${campaigns.find((c: any) => c.id === ag.campaignId)?.name || 'Unknown'}
- Spend: €${(ag.cost || 0).toFixed(2)} | Conv: ${ag.conversions || 0} | Keywords: ${ag.keywordCount || 'N/A'}
`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
In the Technical Analysis:

1. STRUCTURE HEALTH SCORE
Rate overall structure: Healthy / Needs Optimization / Requires Restructuring
Justify with specific metrics.

2. FRAGMENTATION ANALYSIS
- Campaigns with 20+ ad groups (likely over-fragmented)
- Ad groups with <€10/month spend (management overhead exceeds value)
- Ad groups with 0 conversions and >€20 spend (candidates for pause/merge)
Present as a table: Ad Group | Spend | Conversions | Recommendation (Merge/Pause/Keep)

3. CONSOLIDATION OPPORTUNITIES
Specific merges: "Merge ad groups X, Y, Z into one group called [name]"
For each merge: explain the rationale and estimated impact on algorithm learning.

4. MATCH TYPE STRATEGY
- Is Broad Match driving value or waste? (Cross-reference with performance data)
- Broad Match + Smart Bidding effectiveness assessment
- Recommend specific match type changes per ad group

5. STRUCTURAL OPTIMIZATION PLAN
Present as the standard Action Plan table with specific structural changes, timeframes, and expected outcomes.

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "Consolidation|Expansion|Match Type|Simplification|Pause", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
    },

    change_impact_analysis: (data: any, language: 'bg' | 'en') => {
        const isEn = language === 'en';
        const campaigns = data.campaigns || [];
        const changeDescription = data.changeDescription || 'No change description provided';

        const languageInstruction = isEn
            ? 'IMPORTANT: Your entire response MUST be in English.'
            : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

        return `${ANALYSIS_SYSTEM_PROMPT}

${languageInstruction}

=== CHANGE IMPACT ANALYSIS MISSION ===
Quantify the impact of recent changes, separate actual impact from seasonality/noise, and recommend next steps.
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== CHANGE DESCRIPTION ===
${changeDescription}

=== PERIOD-OVER-PERIOD DATA ===
${campaigns.map((c: any) => {
            const prev = c.previous || {};
            const costChange = prev.cost ? (((c.cost - prev.cost) / prev.cost) * 100).toFixed(1) : 'N/A';
            const convChange = prev.conversions ? (((c.conversions - prev.conversions) / prev.conversions) * 100).toFixed(1) : 'N/A';
            const cpaChange = prev.cpa && c.cpa ? (((c.cpa - prev.cpa) / prev.cpa) * 100).toFixed(1) : 'N/A';
            return `
Campaign: ${c.name}
CURRENT: Spend €${(c.cost || 0).toFixed(2)} | Conv: ${c.conversions || 0} | CPA: €${c.cpa || 0} | ROAS: ${c.roas || 0}x
PREVIOUS: Spend €${(prev.cost || 0).toFixed(2)} | Conv: ${prev.conversions || 0} | CPA: €${prev.cpa || 0} | ROAS: ${prev.roas || 0}x
CHANGE: Spend ${costChange}% | Conv ${convChange}% | CPA ${cpaChange}%`;
        }).join('\n')}

=== ANALYSIS REQUIREMENTS ===
In the Technical Analysis:

1. CHANGE SUMMARY
Restate what changed, when, and the hypothesis behind it.

2. BEFORE vs AFTER (table format)
| Metric | Before | After | Change | Significant? |
For statistical significance: note whether the data volume supports conclusions.

3. IMPACT ATTRIBUTION
Separate:
- Direct impact of the change (what can be attributed with confidence)
- Potential external factors (seasonality, competitor activity, market changes)
- Noise (insufficient data to determine)

4. UNEXPECTED OUTCOMES
Flag anything that moved in the opposite direction from expectations.

5. CONFIDENCE ASSESSMENT
- HIGH: Clear signal, sufficient data (30+ conversions both periods), results align with hypothesis
- MEDIUM: Some signal, but short period or moderate data volume
- LOW: Insufficient data, too early to conclude
State which level applies and WHY.

6. RECOMMENDATION
Based on confidence level:
- HIGH confidence positive: Scale the change
- HIGH confidence negative: Revert
- MEDIUM: Continue monitoring for X more days/conversions
- LOW: Cannot conclude yet; specify what data threshold is needed

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "Scale Change|Revert|Refine|Monitor", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
    }
};
