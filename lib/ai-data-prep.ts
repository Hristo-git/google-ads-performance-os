
import {
    SearchTerm,
    NetworkPerformance,
    AuctionInsight,
    ConversionActionBreakdown,
    AudiencePerformance,
    PMaxSearchInsight,
    DemographicPerformance
} from "../types/google-ads";

// ==========================================
// TYPES
// ==========================================

export type TermCategory = 'brand_exact' | 'brand_modified' | 'non_brand' | 'ambiguous';

export interface AggregatedSearchTerm {
    searchTerm: string;
    totalImpressions: number;
    totalClicks: number;
    totalCost: number;
    totalConversions: number;
    totalConversionValue: number;
    calculatedROAS: number; // val / cost
    calculatedCPA: number; // cost / conv
    calculatedCVR: number; // conv / clicks
    uniqueDays: number;
    devices: string[];
    campaigns: { campaignId: string; campaignName: string; cost: number; conversions: number }[];
    termCategory: TermCategory;
}

export interface CrossCampaignTerm {
    searchTerm: string;
    campaignCount: number;
    campaigns: {
        campaignId: string;
        campaignName: string;
        cost: number;
        conversions: number;
        percentOfTermCost: number;
    }[];
    totalOverlapCost: number; // cost outside max campaign
    overlapNote: string;
}

export interface CampaignInput {
    id: string;
    name: string;
    status: string;
    advertisingChannelType?: string | null | undefined;
    biddingStrategyType?: string | number | null | undefined;
    cost: number;
    conversions: number;
    searchImpressionShare?: number | null;
    searchLostISBudget?: number | null;
    searchLostISRank?: number | null;
    adGroups?: any[];
}

export interface PreparedData {
    aggregatedSearchTerms: AggregatedSearchTerm[];
    crossCampaignTerms: CrossCampaignTerm[];
    termCategorySummary: {
        brand_exact: CategoryStats;
        brand_plus_category: CategoryStats;
        non_brand: CategoryStats;
        ambiguous: CategoryStats;
    };
    additionalData: {
        campaignStructure: any[];
        impressionShareData: any[];
        missingDataFlags: Record<string, string | null>;
        // Enriched Data Blocks
        auctionInsights: AuctionInsight[];
        conversionActions: ConversionActionBreakdown[];
        audiencePerformance: AudiencePerformance[];
        networkPerformance: NetworkPerformance[];
        pmaxInsights: PMaxSearchInsight[];
        demographicPerformance: DemographicPerformance[];
    };
    metadata: {
        dateRange: { start: string; end: string };
        periodDays: number;
        shortPeriodWarning: boolean;
        uniqueSearchTermsCount: number;
        totalRowsInGranularData: number;
        dataCompleteness: {
            searchTermsCostTotal: number;
            accountCostTotal: number;
            coveragePercent: number;
            note: string;
        };
        currency: string;
        language: string;
    };
}

interface CategoryStats {
    count: number;
    totalCost: number;
    totalConversions: number;
    percentOfTotalCost: number;
}

// ==========================================
// CONFIGURATION
// ==========================================

const BRAND_TERMS = ['виденов', 'videnov', 'videnov.bg', 'мебели виденов', 'видинов'];

// ==========================================
// HELPERS
// ==========================================

function classifyTerm(term: string): TermCategory {
    const lowerTerm = term.toLowerCase().trim();

    // 1. Exact Brand Match (or common misspellings)
    // The user rule: "ONLY brand name without product modifier"
    if (BRAND_TERMS.includes(lowerTerm)) {
        return 'brand_exact';
    }

    // 2. Brand + Category logic
    // If it contains a brand term but is NO LONGER than the brand term (handled above), it's brand_modified.
    // We already checked exact match. So if it includes brand, it has modifiers.
    const containsBrand = BRAND_TERMS.some(brand => lowerTerm.includes(brand));
    if (containsBrand) {
        return 'brand_modified';
    }

    // 3. Non-Brand
    return 'non_brand';
}

// ==========================================
// MAIN FUNCTION
// ==========================================

