/**
 * account-health.ts
 * 
 * Account Health Score Calculator + N-Gram Analyzer
 * Place in: lib/account-health.ts
 * 
 * Usage in analyze route:
 *   import { calculateHealthScore, buildNGrams, formatHealthScoreForPrompt, formatNGramsForPrompt } from '@/lib/account-health';
 */

import type { CampaignPerformance, AdGroupPerformance, KeywordWithQS, AdWithStrength, NegativeKeyword, AuctionInsight, AccountDevicePerformance } from './google-ads';
import type { AssetPerformance, ChangeEvent, ConversionAction, PMaxProductPerformance } from '@/types/google-ads';

// ============================================================
// TYPES
// ============================================================

export interface HealthCheckResult {
    name: string;
    category: HealthCategory;
    score: number;          // 0-100
    weight: number;         // importance multiplier
    status: 'CRITICAL' | 'WARNING' | 'GOOD' | 'EXCELLENT';
    finding: string;        // human-readable finding
    recommendation: string; // what to do
    dataPoints: Record<string, any>;  // raw evidence
}

export type HealthCategory =
    | 'CONVERSION_TRACKING'
    | 'QUALITY_SCORE'
    | 'AD_STRENGTH'
    | 'IMPRESSION_SHARE'
    | 'BUDGET_EFFICIENCY'
    | 'STRUCTURE'
    | 'NEGATIVE_KEYWORDS'
    | 'MATCH_TYPE_BALANCE'
    | 'DEVICE_PERFORMANCE'
    | 'MARKET_COMPETITION'
    | 'ASSET_PERFORMANCE'
    | 'CHANGE_HISTORY'
    | 'CONVERSION_ACTIONS'
    | 'PMAX_PRODUCT_HEALTH';

export interface HealthScoreReport {
    overallScore: number;           // 0-100 weighted
    overallGrade: string;           // A+ to F
    categoryScores: Record<HealthCategory, number>;
    checks: HealthCheckResult[];
    summary: string;                // 2-sentence summary
    topIssues: HealthCheckResult[]; // top 3 worst scores
}

export interface NGram {
    gram: string;
    n: number;              // 1, 2, or 3
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    termCount: number;      // how many distinct search terms contain this gram
    ctr: number;
    cpc: number;
    roas: number | null;
    conversionRate: number;
}

export interface SearchTermInput {
    searchTerm: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
}

// ============================================================
// HEALTH SCORE CALCULATOR
// ============================================================

