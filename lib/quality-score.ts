// ============================================================
// Quality Score Diagnostics — Data Types & API Mapping
// ============================================================

// ----- TypeScript Interfaces -----

export interface QualityScoreRequest {
    templateId: 'quality_score_diagnostics';
    settings: QSSettings;
    data: QSData;
}

export interface QSSettings {
    language: 'bg' | 'en';                // Response language
    audience: 'stakeholder' | 'specialist'; // Controls detail level in prompt
    expertMode: boolean;
    model: string;                         // e.g. "claude-sonnet-4-5-20250514"
    lowQsThreshold: number;               // Default: 5. Keywords with QS <= this are "low"
    topKeywordsBySpend: number;            // Default: 20. How many low-QS keywords to send (by spend)
    impactCapIsRankPp30d?: number;         // Default: 15. Max estimated IS recovery pp in 30 days
}

export interface QSData {
    dateRange: {
        start: string;  // ISO date: "2026-01-15"
        end: string;    // ISO date: "2026-02-14"
    };
    brandTokens: string[];  // e.g. ["виденов", "videnov", "мебели виденов"]
    summary: QSSummary;
    keywords: QSKeyword[];
    adGroups: QSAdGroup[];
}

export interface QSSummary {
    totalKeywordsAnalyzed: number;
    keywordsWithQsBelowThreshold: number;
    averageQualityScore: number;
    weightedAvgQualityScore: number;  // Weighted by impressions
    adGroupsAnalyzed: number;
}

export interface QSKeyword {
    // — Identity —
    campaignId: string;
    campaignName: string;
    adGroupId: string;
    adGroupName: string;
    text: string;                     // The keyword text
    matchType: 'EXACT' | 'PHRASE' | 'BROAD';

    // — Quality Score —
    qualityScore: number;             // 1–10
    expectedCtr: QSComponent;
    adRelevance: QSComponent;
    landingPageExperience: QSComponent;

    // — QS History (optional — populate if you have snapshots) —
    qualityScoreHistory?: {
        previous: number;               // Previous QS value
        periodDaysAgo: number;          // How many days ago was "previous" recorded
    };

    // — Performance —
    impressions: number;
    clicks: number;
    cost: number;                     // In account currency
    conversions: number;
    conversionValue: number;

    // — Position & Impression Share —
    avgCpc: number;
    searchImpressionShare?: number;         // 0–100 (percentage)
    searchLostIsRank?: number;              // 0–100 (percentage)
    searchTopImpressionShare?: number;      // 0–100 (percentage)
    searchAbsTopImpressionShare?: number;   // 0–100 (percentage)

    // — Landing Page —
    finalUrl: string;                 // Full URL or path
}

export interface QSAdGroup {
    campaignId: string;
    campaignName: string;
    adGroupId: string;
    name: string;
    avgQualityScore: number;
    keywordCount: number;             // Total keywords in ad group
    keywordsWithLowQS: number;       // Keywords with QS <= threshold
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    searchLostIsRank?: number;              // 0–100
    searchTopImpressionShare?: number;      // 0–100
}

export type QSComponent = 'ABOVE_AVERAGE' | 'AVERAGE' | 'BELOW_AVERAGE';


// ============================================================
// Google Ads API — GAQL Queries
// ============================================================

/**
 * Query 1: Keywords with Quality Score data
 *
 * Pull all keywords with QS, filter low-QS on the backend,
 * then send top N by spend to Claude.
 */
export const KEYWORD_QS_QUERY = `
SELECT
  campaign.id,
  campaign.name,
  ad_group.id,
  ad_group.name,
  ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type,
  ad_group_criterion.quality_info.quality_score,
  ad_group_criterion.quality_info.creative_quality_score,
  ad_group_criterion.quality_info.post_click_quality_score,
  ad_group_criterion.quality_info.search_predicted_ctr,
  ad_group_criterion.final_urls,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.conversions_value,
  metrics.average_cpc,
  metrics.search_impression_share,
  metrics.search_rank_lost_impression_share,
  metrics.search_top_impression_share,
  metrics.search_absolute_top_impression_share
FROM keyword_view
WHERE
  segments.date BETWEEN '{{start_date}}' AND '{{end_date}}'
  AND ad_group_criterion.status = 'ENABLED'
  AND campaign.status = 'ENABLED'
  AND ad_group.status = 'ENABLED'
  AND metrics.impressions > 0
ORDER BY metrics.cost_micros DESC
`;

/**
 * Query 2: Ad Group level aggregates
 *
 * Used to build the adGroups array.
 */
export const AD_GROUP_QS_QUERY = `
SELECT
  campaign.id,
  campaign.name,
  ad_group.id,
  ad_group.name,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.conversions_value,
  metrics.search_rank_lost_impression_share,
  metrics.search_top_impression_share
FROM ad_group
WHERE
  segments.date BETWEEN '{{start_date}}' AND '{{end_date}}'
  AND campaign.status = 'ENABLED'
  AND ad_group.status = 'ENABLED'
  AND metrics.impressions > 0
ORDER BY metrics.cost_micros DESC
`;


// ============================================================
// Field Mapping: Google Ads API → QSKeyword
// ============================================================

/**
 * Maps Google Ads API response fields to QSKeyword interface.
 *
 * Notes:
 * - cost_micros needs division by 1_000_000
 * - average_cpc is in micros too
 * - search_predicted_ctr maps to expectedCtr
 * - creative_quality_score maps to adRelevance
 * - post_click_quality_score maps to landingPageExperience
 * - Impression share fields come as fractions (0.42) — multiply by 100 for percentages
 * - final_urls is an array — take the first element
 */