export function prepareSearchTermData(
    rawSearchTerms: SearchTerm[],
    campaigns: CampaignInput[],
    totalAccountCost: number,
    daysInPeriod: number,
    periodStart: string,
    periodEnd: string,
    // New Optional Data Blocks
    auctionInsights: AuctionInsight[] = [],
    conversionActions: ConversionActionBreakdown[] = [],
    audiencePerformance: AudiencePerformance[] = [],
    networkPerformance: NetworkPerformance[] = [],
    pmaxInsights: PMaxSearchInsight[] = [],
    demographicPerformance: DemographicPerformance[] = [],
    language: string = "bg"
): PreparedData {
    const termMap = new Map<string, {
        raw: SearchTerm[];
        dates: Set<string>;
        devices: Set<string>;
        campaigns: Map<string, { id: string; name: string; cost: number; conversions: number }>;
    }>();

    let aggregatedTotalCost = 0;
    const totalRowsInGranularData = rawSearchTerms.length + pmaxInsights.length;

    // 1. Aggregation with Sets
    // Process regular search terms
    for (const row of rawSearchTerms) {
        const term = row.searchTerm.toLowerCase().trim();

        if (!termMap.has(term)) {
            termMap.set(term, {
                raw: [],
                dates: new Set(),
                devices: new Set(),
                campaigns: new Map()
            });
        }

        const entry = termMap.get(term)!;
        entry.raw.push(row);
        if (row.date) entry.dates.add(row.date);
        if (row.device) entry.devices.add(row.device);

        // Track campaign stats per term
        const cid = row.campaignId || row.campaignName || 'unknown'; // fallback key
        const cname = row.campaignName || 'Unknown Campaign';

        if (!entry.campaigns.has(cid)) {
            entry.campaigns.set(cid, { id: row.campaignId || '', name: cname, cost: 0, conversions: 0 });
        }
        const cStat = entry.campaigns.get(cid)!;
        cStat.cost += row.cost;
        cStat.conversions += row.conversions;

        aggregatedTotalCost += row.cost;
    }

    // Process PMax Search Insights
    for (const row of pmaxInsights) {
        if (!row.term) continue;
        const term = row.term.toLowerCase().trim();

        if (!termMap.has(term)) {
            termMap.set(term, {
                raw: [],
                dates: new Set(),
                devices: new Set(),
                campaigns: new Map()
            });
        }

        const entry = termMap.get(term)!;
        // Push a pseudo-SearchTerm for classification and display
        entry.raw.push({
            searchTerm: row.term,
            campaignId: row.campaignId,
            campaignName: row.campaignName,
            impressions: row.impressions,
            clicks: row.clicks,
            cost: row.cost,
            conversions: row.conversions,
            conversionValue: row.conversionValue,
            ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
            averageCpc: row.clicks > 0 ? row.cost / row.clicks : 0,
            conversionRate: row.clicks > 0 ? row.conversions / row.clicks : 0
        } as SearchTerm);

        // Track campaign stats per term
        const cid = row.campaignId || 'pmax-unknown';
        const cname = row.campaignName || 'PMax Campaign';

        if (!entry.campaigns.has(cid)) {
            entry.campaigns.set(cid, { id: row.campaignId, name: cname, cost: 0, conversions: 0 });
        }
        const cStat = entry.campaigns.get(cid)!;
        cStat.cost += row.cost;
        cStat.conversions += row.conversions;

        aggregatedTotalCost += row.cost;
    }

    // 2. Build Aggregated List
    const aggregatedSearchTerms: AggregatedSearchTerm[] = [];
    const categoryStats: Record<TermCategory, CategoryStats> = {
        brand_exact: { count: 0, totalCost: 0, totalConversions: 0, percentOfTotalCost: 0 },
        brand_modified: { count: 0, totalCost: 0, totalConversions: 0, percentOfTotalCost: 0 },
        non_brand: { count: 0, totalCost: 0, totalConversions: 0, percentOfTotalCost: 0 },
        ambiguous: { count: 0, totalCost: 0, totalConversions: 0, percentOfTotalCost: 0 }
    };

    termMap.forEach((data, termKey) => {
        // Sum metrics
        const totalImpressions = data.raw.reduce((sum, r) => sum + r.impressions, 0);
        const totalClicks = data.raw.reduce((sum, r) => sum + r.clicks, 0);
        const totalCost = data.raw.reduce((sum, r) => sum + r.cost, 0);
        const totalConversions = data.raw.reduce((sum, r) => sum + r.conversions, 0);
        const totalConversionValue = data.raw.reduce((sum, r) => sum + r.conversionValue, 0);

        // Classify
        const cat = classifyTerm(termKey);

        // Update Category Stats
        categoryStats[cat].count++;
        categoryStats[cat].totalCost += totalCost;
        categoryStats[cat].totalConversions += totalConversions;

        // Build Campaign List
        const campaignsList = Array.from(data.campaigns.values()).map(c => ({
            campaignId: c.id,
            campaignName: c.name,
            cost: c.cost,
            conversions: c.conversions
        }));

        aggregatedSearchTerms.push({
            searchTerm: data.raw[0].searchTerm, // Use first occurrence for display casing
            totalImpressions,
            totalClicks,
            totalCost,
            totalConversions,
            totalConversionValue,
            calculatedROAS: totalCost > 0 ? totalConversionValue / totalCost : 0,
            calculatedCPA: totalConversions > 0 ? totalCost / totalConversions : 0,
            calculatedCVR: totalClicks > 0 ? totalConversions / totalClicks : 0,
            uniqueDays: data.dates.size,
            devices: Array.from(data.devices),
            campaigns: campaignsList,
            termCategory: cat
        });
    });

    // Calculate Category Percentages
    const statsTotalCost = aggregatedTotalCost || 1; // avoid div by 0
    Object.values(categoryStats).forEach(s => {
        s.percentOfTotalCost = (s.totalCost / statsTotalCost) * 100;
    });

    // Sort by Cost Descending, then by Term asc
    aggregatedSearchTerms.sort((a, b) => {
        const costDiff = b.totalCost - a.totalCost;
        if (Math.abs(costDiff) > 0.001) return costDiff;
        return a.searchTerm.localeCompare(b.searchTerm);
    });

    // 3. Process Cross-Campaign Terms
    const crossCampaignTerms: CrossCampaignTerm[] = aggregatedSearchTerms
        .filter(t => t.campaigns.length >= 2)
        .map(t => {
            const totalTermCost = t.totalCost || 0.01;
            // Sort campaigns by cost, then by name
            const sortedCamps = [...t.campaigns].sort((a, b) => {
                const costDiff = b.cost - a.cost;
                if (Math.abs(costDiff) > 0.001) return costDiff;
                return a.campaignName.localeCompare(b.campaignName);
            });

            // Calculate overlap cost (all except max)
            const maxCampCost = sortedCamps[0].cost;
            const overlapCost = totalTermCost - maxCampCost;

            const enrichedCamps = sortedCamps.map(c => ({
                ...c,
                percentOfTermCost: (c.cost / totalTermCost) * 100
            }));

            // Generate Note
            const note = `Term '${t.searchTerm}' appears in ${t.campaigns.length} campaigns. '${sortedCamps[0].campaignName}' takes ${(enrichedCamps[0].percentOfTermCost).toFixed(1)}% of spend; others generate additional €${overlapCost.toFixed(2)} cost.`;

            return {
                searchTerm: t.searchTerm,
                campaignCount: t.campaigns.length,
                campaigns: enrichedCamps,
                totalOverlapCost: overlapCost,
                overlapNote: note
            };
        });

    // 4. Additional Data Extraction
    const campaignStructure = campaigns.map(c => ({
        campaignId: c.id,
        campaignName: c.name,
        campaignType: c.advertisingChannelType,
        biddingStrategy: c.biddingStrategyType, // Raw type, converting to label done in UI usually but ok
        dailyBudget: 'check UI', // Not passed in campaign list usually?
        searchImpressionShare: c.searchImpressionShare,
        searchLostISBudget: c.searchLostISBudget,
        searchLostISRank: c.searchLostISRank
    }));

    const impressionShareData = campaigns
        .filter(c => c.searchImpressionShare !== undefined)
        .map(c => ({
            campaignName: c.name,
            share: c.searchImpressionShare,
            lostBudget: c.searchLostISBudget,
            lostRank: c.searchLostISRank
        }));

    // 5. Metadata & Validation
    const costDiff = Math.abs(totalAccountCost - aggregatedTotalCost);
    const coveragePct = totalAccountCost > 0 ? (aggregatedTotalCost / totalAccountCost) * 100 : 0;

    // Fractional conversion check - simple heuristic, if any conversion is not integer
    const hasFractionalConversions = aggregatedSearchTerms.some(t => !Number.isInteger(t.totalConversions));

    const missingDataFlags: Record<string, string | null> = {
        attributionModel: hasFractionalConversions ? "Inferred DDA from fractional conversions" : "Likely Last Click (all integers) or checked in UI",
        campaignStructure: null, // We provided basic structure
        impressionShareData: impressionShareData.length > 0 ? null : "Not available in campaign response",
        conversionLagData: "Not available — requires Conversion Lag report",
        auctionInsights: auctionInsights.length > 0 ? null : "Not available — requires separate API call",
        audienceData: audiencePerformance.length > 0 ? null : "Not available — requires separate API call",
        qualityScoreData: "Not available — requires Keywords report"
    };

    // Sort enriched data for priority (limit top items in prompt later if needed)
    // 1. Auction Insights - sort by overlap rate or impression share
    const sortedAuctionInsights = [...auctionInsights].sort((a, b) => {
        const diff = (b.overlapRate || 0) - (a.overlapRate || 0);
        if (Math.abs(diff) > 0.001) return diff;
        return (a.competitor || '').localeCompare(b.competitor || '');
    });

    // 2. Conversion Actions - sort by conversion value then conversions
    const sortedConversionActions = [...conversionActions].sort((a, b) => {
        const diff = b.conversionValue - a.conversionValue;
        if (Math.abs(diff) > 0.001) return diff;
        return a.conversionAction.localeCompare(b.conversionAction); // Fixed: actionName -> conversionAction
    });

    // 3. Audience Performance - sort by cost or conversions
    const sortedAudiences = [...audiencePerformance].sort((a, b) => {
        const diff = b.cost - a.cost;
        if (Math.abs(diff) > 0.001) return diff;
        return a.audienceName.localeCompare(b.audienceName);
    });

    // 4. Network Performance - sort by cost
    const sortedNetwork = [...networkPerformance].sort((a, b) => {
        const diff = b.cost - a.cost;
        if (Math.abs(diff) > 0.001) return diff;
        return a.adNetworkType.localeCompare(b.adNetworkType); // Fixed: network -> adNetworkType
    });

    // 5. PMax Insights - sort by clicks
    const sortedPMax = [...pmaxInsights].sort((a, b) => {
        const diff = b.clicks - a.clicks;
        if (Math.abs(diff) > 0) return diff;
        return a.categoryName.localeCompare(b.categoryName); // Fixed: categoryLabel -> categoryName
    });

    return {
        aggregatedSearchTerms,
        crossCampaignTerms,
        termCategorySummary: {
            brand_exact: categoryStats.brand_exact,
            brand_plus_category: categoryStats.brand_modified,
            non_brand: categoryStats.non_brand,
            ambiguous: categoryStats.ambiguous
        },
        additionalData: {
            campaignStructure,
            impressionShareData,
            missingDataFlags,
            auctionInsights: sortedAuctionInsights,
            conversionActions: sortedConversionActions,
            audiencePerformance: sortedAudiences,
            networkPerformance: sortedNetwork,
            pmaxInsights: sortedPMax,
            demographicPerformance: demographicPerformance
        },
        metadata: {
            dateRange: { start: periodStart, end: periodEnd },
            periodDays: daysInPeriod,
            shortPeriodWarning: daysInPeriod < 14,
            uniqueSearchTermsCount: aggregatedSearchTerms.length,
            totalRowsInGranularData,
            dataCompleteness: {
                searchTermsCostTotal: aggregatedTotalCost,
                accountCostTotal: totalAccountCost,
                coveragePercent: coveragePct,
                note: `Search Terms Report covers ${coveragePct.toFixed(1)}% of total account spend (` +
                    `€${aggregatedTotalCost.toFixed(2)} / €${totalAccountCost.toFixed(2)}). ` +
                    `Remaining ${(100 - coveragePct).toFixed(1)}% may be from PMax, Display, or low-volume terms.`
            },
            currency: "EUR", // Assumption, or pass from sorting
            language
        }
    };
}