export function calculateHealthScore(
    campaigns: CampaignPerformance[],
    adGroups: AdGroupPerformance[],
    keywords: KeywordWithQS[],
    ads: AdWithStrength[],
    negativeKeywords: NegativeKeyword[],
    searchTerms?: SearchTermInput[],
    auctionInsights?: AuctionInsight[],
    deviceStats?: AccountDevicePerformance[],
    assetPerformance?: AssetPerformance[],
    changeEvents?: ChangeEvent[],
    conversionActions?: ConversionAction[],
    pmaxProducts?: PMaxProductPerformance[]
): HealthScoreReport {

    const checks: HealthCheckResult[] = [];

    // ── CHECK 1: Conversion Tracking Health ──────────────────

    // ── CHECK 1: Conversion Tracking Health ──────────────────

    // Smart Filter: Include Enabled campaigns OR Paused campaigns with data (impressions > 0)
    const enabledCampaigns = campaigns.filter(c => c.status === 'ENABLED' || c.impressions > 0);
    const enabledCampaignIds = new Set(enabledCampaigns.map(c => c.id));

    // Smart Filter: Include Enabled Ad Groups OR Paused Ad Groups with data, belonging to valid campaigns
    const enabledAdGroupIds = new Set(adGroups
        .filter(ag => (ag.status === 'ENABLED' || ag.impressions > 0) && enabledCampaignIds.has(ag.campaignId))
        .map(ag => ag.id)
    );

    const totalConversions = enabledCampaigns.reduce((sum, c) => sum + c.conversions, 0);
    const campaignsWithConversions = enabledCampaigns.filter(c => c.conversions > 0).length;
    const convTrackingPct = enabledCampaigns.length > 0
        ? (campaignsWithConversions / enabledCampaigns.length) * 100
        : 0;

    let convScore: number;
    let convStatus: HealthCheckResult['status'];
    let convFinding: string;
    let convRecommendation: string;

    if (totalConversions === 0) {
        convScore = 0;
        convStatus = 'CRITICAL';
        convFinding = 'No conversions tracked across any campaign. All optimization signals are blind.';
        convRecommendation = 'Implement conversion tracking immediately — without it, Smart Bidding and analysis are meaningless.';
    } else if (convTrackingPct < 50) {
        convScore = 30;
        convStatus = 'CRITICAL';
        convFinding = `Only ${campaignsWithConversions}/${enabledCampaigns.length} campaigns (${convTrackingPct.toFixed(0)}%) have conversions. Significant blind spots.`;
        convRecommendation = 'Check conversion actions in campaigns with 0 conversions — likely missing tags or wrong attribution window.';
    } else if (convTrackingPct < 80) {
        convScore = 60;
        convStatus = 'WARNING';
        convFinding = `${campaignsWithConversions}/${enabledCampaigns.length} campaigns tracking conversions. Some gaps remain.`;
        convRecommendation = 'Audit non-converting campaigns for tracking issues vs. genuine low performance.';
    } else if (totalConversions < 30) {
        convScore = 70;
        convStatus = 'WARNING';
        convFinding = `Conversion tracking active but only ${Math.round(totalConversions)} total conversions — insufficient for Smart Bidding optimization.`;
        convRecommendation = 'Consider adding micro-conversions (add-to-cart, begin checkout) to increase signal volume. Smart Bidding needs 30+ conv/month per campaign.';
    } else {
        convScore = 95;
        convStatus = 'EXCELLENT';
        convFinding = `${Math.round(totalConversions)} conversions across ${campaignsWithConversions} campaigns. Strong signal.`;
        convRecommendation = 'Conversion tracking is healthy. Consider auditing conversion action mix for accuracy.';
    }

    checks.push({
        name: 'Conversion Tracking',
        category: 'CONVERSION_TRACKING',
        score: convScore,
        weight: 3.0,  // highest weight — without conversions everything else is meaningless
        status: convStatus,
        finding: convFinding,
        recommendation: convRecommendation,
        dataPoints: {
            totalConversions: Math.round(totalConversions),
            campaignsWithConversions,
            totalCampaigns: enabledCampaigns.length,
            convTrackingPct: Math.round(convTrackingPct),
        },
    });

    // ── CHECK 2: Quality Score Distribution ──────────────────
    // Filter: QS exists + (Keyword is ENABLED OR has data) + in valid Ad Group
    const keywordsWithQS = keywords.filter(k =>
        k.qualityScore !== null &&
        k.qualityScore !== undefined &&
        (k.status === 'ENABLED' || k.impressions > 0) &&
        enabledAdGroupIds.has(k.adGroupId)
    );
    const totalKWs = keywordsWithQS.length;

    if (totalKWs > 0) {
        const qsLow = keywordsWithQS.filter(k => k.qualityScore! < 5).length;
        const qsMid = keywordsWithQS.filter(k => k.qualityScore! >= 5 && k.qualityScore! < 7).length;
        const qsHigh = keywordsWithQS.filter(k => k.qualityScore! >= 7).length;
        const avgQS = keywordsWithQS.reduce((sum, k) => sum + k.qualityScore!, 0) / totalKWs;

        // Weight by impressions for more accurate assessment
        const impressionWeightedQS = keywordsWithQS.reduce((sum, k) => sum + (k.qualityScore! * k.impressions), 0);
        const totalImpressions = keywordsWithQS.reduce((sum, k) => sum + k.impressions, 0);
        const weightedAvgQS = totalImpressions > 0 ? impressionWeightedQS / totalImpressions : avgQS;

        const lowQSPct = (qsLow / totalKWs) * 100;
        let qsScore: number;
        let qsStatus: HealthCheckResult['status'];

        if (weightedAvgQS >= 7) {
            qsScore = 90 + Math.min(10, (weightedAvgQS - 7) * 3.3);
            qsStatus = 'EXCELLENT';
        } else if (weightedAvgQS >= 5) {
            qsScore = 50 + (weightedAvgQS - 5) * 20;
            qsStatus = lowQSPct > 30 ? 'WARNING' : 'GOOD';
        } else {
            qsScore = Math.max(10, weightedAvgQS * 10);
            qsStatus = 'CRITICAL';
        }

        // Identify worst QS component
        const belowAvgCtr = keywordsWithQS.filter(k => k.expectedCtr === 'BELOW_AVERAGE' || k.expectedCtr === '2').length;
        const belowAvgLP = keywordsWithQS.filter(k => k.landingPageExperience === 'BELOW_AVERAGE' || k.landingPageExperience === '2').length;
        const belowAvgRel = keywordsWithQS.filter(k => k.adRelevance === 'BELOW_AVERAGE' || k.adRelevance === '2').length;
        const worstComponent = belowAvgCtr >= belowAvgLP && belowAvgCtr >= belowAvgRel
            ? 'Expected CTR'
            : belowAvgLP >= belowAvgRel
                ? 'Landing Page Experience'
                : 'Ad Relevance';

        checks.push({
            name: 'Quality Score',
            category: 'QUALITY_SCORE',
            score: Math.round(qsScore),
            weight: 2.5,
            status: qsStatus,
            finding: `Impression-weighted avg QS: ${weightedAvgQS.toFixed(1)}/10. ${qsLow} keywords below 5 (${lowQSPct.toFixed(0)}%). Weakest component: ${worstComponent}.`,
            recommendation: qsScore < 60
                ? `Focus on improving ${worstComponent}. ${worstComponent === 'Landing Page Experience' ? 'Audit page speed and relevance.' : worstComponent === 'Ad Relevance' ? 'Tighten keyword-to-ad copy alignment.' : 'Test new ad copy to improve CTR.'}`
                : `QS is healthy overall. Monitor the ${qsLow} low-QS keywords — consider pausing if they also have low conversion rates.`,
            dataPoints: {
                avgQS: Number(avgQS.toFixed(1)),
                weightedAvgQS: Number(weightedAvgQS.toFixed(1)),
                distribution: { low: qsLow, mid: qsMid, high: qsHigh },
                totalKeywords: totalKWs,
                worstComponent,
                belowAvgCounts: { ctr: belowAvgCtr, lp: belowAvgLP, relevance: belowAvgRel },
            },
        });
    } else {
        checks.push({
            name: 'Quality Score',
            category: 'QUALITY_SCORE',
            score: 0,
            weight: 2.5,
            status: 'CRITICAL',
            finding: 'No Quality Score data available. Likely no active keywords or all keywords lack sufficient data.',
            recommendation: 'Ensure search campaigns have active keywords with impressions to generate QS data.',
            dataPoints: { totalKeywords: 0 },
        });
    }

    // ── CHECK 3: Ad Strength Distribution ────────────────────
    // Filter to only include ads from ENABLED ad groups and Enabled campaigns
    // Note: enabledCampaigns is already filtered above.
    // Note: enabledAdGroupIds is already calculated at the top.

    const adsWithStrength = ads.filter(a =>
        ['POOR', 'AVERAGE', 'GOOD', 'EXCELLENT'].includes(a.adStrength) &&
        enabledAdGroupIds.has(a.adGroupId) &&
        a.status === 'ENABLED'
    );

    if (adsWithStrength.length > 0) {
        const poor = adsWithStrength.filter(a => a.adStrength === 'POOR').length;
        const avg = adsWithStrength.filter(a => a.adStrength === 'AVERAGE').length;
        const good = adsWithStrength.filter(a => a.adStrength === 'GOOD').length;
        const excellent = adsWithStrength.filter(a => a.adStrength === 'EXCELLENT').length;
        const poorPct = (poor / adsWithStrength.length) * 100;

        const strengthScore = Math.round(
            ((excellent * 100 + good * 75 + avg * 50 + poor * 15) / adsWithStrength.length)
        );

        checks.push({
            name: 'Ad Strength',
            category: 'AD_STRENGTH',
            score: strengthScore,
            weight: 1.5,
            status: poorPct > 40 ? 'CRITICAL' : poorPct > 20 ? 'WARNING' : strengthScore > 70 ? 'EXCELLENT' : 'GOOD',
            finding: `${adsWithStrength.length} active ads scored: ${excellent} Excellent, ${good} Good, ${avg} Average, ${poor} Poor (${poorPct.toFixed(0)}% poor).`,
            recommendation: poor > 0
                ? `Improve ${poor} POOR ads in active ad groups by adding more unique headlines (aim for 10+) and descriptions (4+). Focus on ads with highest spend first.`
                : 'Ad strength is healthy. Continue A/B testing headlines.',
            dataPoints: { excellent, good, average: avg, poor, total: adsWithStrength.length },
        });
    }

    // ── CHECK 4: Impression Share ────────────────────────────
    const searchCampaigns = enabledCampaigns.filter(c =>
        c.advertisingChannelType === 'SEARCH' || c.advertisingChannelType === '2'
    );
    const campaignsWithIS = searchCampaigns.filter(c => c.searchImpressionShare !== null);

    if (campaignsWithIS.length > 0) {
        // Cost-weighted IS calculation
        const totalSearchCost = campaignsWithIS.reduce((sum, c) => sum + c.cost, 0);
        const weightedIS = totalSearchCost > 0
            ? campaignsWithIS.reduce((sum, c) => sum + (c.searchImpressionShare! * c.cost), 0) / totalSearchCost
            : campaignsWithIS.reduce((sum, c) => sum + c.searchImpressionShare!, 0) / campaignsWithIS.length;

        const weightedBudgetLost = totalSearchCost > 0
            ? campaignsWithIS.reduce((sum, c) => sum + ((c.searchLostISBudget || 0) * c.cost), 0) / totalSearchCost
            : 0;
        const weightedRankLost = totalSearchCost > 0
            ? campaignsWithIS.reduce((sum, c) => sum + ((c.searchLostISRank || 0) * c.cost), 0) / totalSearchCost
            : 0;

        const isScore = Math.min(100, Math.round(weightedIS * 120)); // slight bonus for high IS
        const primaryLoss = weightedBudgetLost > weightedRankLost ? 'budget' : 'rank';

        checks.push({
            name: 'Impression Share',
            category: 'IMPRESSION_SHARE',
            score: isScore,
            weight: 2.0,
            status: weightedIS < 0.4 ? 'CRITICAL' : weightedIS < 0.6 ? 'WARNING' : weightedIS < 0.8 ? 'GOOD' : 'EXCELLENT',
            finding: `Cost-weighted Search IS: ${(weightedIS * 100).toFixed(1)}%. Lost to ${primaryLoss}: ${((primaryLoss === 'budget' ? weightedBudgetLost : weightedRankLost) * 100).toFixed(1)}%.`,
            recommendation: primaryLoss === 'budget'
                ? `Primary IS loss is from budget constraints (${(weightedBudgetLost * 100).toFixed(1)}%). Consider increasing daily budgets on high-ROAS campaigns.`
                : `Primary IS loss is from Ad Rank (${(weightedRankLost * 100).toFixed(1)}%). Improve Quality Score and/or increase bids on high-converting campaigns.`,
            dataPoints: {
                weightedIS: Number((weightedIS * 100).toFixed(1)),
                budgetLost: Number((weightedBudgetLost * 100).toFixed(1)),
                rankLost: Number((weightedRankLost * 100).toFixed(1)),
                campaignsAnalyzed: campaignsWithIS.length,
            },
        });
    }

    // ── CHECK 5: Budget Efficiency (ROAS distribution) ──────
    const campaignsWithROAS = enabledCampaigns.filter(c => c.roas !== null && c.cost > 0);
    if (campaignsWithROAS.length > 0) {
        const totalCost = campaignsWithROAS.reduce((sum, c) => sum + c.cost, 0);
        const totalValue = campaignsWithROAS.reduce((sum, c) => sum + c.conversionValue, 0);
        const blendedROAS = totalCost > 0 ? totalValue / totalCost : 0;

        const profitableCampaigns = campaignsWithROAS.filter(c => (c.roas || 0) >= 2);
        const wastefulCampaigns = campaignsWithROAS.filter(c => c.cost > 0 && (c.roas || 0) < 1);
        const wastefulSpend = wastefulCampaigns.reduce((sum, c) => sum + c.cost, 0);
        const wastefulPct = totalCost > 0 ? (wastefulSpend / totalCost) * 100 : 0;

        let budgetScore: number;
        if (blendedROAS >= 5) budgetScore = 90;
        else if (blendedROAS >= 3) budgetScore = 75;
        else if (blendedROAS >= 1.5) budgetScore = 55;
        else budgetScore = 25;

        // Penalize for wasteful spend
        budgetScore = Math.max(0, budgetScore - (wastefulPct * 0.5));

        checks.push({
            name: 'ROAS Efficiency',
            category: 'BUDGET_EFFICIENCY',
            score: Math.round(budgetScore),
            weight: 2.0,
            status: budgetScore < 40 ? 'CRITICAL' : budgetScore < 60 ? 'WARNING' : budgetScore < 80 ? 'GOOD' : 'EXCELLENT',
            finding: `Blended ROAS: ${blendedROAS.toFixed(1)}x. ${profitableCampaigns.length}/${campaignsWithROAS.length} campaigns profitable (>2x). ${wastefulPct.toFixed(0)}% of spend on sub-1x ROAS campaigns.`,
            recommendation: wastefulCampaigns.length > 0
                ? `${wastefulCampaigns.length} campaigns have ROAS below 1x, consuming €${wastefulSpend.toFixed(2)} (${wastefulPct.toFixed(0)}% of total). Review or pause: ${wastefulCampaigns.slice(0, 3).map(c => `"${c.name}"`).join(', ')}.`
                : 'All campaigns profitable. Consider reallocating budget from low-ROAS to high-ROAS campaigns.',
            dataPoints: {
                blendedROAS: Number(blendedROAS.toFixed(2)),
                profitableCampaigns: profitableCampaigns.length,
                wastefulCampaigns: wastefulCampaigns.length,
                wastefulSpend: Number(wastefulSpend.toFixed(2)),
                wastefulPct: Number(wastefulPct.toFixed(1)),
                totalCost: Number(totalCost.toFixed(2)),
            },
        });
    }

    // ── CHECK 6: Account Structure (ad groups per campaign, ads per ad group) ──
    const enabledAdGroups = adGroups.filter(ag => ag.status === 'ENABLED');
    const agPerCampaign = new Map<string, number>();
    enabledAdGroups.forEach(ag => {
        agPerCampaign.set(ag.campaignId, (agPerCampaign.get(ag.campaignId) || 0) + 1);
    });

    // FIX: Only count ads in enabled ad groups to prevent bloatedAdGroups > totalAdGroups
    const structureAdGroupIds = new Set(enabledAdGroups.map(ag => ag.id));
    // FIX: Only count ENABLED ads to avoid flagging paused historical ads
    const enabledAds = ads.filter(ad => structureAdGroupIds.has(ad.adGroupId) && ad.status === 'ENABLED');

    const adsPerAdGroup = new Map<string, number>();
    enabledAds.forEach(ad => {
        adsPerAdGroup.set(ad.adGroupId, (adsPerAdGroup.get(ad.adGroupId) || 0) + 1);
    });

    const bloatedAdGroups = Array.from(adsPerAdGroup.entries())
        .filter(([_, count]) => count > 3)
        .map(([agId, count]) => ({ agId, count }));

    const emptyAdGroups = enabledAdGroups.filter(ag => {
        const adCount = adsPerAdGroup.get(ag.id) || 0;
        return adCount === 0;
    });

    const overloadedCampaigns = Array.from(agPerCampaign.entries())
        .filter(([_, count]) => count > 20);

    let structureScore = 80; // start from a decent baseline
    if (bloatedAdGroups.length > 0) {
        structureScore -= Math.min(30, bloatedAdGroups.length * 5);
    }
    if (emptyAdGroups.length > 0) {
        structureScore -= Math.min(20, emptyAdGroups.length * 3);
    }
    if (overloadedCampaigns.length > 0) {
        structureScore -= Math.min(20, overloadedCampaigns.length * 10);
    }
    structureScore = Math.max(0, Math.min(100, structureScore));

    const structureIssues: string[] = [];
    if (bloatedAdGroups.length > 0) {
        const worst = bloatedAdGroups.sort((a, b) => b.count - a.count)[0];
        structureIssues.push(`${bloatedAdGroups.length} ad groups with >3 ads (worst: ${worst.count} ads)`);
    }
    if (emptyAdGroups.length > 0) {
        structureIssues.push(`${emptyAdGroups.length} enabled ad groups with 0 ads`);
    }
    if (overloadedCampaigns.length > 0) {
        structureIssues.push(`${overloadedCampaigns.length} campaigns with >20 ad groups — data fragmentation risk`);
    }

    checks.push({
        name: 'Account Structure',
        category: 'STRUCTURE',
        score: structureScore,
        weight: 1.5,
        status: structureScore < 40 ? 'CRITICAL' : structureScore < 60 ? 'WARNING' : structureScore < 80 ? 'GOOD' : 'EXCELLENT',
        finding: structureIssues.length > 0
            ? structureIssues.join('. ') + '.'
            : 'Account structure is clean — reasonable ad group counts and ad distribution.',
        recommendation: bloatedAdGroups.length > 0
            ? `Google recommends 2-3 RSA per ad group. ${bloatedAdGroups.length} ad groups exceed this — consolidate or pause low-performers.`
            : 'Structure looks good. No action needed.',
        dataPoints: {
            totalAdGroups: enabledAdGroups.length,
            bloatedAdGroups: bloatedAdGroups.length,
            emptyAdGroups: emptyAdGroups.length,
            overloadedCampaigns: overloadedCampaigns.length,
            avgAdsPerAdGroup: adsPerAdGroup.size > 0
                ? Number((enabledAds.length / adsPerAdGroup.size).toFixed(1))
                : 0,
        },
    });

    // ── CHECK 7: Negative Keyword Coverage ───────────────────
    const totalSearchKWs = keywords.length;
    const negKWCount = negativeKeywords.length;
    const negRatio = totalSearchKWs > 0 ? negKWCount / totalSearchKWs : 0;

    // Also check search term waste if available
    let wastedTermsPct = 0;
    let wastedCost = 0;
    if (searchTerms && searchTerms.length > 0) {
        const zeroConvTerms = searchTerms.filter(st => st.conversions === 0 && st.cost > 0);
        wastedCost = zeroConvTerms.reduce((sum, st) => sum + st.cost, 0);
        const totalSTCost = searchTerms.reduce((sum, st) => sum + st.cost, 0);
        wastedTermsPct = totalSTCost > 0 ? (wastedCost / totalSTCost) * 100 : 0;
    }

    let negScore: number;
    if (negKWCount === 0) {
        negScore = 15;
    } else if (negRatio < 0.3) {
        negScore = 40;
    } else if (negRatio < 0.7) {
        negScore = 65;
    } else {
        negScore = 85;
    }

    // Penalize if high waste in search terms
    if (wastedTermsPct > 40) negScore = Math.max(10, negScore - 25);
    else if (wastedTermsPct > 25) negScore = Math.max(20, negScore - 15);

    checks.push({
        name: 'Negative Keywords',
        category: 'NEGATIVE_KEYWORDS',
        score: Math.round(negScore),
        weight: 1.5,
        status: negScore < 40 ? 'CRITICAL' : negScore < 60 ? 'WARNING' : negScore < 80 ? 'GOOD' : 'EXCELLENT',
        finding: `${negKWCount} negative keywords for ${totalSearchKWs} active keywords (ratio: ${negRatio.toFixed(1)}:1).${(searchTerms && searchTerms.length > 0) ? ` Search term waste: ${wastedTermsPct.toFixed(0)}% of spend on 0-conversion terms (€${wastedCost.toFixed(2)}).` : ''}`,
        recommendation: negKWCount === 0
            ? 'CRITICAL: No negative keywords found. Run a search term report immediately and add negatives for irrelevant queries.'
            : wastedTermsPct > 30
                ? `${wastedTermsPct.toFixed(0)}% of search term spend produces 0 conversions. Use n-gram analysis to identify systematic waste patterns.`
                : 'Negative keyword coverage is adequate. Continue regular search term reviews.',
        dataPoints: {
            negativeKeywords: negKWCount,
            activeKeywords: totalSearchKWs,
            ratio: Number(negRatio.toFixed(2)),
            wastedTermsPct: Number(wastedTermsPct.toFixed(1)),
            wastedCost: Number(wastedCost.toFixed(2)),
        },
    });

    // ── CHECK 8: Match Type Balance ──────────────────────────
    const matchTypes = {
        // EXACT: 2, 'EXACT'
        exact: keywords.filter(k => ['EXACT', '2', 'EXACT_MATCH'].includes(k.matchType.toUpperCase())).length,
        // PHRASE: 3, 'PHRASE'
        phrase: keywords.filter(k => ['PHRASE', '3', 'PHRASE_MATCH', '5'].includes(k.matchType.toUpperCase())).length, // kept 5 just in case of legacy manual map
        // BROAD: 4, 'BROAD'
        broad: keywords.filter(k => ['BROAD', '4', 'BROAD_MATCH'].includes(k.matchType.toUpperCase())).length,
    };
    const totalMatchTyped = matchTypes.exact + matchTypes.phrase + matchTypes.broad;

    if (totalMatchTyped > 0) {
        const broadPct = (matchTypes.broad / totalMatchTyped) * 100;
        const exactPct = (matchTypes.exact / totalMatchTyped) * 100;

        let matchScore: number;
        let matchStatus: HealthCheckResult['status'];
        let matchFinding: string;
        let matchRecommendation: string;
        // Ideal: mix of match types. All-broad or all-exact both have drawbacks.
        if (broadPct > 70) {
            matchScore = 35; // too broad = waste risk
            matchStatus = 'WARNING';
            matchFinding = `High reliance on Broad match (${broadPct.toFixed(0)}%). Risk of wasted spend on irrelevant terms.`;
            matchRecommendation = 'Add more Phrase/Exact match keywords and negative keywords to control quality.';
        } else if (exactPct > 80) {
            matchScore = 55; // too restrictive = missing opportunities
            matchStatus = 'WARNING';
            matchFinding = `High reliance on Exact match (${exactPct.toFixed(0)}%). You might be missing volume and cheap clicks.`;
            matchRecommendation = 'Test Broad Match with Smart Bidding to find new converting terms.';
        } else if (broadPct >= 20 && broadPct <= 50 && exactPct >= 20) {
            matchScore = 90; // healthy mix
            matchStatus = 'EXCELLENT';
            matchFinding = `Match type mix: ${matchTypes.exact} exact (${exactPct.toFixed(0)}%), ${matchTypes.phrase} phrase, ${matchTypes.broad} broad (${broadPct.toFixed(0)}%).`;
            matchRecommendation = 'Match type distribution is balanced.';
        } else {
            matchScore = 65;
            matchStatus = 'GOOD';
            matchFinding = `Match type mix: ${matchTypes.exact} exact (${exactPct.toFixed(0)}%), ${matchTypes.phrase} phrase, ${matchTypes.broad} broad (${broadPct.toFixed(0)}%).`;
            matchRecommendation = 'Match type distribution is balanced.';
        }

        checks.push({
            name: 'Match Type Balance',
            category: 'MATCH_TYPE_BALANCE',
            score: matchScore,
            weight: 1.5,
            status: matchStatus,
            finding: matchFinding,
            recommendation: matchRecommendation,
            dataPoints: matchTypes,
        });
    }

    // ── CHECK 9: Market Competition (Auction Insights) ───────
    if (auctionInsights && auctionInsights.length > 0) {
        // Find top competitor by overlap rate
        const topCompetitor = auctionInsights
            .filter(a => a.competitor !== 'Unknown' && a.competitor !== 'monitor.clickcease.com') // filter internal/tools
            .sort((a, b) => (b.overlapRate || 0) - (a.overlapRate || 0))[0];

        let compScore = 100;
        let compStatus: HealthCheckResult['status'] = 'EXCELLENT';
        let compFinding = 'You are the dominant player in your auctions.';
        let compRec = 'Maintain current aggressive strategy.';

        if (topCompetitor) {
            const overlap = (topCompetitor.overlapRate || 0) * 100;
            const outranking = (topCompetitor.outrankingShare || 0) * 100;
            const myIS = 100; // API doesn't give my IS directly here usually, but we can infer relative strength
            // Actually, we can check if we outrank them more than 50% of time.

            // If we outrank them < 20% of the time, they are dominating us.
            if (outranking < 20 && overlap > 20) {
                compScore = 40;
                compStatus = 'CRITICAL';
                compFinding = `Dominant competitor '${topCompetitor.competitor}' appears in ${overlap.toFixed(0)}% of your auctions but you outrank them only ${outranking.toFixed(0)}% of the time.`;
                compRec = 'Market share is bleeding. Increase bids or improve Quality Score to regain visibility against this competitor.';
            } else if (outranking < 50 && overlap > 30) {
                compScore = 65;
                compStatus = 'WARNING';
                compFinding = `Strong competition from '${topCompetitor.competitor}'. You outrank them ${outranking.toFixed(0)}% of the time.`;
                compRec = 'Review their ad copy and offer. Consider "Target Impression Share" strategy to explicitly outrank them.';
            } else {
                compScore = 90;
                compStatus = 'GOOD';
                compFinding = `You are holding your ground against '${topCompetitor.competitor}' (Outranking share: ${outranking.toFixed(0)}%).`;
                compRec = 'Monitor their moves. If they increase aggression, be ready to respond.';
            }
        }

        checks.push({
            name: 'Market Competition',
            category: 'MARKET_COMPETITION',
            score: compScore,
            weight: 1.5,
            status: compStatus,
            finding: compFinding,
            recommendation: compRec,
            dataPoints: { topCompetitor: topCompetitor?.competitor },
        });
    }

    // ── CHECK 10: Device Performance ─────────────────────────
    if (deviceStats && deviceStats.length > 0) {
        // deviceStats is now aggregated by getAccountDeviceStats, so finding 'MOBILE' finds the account-wide mobile stats
        const mobile = deviceStats.find(d => d.device === 'MOBILE');
        const desktop = deviceStats.find(d => d.device === 'DESKTOP');

        if (mobile && desktop && (mobile.cost > 10 || desktop.cost > 10)) { // meaningful spend (lowered threshold)
            const mobileCPA = mobile.cpa || 0;
            const desktopCPA = desktop.cpa || 0;
            const mobileROAS = mobile.roas || 0;
            const desktopROAS = desktop.roas || 0;

            let devScore = 100;
            let devStatus: HealthCheckResult['status'] = 'EXCELLENT';
            let devFinding = 'Device performance is balanced.';
            let devRec = 'No major device bid adjustments needed.';

            // Check if Mobile is significantly worse
            if (mobileCPA > desktopCPA * 1.5 && desktopCPA > 0) {
                devScore = 50;
                devStatus = 'WARNING';
                devFinding = `Mobile CPA (€${mobileCPA.toFixed(2)}) is 50%+ higher than Desktop (€${desktopCPA.toFixed(2)}).`;
                devRec = 'Apply negative bid adjustment (-20% to -50%) for Mobile users.';
            } else if (desktopCPA > mobileCPA * 1.5 && mobileCPA > 0) {
                devScore = 60;
                devStatus = 'WARNING';
                devFinding = `Desktop CPA (€${desktopCPA.toFixed(2)}) is much higher than Mobile (€${mobileCPA.toFixed(2)}).`;
                devRec = 'Verify desktop landing page experience or adjust bids down for Desktop.';
            } else if (mobileROAS < desktopROAS * 0.6 && desktopROAS > 0) {
                devScore = 55;
                devStatus = 'WARNING';
                devFinding = `Mobile ROAS (${mobileROAS.toFixed(2)}) is usually low compared to Desktop (${desktopROAS.toFixed(2)}).`;
                devRec = 'Mobile traffic is converting poorly. Check mobile site speed and UX.';
            }

            checks.push({
                name: 'Device Performance',
                category: 'DEVICE_PERFORMANCE',
                score: devScore,
                weight: 1.5,
                status: devStatus,
                finding: devFinding,
                recommendation: devRec,
                dataPoints: {
                    mobileCpa: mobileCPA,
                    desktopCpa: desktopCPA,
                    mobileRoas: mobileROAS,
                    desktopRoas: desktopROAS
                },
            });
        } else {
            checks.push({
                name: 'Device Performance',
                category: 'DEVICE_PERFORMANCE',
                score: 0,
                weight: 0,
                status: 'WARNING',
                finding: 'Insufficient data for Mobile vs Desktop comparison (spend < €10).',
                recommendation: 'Wait for more traffic across devices to analyze performance differences.',
                dataPoints: {},
            });
        }
    } else {
        checks.push({
            name: 'Device Performance',
            category: 'DEVICE_PERFORMANCE',
            score: 0,
            weight: 0,
            status: 'WARNING',
            finding: 'No device-level performance data found.',
            recommendation: 'Ensure campaigns are active and have spent budget in the selected period. Device segmentation requires at least some impressions per device type.',
            dataPoints: {},
        });
    }

    // ── CHECK 11: Budget Efficiency ──────────────────────────
    // Existing check might cover basics, but this is explicit for "Budget Efficiency" category
    const constrainedCampaigns = enabledCampaigns.filter(c =>
        (c.searchLostISBudget && c.searchLostISBudget > 0.1) ||
        (c.budgetStatus === 'LIMITED' || c.budgetStatus === 'LIMITED_BY_BUDGET') // Logic from our newly added field might be needed
    );

    // Note: getCampaigns returns numeric budget status? No, we mapped it to string 'budgetStatus' in lib/google-ads.ts
    // Let's rely on searchLostISBudget which is the metric.

    if (constrainedCampaigns.length > 0) {
        const topConstrained = constrainedCampaigns.sort((a, b) => (b.conversions || 0) - (a.conversions || 0))[0];
        const lostRate = (topConstrained.searchLostISBudget || 0) * 100;

        let budScore = 100;
        let budStatus: HealthCheckResult['status'] = 'GOOD';

        if (lostRate > 50) {
            budScore = 40;
            budStatus = 'CRITICAL';
        } else if (lostRate > 20) {
            budScore = 65;
            budStatus = 'WARNING';
        } else {
            budScore = 85;
        }

        checks.push({
            name: 'Budget Efficiency',
            category: 'BUDGET_EFFICIENCY',
            score: budScore,
            weight: 1.8,
            status: budStatus,
            finding: `${constrainedCampaigns.length} campaigns limited by budget. Top perfomer '${topConstrained.name}'${topConstrained.status !== 'ENABLED' ? ` (${topConstrained.status})` : ''} loses ${lostRate.toFixed(0)}% impressions due to budget.`,
            recommendation: 'Increase budget or lower tCPA/tROAS targets to capture cheap clicks instead of maxing out early.',
            dataPoints: { lostRate, campaign: topConstrained.name }
        });
    } else {
        checks.push({
            name: 'Budget Efficiency',
            category: 'BUDGET_EFFICIENCY',
            score: 100,
            weight: 1.0,
            status: 'EXCELLENT',
            finding: 'No campaigns are significantly limited by budget.',
            recommendation: 'Budget is sufficient for current demand.',
            dataPoints: { constrainedCount: 0 },
        });
    }

    // ── CHECK 12: Asset Performance ──────────────────────────
    if (assetPerformance && assetPerformance.length > 0) {
        const totalAssets = assetPerformance.length;
        const disapproved = assetPerformance.filter(a =>
            a.approvalStatus !== 'APPROVED' &&
            a.approvalStatus !== 'APPROVED_LIMITED' &&
            a.approvalStatus !== 'ENABLED' // API v22: enabled assets are effectively approved
        ).length;
        const poorPerf = assetPerformance.filter(a => a.performanceLabel === 'POOR').length;
        const goodPerf = assetPerformance.filter(a => ['GOOD', 'BEST', 'EXCELLENT'].includes(a.performanceLabel || '')).length;

        const disapprovalPct = (disapproved / totalAssets) * 100;
        const poorPct = (poorPerf / totalAssets) * 100;

        let assetScore = 100;
        let assetStatus: HealthCheckResult['status'] = 'EXCELLENT';

        if (disapprovalPct > 10) {
            assetScore = 40;
            assetStatus = 'CRITICAL';
        } else if (poorPct > 30) {
            assetScore = 60;
            assetStatus = 'WARNING';
        } else if (goodPerf < totalAssets * 0.3) {
            assetScore = 75;
            assetStatus = 'GOOD';
        }

        checks.push({
            name: 'Asset Performance',
            category: 'ASSET_PERFORMANCE',
            score: assetScore,
            weight: 1.5,
            status: assetStatus,
            finding: `${disapproved} assets disapproved, ${poorPerf} performing poorly. ${goodPerf} rated Good/Best.`,
            recommendation: disapproved > 0
                ? 'Fix disapproved assets immediately to avoid policy flags.'
                : poorPerf > 0
                    ? 'Replace "Poor" performing assets with new variations.'
                    : 'Asset health is solid.',
            dataPoints: { total: totalAssets, disapproved, poor: poorPerf, good: goodPerf }
        });
    }

    // ── CHECK 13: Change History Check ───────────────────────
    if (changeEvents) { // Allow empty array to trigger "no changes" logic
        const changeCount = changeEvents.length;
        let changeScore = 100;
        let changeStatus: HealthCheckResult['status'] = 'GOOD';
        let changeFinding = `Recent activity: ${changeCount} changes detected.`;
        let changeRec = 'Maintain regular optimization cadence.';

        if (changeCount === 0) {
            changeScore = 30; // Neglected account?
            changeStatus = 'WARNING';
            changeFinding = 'No changes detected in the recent period. Account may be neglected.';
            changeRec = 'Resume regular optimizations to maintain performance.';
        } else if (changeCount > 1000) {
            changeScore = 60;
            changeStatus = 'WARNING';
            changeFinding = `High volume of changes (${changeCount}). Potential erratic automation or panic editing.`;
            changeRec = 'Verify that automated rules are not flapping or over-optimizing.';
        }

        checks.push({
            name: 'Account Activity',
            category: 'CHANGE_HISTORY',
            score: changeScore,
            weight: 1.0,
            status: changeStatus,
            finding: changeFinding,
            recommendation: changeRec,
            dataPoints: { changeCount }
        });
    }

    // ── CHECK 14: Conversion Action Health ───────────────────
    if (conversionActions && conversionActions.length > 0) {
        // Filter for primary actions that should be driving value
        const primaryActions = conversionActions.filter(ca => ca.status === 'ENABLED' && ca.includeInConversionsMetric);
        const actionsWithZeroConv = primaryActions.filter(ca => ca.allConversions === 0);

        let convHealthScore = 100;
        let convHealthStatus: HealthCheckResult['status'] = 'EXCELLENT';
        let convHealthRec = 'Conversion actions are healthy.';

        if (primaryActions.length === 0) {
            convHealthScore = 0;
            convHealthStatus = 'CRITICAL';
            convHealthRec = 'No primary conversion actions enabled!';
        } else if (actionsWithZeroConv.length > 0) {
            convHealthScore = 60;
            convHealthStatus = 'WARNING';
            convHealthRec = `Investigate ${actionsWithZeroConv.length} primary conversion actions with 0 reported conversions.`;
        }

        checks.push({
            name: 'Conversion Config',
            category: 'CONVERSION_ACTIONS',
            score: convHealthScore,
            weight: 2.0,
            status: convHealthStatus,
            finding: `${primaryActions.length} primary actions. ${actionsWithZeroConv.length} have 0 conversions recently.`,
            recommendation: convHealthRec,
            dataPoints: {
                totalPrimary: primaryActions.length,
                zeroConvCount: actionsWithZeroConv.length,
                names: actionsWithZeroConv.map(a => a.name).slice(0, 3)
            }
        });
    }

    // ── CHECK 15: PMax Product Health ────────────────────────
    if (pmaxProducts && pmaxProducts.length > 0) {
        const totalProducts = pmaxProducts.length;
        const zeroImpressionProducts = pmaxProducts.filter(p => p.impressions === 0).length;
        const zeroImpPct = (zeroImpressionProducts / totalProducts) * 100;

        let pmaxScore = 100;
        let pmaxStatus: HealthCheckResult['status'] = 'EXCELLENT';

        if (zeroImpPct > 80) {
            pmaxScore = 40;
            pmaxStatus = 'CRITICAL';
        } else if (zeroImpPct > 50) {
            pmaxScore = 60;
            pmaxStatus = 'WARNING';
        } else if (zeroImpPct > 20) {
            pmaxScore = 80;
            pmaxStatus = 'GOOD';
        }

        checks.push({
            name: 'PMax Product Health',
            category: 'PMAX_PRODUCT_HEALTH',
            score: pmaxScore,
            weight: 1.5,
            status: pmaxStatus,
            finding: `${zeroImpressionProducts}/${totalProducts} products (${zeroImpPct.toFixed(0)}%) have 0 impressions.`,
            recommendation: zeroImpPct > 50
                ? 'Large catalog segment is invisible. Check Merchant Center for disapprovals or subdivide Listing Groups.'
                : 'Consider isolating zombie products into a "Catch-All" campaign with lower ROAS targets.',
            dataPoints: { totalProducts, zeroImpProducts: zeroImpressionProducts, zeroImpPct }
        });
    }

    // ── CALCULATE OVERALL SCORE ──────────────────────────────
    const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
    const weightedSum = checks.reduce((sum, c) => sum + (c.score * c.weight), 0);
    const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    const overallGrade = scoreToGrade(overallScore);

    // Category scores
    const categoryScores = {} as Record<HealthCategory, number>;
    checks.forEach(c => {
        categoryScores[c.category] = c.score;
    });

    // Top issues (worst 3)
    const topIssues = [...checks]
        .sort((a, b) => a.score - b.score)
        .slice(0, 3);

    // Summary
    const criticalCount = checks.filter(c => c.status === 'CRITICAL').length;
    const warningCount = checks.filter(c => c.status === 'WARNING').length;
    const summary = criticalCount > 0
        ? `Account health: ${overallScore}/100 (${overallGrade}). ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} requiring immediate attention: ${topIssues.filter(i => i.status === 'CRITICAL').map(i => i.name).join(', ')}.`
        : warningCount > 0
            ? `Account health: ${overallScore}/100 (${overallGrade}). ${warningCount} area${warningCount > 1 ? 's' : ''} to improve: ${topIssues.map(i => i.name).join(', ')}.`
            : `Account health: ${overallScore}/100 (${overallGrade}). All checks passed — account is in good shape.`;

    return {
        overallScore,
        overallGrade,
        categoryScores,
        checks,
        summary,
        topIssues,
    };
}