export function mapKeyword(row: any): QSKeyword {
    return {
        campaignId: String(row.campaign.id),
        campaignName: row.campaign.name,
        adGroupId: String(row.adGroup.id),
        adGroupName: row.adGroup.name,
        text: row.adGroupCriterion.keyword.text,
        matchType: row.adGroupCriterion.keyword.matchType,

        qualityScore: row.adGroupCriterion.qualityInfo.qualityScore ?? 0,
        expectedCtr: mapQsComponent(row.adGroupCriterion.qualityInfo.searchPredictedCtr),
        adRelevance: mapQsComponent(row.adGroupCriterion.qualityInfo.creativeQualityScore),
        landingPageExperience: mapQsComponent(row.adGroupCriterion.qualityInfo.postClickQualityScore),

        impressions: row.metrics.impressions,
        clicks: row.metrics.clicks,
        cost: row.metrics.costMicros / 1_000_000,
        conversions: row.metrics.conversions,
        conversionValue: row.metrics.conversionsValue,

        avgCpc: (row.metrics.averageCpc ?? 0) / 1_000_000,
        searchImpressionShare: toPercent(row.metrics.searchImpressionShare),
        searchLostIsRank: toPercent(row.metrics.searchRankLostImpressionShare),
        searchTopImpressionShare: toPercent(row.metrics.searchTopImpressionShare),
        searchAbsTopImpressionShare: toPercent(row.metrics.searchAbsoluteTopImpressionShare),

        finalUrl: row.adGroupCriterion.finalUrls?.[0] ?? '',
    };
}

function mapQsComponent(value: string): QSComponent {
    const map: Record<string, QSComponent> = {
        'ABOVE_AVERAGE': 'ABOVE_AVERAGE',
        'AVERAGE': 'AVERAGE',
        'BELOW_AVERAGE': 'BELOW_AVERAGE',
    };
    return map[value] ?? 'AVERAGE';
}

function toPercent(value: number | null | undefined): number | undefined {
    if (value == null) return undefined;
    // Convert 0.4213 -> 42.13
    return Math.round(value * 10000) / 100;
}


// ============================================================
// Backend: Filter & Build Request
// ============================================================

export function buildQualityScoreRequest(
    allKeywords: QSKeyword[],
    adGroups: QSAdGroup[],
    config: {
        dateRange: { start: string; end: string };
        brandTokens: string[];
        language: 'bg' | 'en';
        audience: 'stakeholder' | 'specialist';
        lowQsThreshold?: number;
        topKeywordsBySpend?: number;
        model?: string;
    }
): QualityScoreRequest {

    const threshold = config.lowQsThreshold ?? 5;
    const topN = config.topKeywordsBySpend ?? 20;

    // Filter low-QS keywords, sort by impact score, take top N
    // Impact formula: Cost * (7 - QS) * LostIsRank
    const lowQsKeywords = allKeywords
        .filter(kw => kw.qualityScore > 0 && kw.qualityScore <= threshold && !isBrandKeyword(kw.text, config.brandTokens))
        .map(kw => ({
            ...kw,
            _impactScore: kw.cost * (7 - kw.qualityScore) * ((kw.searchLostIsRank ?? 50) / 100),
        }))
        .sort((a, b) => b._impactScore - a._impactScore)
        .slice(0, topN)
        .map(({ _impactScore, ...kw }) => kw);  // Remove internal field

    // Summary
    const allWithQs = allKeywords.filter(kw => kw.qualityScore > 0);
    const totalImpressions = allWithQs.reduce((sum, kw) => sum + kw.impressions, 0);

    const summary: QSSummary = {
        totalKeywordsAnalyzed: allWithQs.length,
        keywordsWithQsBelowThreshold: allWithQs.filter(kw => kw.qualityScore <= threshold).length,
        averageQualityScore: round(
            allKeywords.length > 0
                ? allWithQs.reduce((sum, kw) => sum + kw.qualityScore, 0) / allWithQs.length
                : 0
        ),
        weightedAvgQualityScore: round(
            totalImpressions > 0
                ? allWithQs.reduce((sum, kw) => sum + kw.qualityScore * kw.impressions, 0) / totalImpressions
                : 0
        ),
        adGroupsAnalyzed: adGroups.length,
    };

    // Filter ad groups that have low-QS keywords
    const affectedAdGroupIds = new Set(lowQsKeywords.map(kw => kw.adGroupId));
    const relevantAdGroups = adGroups.filter(ag => affectedAdGroupIds.has(ag.adGroupId));

    return {
        templateId: 'quality_score_diagnostics',
        settings: {
            language: config.language,
            audience: config.audience,
            expertMode: true,
            model: config.model || 'claude-opus-4-6', // Default or config
            lowQsThreshold: threshold,
            topKeywordsBySpend: topN,
            impactCapIsRankPp30d: 15,
        },
        data: {
            dateRange: config.dateRange,
            brandTokens: config.brandTokens,
            summary,
            keywords: lowQsKeywords,
            adGroups: relevantAdGroups,
        },
    };
}

function round(n: number): number {
    return Math.round(n * 100) / 100;
}

function isBrandKeyword(text: string, tokens: string[]): boolean {
    if (!tokens || tokens.length === 0) return false;
    const lowerText = text.toLowerCase();
    return tokens.some(token => lowerText.includes(token.toLowerCase()));
}