function scoreToGrade(score: number): string {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 85) return 'A-';
    if (score >= 80) return 'B+';
    if (score >= 75) return 'B';
    if (score >= 70) return 'B-';
    if (score >= 65) return 'C+';
    if (score >= 60) return 'C';
    if (score >= 55) return 'C-';
    if (score >= 50) return 'D+';
    if (score >= 45) return 'D';
    if (score >= 40) return 'D-';
    return 'F';
}

// ============================================================
// N-GRAM ANALYZER
// ============================================================

export function buildNGrams(
    searchTerms: SearchTermInput[],
    maxN: number = 3,
    minImpressions: number = 2  // filter noise
): NGram[] {
    const gramMap = new Map<string, Omit<NGram, 'ctr' | 'cpc' | 'roas' | 'conversionRate'>>();

    for (const term of searchTerms) {
        const words = term.searchTerm.toLowerCase().trim().split(/\s+/).filter(w => w.length > 0);

        for (let n = 1; n <= Math.min(maxN, words.length); n++) {
            for (let i = 0; i <= words.length - n; i++) {
                const gram = words.slice(i, i + n).join(' ');

                // Skip very short grams (articles, prepositions) for 1-grams
                if (n === 1 && gram.length <= 2) continue;

                const existing = gramMap.get(gram) || {
                    gram,
                    n,
                    impressions: 0,
                    clicks: 0,
                    cost: 0,
                    conversions: 0,
                    conversionValue: 0,
                    termCount: 0,
                };

                existing.impressions += term.impressions;
                existing.clicks += term.clicks;
                existing.cost += term.cost;
                existing.conversions += term.conversions;
                existing.conversionValue += term.conversionValue;
                existing.termCount += 1;

                gramMap.set(gram, existing);
            }
        }
    }

    // Convert to array, add calculated fields, filter
    return Array.from(gramMap.values())
        .filter(g => g.impressions >= minImpressions)
        .map(g => ({
            ...g,
            ctr: g.impressions > 0 ? g.clicks / g.impressions : 0,
            cpc: g.clicks > 0 ? g.cost / g.clicks : 0,
            roas: g.cost > 0 ? g.conversionValue / g.cost : null,
            conversionRate: g.clicks > 0 ? g.conversions / g.clicks : 0,
        }))
        .sort((a, b) => b.cost - a.cost);  // default sort: highest spend first
}

/**
 * Identify negative keyword candidates from n-grams.
 * Returns grams that have significant spend but 0 conversions.
 */
export function findNegativeCandidates(
    ngrams: NGram[],
    minCost: number = 1.0,     // minimum €1 spend to flag
    minTerms: number = 2       // must appear in at least 2 search terms
): NGram[] {
    return ngrams
        .filter(g =>
            g.conversions === 0 &&
            g.cost >= minCost &&
            g.termCount >= minTerms
        )
        .sort((a, b) => b.cost - a.cost);  // worst wasters first
}

/**
 * Identify high-value n-grams (potential keyword expansion candidates).
 */
export function findExpansionCandidates(ngrams: NGram[]): NGram[] {
    return ngrams
        .filter(g =>
            g.conversions > 0 &&
            g.termCount >= 2 &&
            (g.roas || 0) > 2
        )
        .sort((a, b) => (b.roas || 0) - (a.roas || 0));
}

// ============================================================
// FORMAT FOR PROMPT — inject into Claude's context
// ============================================================

/**
 * Formats health score as a text block for the AI prompt.
 * This becomes part of the data Claude analyzes.
 */
export function formatHealthScoreForPrompt(report: HealthScoreReport): string {
    let output = `\n=== ACCOUNT HEALTH SCORE: ${report.overallScore}/100 (${report.overallGrade}) ===\n`;
    output += `${report.summary}\n\n`;

    output += `| Check | Score | Status | Key Finding |\n`;
    output += `|-------|-------|--------|-------------|\n`;

    for (const check of report.checks) {
        output += `| ${check.name} | ${check.score}/100 | ${check.status} | ${check.finding} |\n`;
    }

    if (report.topIssues.length > 0) {
        output += `\nTOP ISSUES TO ADDRESS:\n`;
        report.topIssues.forEach((issue, i) => {
            output += `${i + 1}. [${issue.status}] ${issue.name} (${issue.score}/100): ${issue.recommendation}\n`;
        });
    }

    return output;
}

/**
 * Formats n-gram analysis as a text block for the AI prompt.
 */
export function formatNGramsForPrompt(
    ngrams: NGram[],
    negativeCandidates: NGram[],
    expansionCandidates: NGram[],
    topN: number = 20
): string {
    let output = `\n=== N-GRAM ANALYSIS ===\n`;

    // Top spending 1-grams
    const oneGrams = ngrams.filter(g => g.n === 1).slice(0, topN);
    if (oneGrams.length > 0) {
        output += `\n--- Top 1-Word Patterns (by spend) ---\n`;
        output += `| Word | Terms | Impressions | Clicks | Cost | Conv | ROAS |\n`;
        output += `|------|-------|-------------|--------|------|------|------|\n`;
        for (const g of oneGrams) {
            output += `| ${g.gram} | ${g.termCount} | ${g.impressions} | ${g.clicks} | €${g.cost.toFixed(2)} | ${g.conversions} | ${g.roas?.toFixed(1) ?? 'N/A'}x |\n`;
        }
    }

    // Top spending 2-grams
    const twoGrams = ngrams.filter(g => g.n === 2).slice(0, 15);
    if (twoGrams.length > 0) {
        output += `\n--- Top 2-Word Patterns (by spend) ---\n`;
        output += `| Phrase | Terms | Clicks | Cost | Conv | ROAS |\n`;
        output += `|--------|-------|--------|------|------|------|\n`;
        for (const g of twoGrams) {
            output += `| ${g.gram} | ${g.termCount} | ${g.clicks} | €${g.cost.toFixed(2)} | ${g.conversions} | ${g.roas?.toFixed(1) ?? 'N/A'}x |\n`;
        }
    }

    // Negative keyword candidates
    if (negativeCandidates.length > 0) {
        output += `\n--- NEGATIVE KEYWORD CANDIDATES (spend > €1, 0 conversions) ---\n`;
        output += `| Word/Phrase | Terms | Clicks | Wasted Cost | Action |\n`;
        output += `|------------|-------|--------|-------------|--------|\n`;
        for (const g of negativeCandidates.slice(0, 15)) {
            output += `| ${g.gram} | ${g.termCount} | ${g.clicks} | €${g.cost.toFixed(2)} | ADD AS NEGATIVE |\n`;
        }
        const totalWaste = negativeCandidates.reduce((sum, g) => sum + g.cost, 0);
        output += `\nTotal potential savings from negatives: €${totalWaste.toFixed(2)}/period\n`;
    }

    // Expansion candidates
    if (expansionCandidates.length > 0) {
        output += `\n--- EXPANSION CANDIDATES (converting patterns not yet targeted) ---\n`;
        for (const g of expansionCandidates.slice(0, 10)) {
            output += `- "${g.gram}" — ${g.conversions} conv, ROAS ${g.roas?.toFixed(1)}x, in ${g.termCount} terms\n`;
        }
    }

    return output;
}

// ============================================================
// FULL PRE-PROCESSING: Call this in analyze route before Claude
// ============================================================

/**
 * Master function to run all pre-processing and return formatted text
 * for injection into the Claude prompt.
 * 
 * Usage in app/api/analyze/route.ts buildPrompt():
 * 
 *   const { healthBlock, ngramBlock } = runPreAnalysis(campaigns, adGroups, keywords, ads, negatives, searchTerms);
 *   // Then add healthBlock and ngramBlock to the prompt string
 */
export function runPreAnalysis(
    campaigns: CampaignPerformance[],
    adGroups: AdGroupPerformance[],
    keywords: KeywordWithQS[],
    ads: AdWithStrength[],
    negativeKeywords: NegativeKeyword[],
    searchTerms?: SearchTermInput[],
    auctionInsights?: AuctionInsight[],
    deviceStats?: AccountDevicePerformance[],
    assetPerformance?: AssetPerformance[],
    changeEvents?: ChangeEvent[],
    conversionActions?: ConversionAction[],
    pmaxProducts?: PMaxProductPerformance[]
): { healthBlock: string; ngramBlock: string; healthScore: HealthScoreReport } {

    // Health Score
    const healthScore = calculateHealthScore(
        campaigns, adGroups, keywords, ads, negativeKeywords, searchTerms, auctionInsights, deviceStats,
        assetPerformance, changeEvents, conversionActions, pmaxProducts
    );
    const healthBlock = formatHealthScoreForPrompt(healthScore);

    // N-Gram Analysis (only if search terms available)
    let ngramBlock = '';
    if (searchTerms && searchTerms.length > 0) {
        const ngrams = buildNGrams(searchTerms, 3, 2);
        const negativeCandidates = findNegativeCandidates(ngrams, 1.0, 2);
        const expansionCandidates = findExpansionCandidates(ngrams);
        ngramBlock = formatNGramsForPrompt(ngrams, negativeCandidates, expansionCandidates);
    }

    return { healthBlock, ngramBlock, healthScore };
}
