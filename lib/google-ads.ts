import { GoogleAdsApi } from "google-ads-api";
import { PMaxAsset, AccountAsset } from "@/types/google-ads";

let client: GoogleAdsApi | null = null;

function getClient() {
    if (!client) {
        console.log("Initializing Google Ads client with:", {
            client_id: process.env.GOOGLE_CLIENT_ID ? "present" : "missing",
            client_secret: process.env.GOOGLE_CLIENT_SECRET ? "present" : "missing",
            developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ? "present" : "missing",
        });

        client = new GoogleAdsApi({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
        });
    }
    return client;
}

export function getGoogleAdsCustomer(refreshToken: string, customerId?: string) {
    const rawLoginId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || process.env.GOOGLE_ADS_CUSTOMER_ID || "";
    const rawTargetId = customerId || process.env.GOOGLE_ADS_CUSTOMER_ID || "";

    // IDs MUST be numeric strings without hyphens
    const loginCustomerId = rawLoginId.replace(/-/g, "").trim();
    const targetCustomerId = rawTargetId.replace(/-/g, "").trim();

    console.log(`[GoogleAds] Initializing Customer:
      - Raw Login ID: ${rawLoginId} -> Clean: ${loginCustomerId}
      - Raw Target ID: ${rawTargetId} -> Clean: ${targetCustomerId}
      - Refresh Token: ${refreshToken ? "PRESENT" : "MISSING"}
    `);

    if (!loginCustomerId) {
        console.warn("[GoogleAds] WARNING: No login_customer_id provided!");
    }

    const googleClient = getClient();
    return googleClient.Customer({
        customer_id: targetCustomerId,
        login_customer_id: loginCustomerId || undefined,
        refresh_token: refreshToken,
    });
}

export interface DateRange {
    start: string;
    end: string;
}

export function getDateFilter(dateRange?: DateRange) {
    if (!dateRange?.start || !dateRange?.end) return "";
    return ` AND segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'`;
}

export interface CampaignPerformance {
    id: string;
    name: string;
    status: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    ctr: number;
    cpc: number;
    // Impression Share metrics
    searchImpressionShare: number | null;
    searchTopImpressionShare: number | null;
    searchLostISRank: number | null;
    searchLostISBudget: number | null;
    conversionValue: number;
    roas: number | null;
    cpa: number | null;
    biddingStrategyType: string;
    advertisingChannelType: string;
    targetRoas?: number;
    targetCpa?: number;
    // NEW - Budget & Optimization
    dailyBudget: number | null;
    budgetDeliveryMethod: string;
    budgetStatus?: string;
    optimizationScore: number | null;
    searchAbsTopIS: number | null;
}

export interface AdGroupPerformance {
    id: string;
    campaignId: string;
    name: string;
    status: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    ctr: number;
    cpc: number;
    // Quality Score (aggregated from keywords)
    avgQualityScore: number | null;
    keywordsWithLowQS: number;
    // Ad Strength summary
    adsCount: number;
    poorAdsCount: number;
    conversionValue: number;
    roas: number | null;
    cpa: number | null;
}

export interface NegativeKeyword {
    id: string;
    adGroupId: string;
    text: string;
    matchType: string;
}

export interface KeywordWithQS {
    id: string;
    adGroupId: string;
    text: string;
    matchType: string;
    status: string;              // NEW
    qualityScore: number | null;
    expectedCtr: string;
    landingPageExperience: string;
    adRelevance: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;         // NEW
    conversionValue: number;     // NEW
    cpc: number;                 // NEW
}

export interface AdWithStrength {
    id: string;
    adGroupId: string;
    type: string;
    status: string;              // NEW
    adStrength: string;
    headlinesCount: number;
    descriptionsCount: number;
    finalUrls: string[];
    headlines: string[];
    descriptions: string[];      // NEW
    impressions: number;         // NEW
    clicks: number;              // NEW
    cost: number;                // NEW
    conversions: number;         // NEW
    conversionValue: number;     // NEW
    ctr: number;                 // NEW
    roas: number | null;         // NEW
}

export interface AssetGroupPerformance {
    id: string;
    campaignId: string;
    name: string;
    status: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    ctr: number;
    cpc: number;
    strength: string;
    conversionValue: number;
    roas: number | null;
    cpa: number | null;
}

function logApiError(context: string, error: unknown) {
    console.error(`\n=== Google Ads API Error (${context}) ===`);
    if (error instanceof Error) {
        console.error("Message:", error.message);
        console.error("Stack:", error.stack);
        // Check for Google Ads specific error properties
        const anyError = error as any;
        if (anyError.errors) {
            console.error("API Errors:", JSON.stringify(anyError.errors, null, 2));
        }
        if (anyError.response) {
            console.error("Response:", JSON.stringify(anyError.response, null, 2));
        }
        if (anyError.code) {
            console.error("Error Code:", anyError.code);
        }
    } else {
        console.error("Raw error:", error);
    }
    console.error("=== End Error ===\n");
}

function mapStatus(status: any): string {
    if (status === 2 || status === '2' || status === 'ENABLED') return 'ENABLED';
    if (status === 3 || status === '3' || status === 'PAUSED') return 'PAUSED';
    if (status === 4 || status === '4' || status === 'REMOVED') return 'REMOVED';
    return String(status || 'UNKNOWN');
}

export async function getCampaigns(refreshToken: string, customerId?: string, dateRange?: DateRange, onlyEnabled: boolean = false): Promise<CampaignPerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    // Status filter
    const statusFilter = onlyEnabled
        ? `AND campaign.status = 'ENABLED'`
        : `AND campaign.status != 'REMOVED'`;

    try {
        const result = await customer.query(`
            SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.ctr,
                metrics.average_cpc,
                metrics.conversions_value,
                metrics.search_impression_share,
                metrics.search_top_impression_share,
                metrics.search_rank_lost_impression_share,
                metrics.search_budget_lost_impression_share,
                metrics.search_absolute_top_impression_share,
                campaign.bidding_strategy_type,
                campaign.advertising_channel_type,
                campaign.target_roas.target_roas,
                campaign.target_cpa.target_cpa_micros,
                campaign.campaign_budget,
                campaign_budget.amount_micros,
                campaign_budget.delivery_method,
                campaign_budget.status,
                campaign.optimization_score
            FROM campaign
            WHERE campaign.status != 'REMOVED' ${statusFilter} ${dateFilter}
            ORDER BY metrics.impressions DESC
            LIMIT 1000
        `);

        return result.map((row) => {
            const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            const conversions = Number(row.metrics?.conversions) || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;

            return {
                id: row.campaign?.id?.toString() || "",
                name: row.campaign?.name || "",
                status: mapStatus(row.campaign?.status),
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost,
                conversions,
                ctr: Number(row.metrics?.ctr) || 0,
                cpc: Number(row.metrics?.average_cpc) / 1_000_000 || 0,
                searchImpressionShare: row.metrics?.search_impression_share ?? null,
                searchTopImpressionShare: row.metrics?.search_top_impression_share ?? null,
                searchLostISRank: row.metrics?.search_rank_lost_impression_share ?? null,
                searchLostISBudget: row.metrics?.search_budget_lost_impression_share ?? null,
                conversionValue,
                roas: cost > 0 ? conversionValue / cost : null,
                cpa: conversions > 0 ? cost / conversions : null,
                biddingStrategyType: String(row.campaign?.bidding_strategy_type || 'UNKNOWN'),
                advertisingChannelType: String(row.campaign?.advertising_channel_type || 'UNKNOWN'),
                targetRoas: row.campaign?.target_roas?.target_roas ?? undefined,
                targetCpa: row.campaign?.target_cpa?.target_cpa_micros ? Number(row.campaign.target_cpa.target_cpa_micros) / 1_000_000 : undefined,
                // NEW - Budget & Optimization
                dailyBudget: row.campaign_budget?.amount_micros
                    ? Number(row.campaign_budget.amount_micros) / 1_000_000
                    : null,
                budgetDeliveryMethod: String(row.campaign_budget?.delivery_method || 'STANDARD'),
                budgetStatus: String(row.campaign_budget?.status || 'UNKNOWN'),
                optimizationScore: row.campaign?.optimization_score ?? null,
                searchAbsTopIS: row.metrics?.search_absolute_top_impression_share ?? null,
            };
        });
    } catch (error: unknown) {
        logApiError("getCampaigns", error);
        throw error;
    }
}

// List all accessible customer accounts under the MCC
export async function getAccessibleCustomers(refreshToken: string): Promise<{ id: string, name: string, isManager: boolean }[]> {
    const customer = getGoogleAdsCustomer(refreshToken);

    try {
        // Query customer_client to get all accessible accounts under the MCC
        const result = await customer.query(`
    SELECT
    customer_client.id,
        customer_client.descriptive_name,
        customer_client.manager,
        customer_client.status
            FROM customer_client
            WHERE customer_client.status = 'ENABLED'
        `);

        return result.map((row) => ({
            id: row.customer_client?.id?.toString() || "",
            name: row.customer_client?.descriptive_name || "",
            isManager: row.customer_client?.manager === true,
        }));
    } catch (error: unknown) {
        logApiError("getAccessibleCustomers", error);
        throw error;
    }
}

export async function getAccountInfo(refreshToken: string, customerId?: string) {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);

    try {
        const result = await customer.query(`
    SELECT
    customer.id,
        customer.descriptive_name,
        customer.currency_code,
        customer.time_zone
            FROM customer
            LIMIT 1
        `);

        if (result.length > 0) {
            return {
                id: result[0].customer?.id?.toString(),
                name: result[0].customer?.descriptive_name,
                currency: result[0].customer?.currency_code,
                timezone: result[0].customer?.time_zone,
            };
        }

        return null;
    } catch (error: unknown) {
        logApiError("getAccountInfo", error);
        throw error;
    }
}

export async function getAdGroups(refreshToken: string, campaignId?: string, customerId?: string, dateRange?: DateRange, onlyEnabled: boolean = false): Promise<AdGroupPerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    try {
        const statusClause = onlyEnabled
            ? `ad_group.status = 'ENABLED'`
            : `ad_group.status != 'REMOVED'`;

        const campaignClause = campaignId
            ? `AND campaign.id = ${campaignId}`
            : '';

        const query = `
            SELECT
                ad_group.id,
                ad_group.name,
                ad_group.status,
                campaign.id,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.ctr,
                metrics.average_cpc,
                metrics.conversions_value,
                metrics.relative_ctr
            FROM ad_group
            WHERE ${statusClause} ${campaignClause} ${dateFilter}
            ORDER BY metrics.impressions DESC
            LIMIT 5000
        `;

        console.log(`[getAdGroups] customerId=${customerId}, campaignId=${campaignId || 'ALL'}`);

        const adGroups = await customer.query(query);

        console.log(`GAQL found ${adGroups.length} ad groups`);

        const adGroupIds = adGroups.map(ag => ag.ad_group?.id?.toString()).filter((id): id is string => !!id);

        let keywords: KeywordWithQS[] = [];
        let ads: AdWithStrength[] = [];

        if (adGroupIds.length > 0) {
            try {
                [keywords, ads] = await Promise.all([
                    getKeywordsWithQS(refreshToken, undefined, customerId, dateRange, adGroupIds, undefined, undefined, onlyEnabled),
                    getAdsWithStrength(refreshToken, undefined, customerId, adGroupIds, dateRange, onlyEnabled)
                ]);
            } catch (enrichErr: unknown) {
                console.error("[getAdGroups] Keywords/Ads enrichment failed (returning basic metrics):", enrichErr);
            }
        }

        return adGroups.map((row) => {
            const id = row.ad_group?.id?.toString() || "";
            const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            const conversions = Number(row.metrics?.conversions) || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;

            const groupKeywords = keywords.filter(k => k.adGroupId === id);
            const groupAds = ads.filter(a => a.adGroupId === id);

            let totalWeightedQS = 0;
            let totalImpressionsForQS = 0;
            let keywordsWithLowQS = 0;

            groupKeywords.forEach(k => {
                if (k.qualityScore !== null) {
                    totalWeightedQS += k.qualityScore * k.impressions;
                    totalImpressionsForQS += k.impressions;
                    if (k.qualityScore < 5) keywordsWithLowQS++;
                }
            });

            const avgQualityScore = totalImpressionsForQS > 0
                ? Number((totalWeightedQS / totalImpressionsForQS).toFixed(1))
                : null;

            const AD_STRENGTH_MAP: Record<string, string> = {
                '4': 'POOR',
                '5': 'AVERAGE',
                '6': 'GOOD',
                '7': 'EXCELLENT',
                'POOR': 'POOR',
                'AVERAGE': 'AVERAGE',
                'GOOD': 'GOOD',
                'EXCELLENT': 'EXCELLENT'
            };

            const normalizedAds = groupAds.map(ad => ({
                ...ad,
                adStrength: AD_STRENGTH_MAP[ad.adStrength] || ad.adStrength
            }));

            const poorAdsCount = normalizedAds.filter(a => a.adStrength === 'POOR').length;

            // Calculate aggregate Ad Strength (representative)
            let adStrength = 'UNSPECIFIED';
            if (normalizedAds.length > 0) {
                const strengthValues: Record<string, number> = { 'POOR': 1, 'AVERAGE': 2, 'GOOD': 3, 'EXCELLENT': 4 };
                const reverseMapping: Record<number, string> = { 1: 'POOR', 2: 'AVERAGE', 3: 'GOOD', 4: 'EXCELLENT' };

                const validAds = normalizedAds.filter(a => strengthValues[a.adStrength]);
                if (validAds.length > 0) {
                    const avgValue = Math.round(validAds.reduce((sum, a) => sum + strengthValues[a.adStrength], 0) / validAds.length);
                    adStrength = reverseMapping[avgValue] || 'UNSPECIFIED';
                }
            }

            return {
                id,
                campaignId: row.campaign?.id?.toString() || "",
                name: row.ad_group?.name || "",
                status: mapStatus(row.ad_group?.status),
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost,
                conversions,
                ctr: Number(row.metrics?.ctr) || 0,
                cpc: Number(row.metrics?.average_cpc) / 1_000_000 || 0,
                relativeCtr: Number(row.metrics?.relative_ctr) || null,
                avgQualityScore,
                keywordsWithLowQS,
                adsCount: groupAds.length,
                poorAdsCount,
                adStrength,
                conversionValue,
                roas: cost > 0 ? conversionValue / cost : null,
                cpa: conversions > 0 ? cost / conversions : null,
            };
        });
    } catch (error: unknown) {
        logApiError("API call", error);
        throw error;
    }
}

export async function getNegativeKeywords(refreshToken: string, adGroupId?: string, customerId?: string): Promise<NegativeKeyword[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);

    try {
        const whereClause = adGroupId
            ? `WHERE ad_group_criterion.negative = TRUE AND ad_group.id = ${adGroupId} AND ad_group_criterion.type = 'KEYWORD'`
            : `WHERE ad_group_criterion.negative = TRUE AND ad_group_criterion.type = 'KEYWORD'`;

        const keywords = await customer.query(`
    SELECT
    ad_group_criterion.criterion_id,
        ad_group.id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type
            FROM ad_group_criterion
            ${whereClause}
            LIMIT 500
        `);

        // Match type map
        const MATCH_TYPE_MAP: Record<string, string> = {
            '2': 'UNSPECIFIED',
            '3': 'EXACT',
            '4': 'BROAD',
            '5': 'PHRASE'
        };

        return keywords.map((row) => {
            const rawMatchType = String(row.ad_group_criterion?.keyword?.match_type);
            return {
                id: row.ad_group_criterion?.criterion_id?.toString() || "",
                adGroupId: row.ad_group?.id?.toString() || "",
                text: row.ad_group_criterion?.keyword?.text || "",
                matchType: MATCH_TYPE_MAP[rawMatchType] || rawMatchType || "UNKNOWN",
            };
        });
    } catch (error: unknown) {
        logApiError("API call", error);
        throw error;
    }
}


export async function getKeywordsWithQS(
    refreshToken: string,
    adGroupId?: string,
    customerId?: string,
    dateRange?: DateRange,
    adGroupIds?: string[],
    minQualityScore?: number,
    maxQualityScore?: number,
    onlyEnabled: boolean = false
): Promise<KeywordWithQS[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    try {
        // Base filter - always exclude removed
        let whereClause = `WHERE ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED'`;

        if (onlyEnabled) {
            whereClause += ` AND ad_group_criterion.status = 'ENABLED'`;
        }

        if (adGroupId) {
            whereClause += ` AND ad_group.id = ${adGroupId} `;
        } else if (adGroupIds && adGroupIds.length > 0) {
            whereClause += ` AND ad_group.id IN(${adGroupIds.join(',')})`;
        }

        // Add Quality Score filtering
        if (minQualityScore !== undefined) {
            whereClause += ` AND ad_group_criterion.quality_info.quality_score >= ${minQualityScore} `;
        }
        if (maxQualityScore !== undefined) {
            whereClause += ` AND ad_group_criterion.quality_info.quality_score <= ${maxQualityScore} `;
        }

        const keywords = await customer.query(`
    SELECT
    ad_group_criterion.criterion_id,
        ad_group.id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        ad_group_criterion.quality_info.quality_score,
        ad_group_criterion.quality_info.creative_quality_score,
        ad_group_criterion.quality_info.post_click_quality_score,
        ad_group_criterion.quality_info.search_predicted_ctr,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.average_cpc
            FROM keyword_view
            ${whereClause} ${dateFilter}
            ORDER BY metrics.impressions DESC
            LIMIT 10000
        `);

        const validKeywords = keywords.map((row) => ({
            id: row.ad_group_criterion?.criterion_id?.toString() || "",
            adGroupId: row.ad_group?.id?.toString() || "",
            text: row.ad_group_criterion?.keyword?.text || "",
            matchType: String(row.ad_group_criterion?.keyword?.match_type) || "",
            status: mapStatus(row.ad_group_criterion?.status),
            qualityScore: row.ad_group_criterion?.quality_info?.quality_score ?? null,
            expectedCtr: String(row.ad_group_criterion?.quality_info?.search_predicted_ctr) || "UNSPECIFIED",
            landingPageExperience: String(row.ad_group_criterion?.quality_info?.post_click_quality_score) || "UNSPECIFIED",
            adRelevance: String(row.ad_group_criterion?.quality_info?.creative_quality_score) || "UNSPECIFIED",
            impressions: Number(row.metrics?.impressions) || 0,
            clicks: Number(row.metrics?.clicks) || 0,
            cost: Number(row.metrics?.cost_micros) / 1_000_000 || 0,
            conversions: Number(row.metrics?.conversions) || 0,
            conversionValue: Number(row.metrics?.conversions_value) || 0,
            cpc: Number(row.metrics?.average_cpc) / 1_000_000 || 0,
        }));

        return validKeywords;
    } catch (error: unknown) {
        logApiError("API call", error);
        throw error;
    }
}

export async function getAdsWithStrength(
    refreshToken: string,
    adGroupId?: string,
    customerId?: string,
    adGroupIds?: string[],

    dateRange?: DateRange,
    onlyEnabled: boolean = false
): Promise<AdWithStrength[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    try {
        let whereClause = `WHERE ad_group_ad.status != 'REMOVED'`;

        if (onlyEnabled) {
            whereClause += ` AND ad_group_ad.status = 'ENABLED'`;
        }

        if (adGroupId) {
            whereClause += ` AND ad_group.id = ${adGroupId} `;
        } else if (adGroupIds && adGroupIds.length > 0) {
            whereClause += ` AND ad_group.id IN(${adGroupIds.join(',')})`;
        }

        const ads = await customer.query(`
    SELECT
    ad_group_ad.ad.id,
        ad_group.id,
        ad_group_ad.ad.type,
        ad_group_ad.status,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group_ad.ad.responsive_display_ad.headlines,
        ad_group_ad.ad.responsive_display_ad.descriptions,
        ad_group_ad.ad.final_urls,
        ad_group_ad.ad_strength,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.ctr
            FROM ad_group_ad
            ${whereClause} ${dateFilter}
            LIMIT 10000
        `);

        const AD_STRENGTH_MAP: Record<string, string> = {
            '4': 'POOR',
            '5': 'AVERAGE',
            '6': 'GOOD',
            '7': 'EXCELLENT',
            'POOR': 'POOR',
            'AVERAGE': 'AVERAGE',
            'GOOD': 'GOOD',
            'EXCELLENT': 'EXCELLENT'
        };

        return ads.map((row) => {
            const rawStrength = String(row.ad_group_ad?.ad_strength);
            const rsa = row.ad_group_ad?.ad?.responsive_search_ad;
            const rda = row.ad_group_ad?.ad?.responsive_display_ad;
            const headlines = rsa?.headlines || rda?.headlines || [];
            const descriptions = rsa?.descriptions || rda?.descriptions || [];
            const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            const conversions = Number(row.metrics?.conversions) || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;

            return {
                id: row.ad_group_ad?.ad?.id?.toString() || "",
                adGroupId: row.ad_group?.id?.toString() || "",
                type: String(row.ad_group_ad?.ad?.type) || "",
                status: mapStatus(row.ad_group_ad?.status),
                adStrength: AD_STRENGTH_MAP[rawStrength] || "UNSPECIFIED",
                headlinesCount: headlines.length,
                descriptionsCount: descriptions.length,
                finalUrls: row.ad_group_ad?.ad?.final_urls || [],
                headlines: headlines.map((h: any) => h.text || ""),
                descriptions: descriptions.map((d: any) => d.text || ""),
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost,
                conversions,
                conversionValue,
                ctr: Number(row.metrics?.ctr) || 0,
                roas: cost > 0 ? conversionValue / cost : null,
            };
        });
    } catch (error: unknown) {
        logApiError("API call", error);
        throw error;
    }
}

export async function getAssetGroups(refreshToken: string, campaignId?: string, customerId?: string, dateRange?: DateRange, onlyEnabled: boolean = false): Promise<any[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    try {
        const statusClause = onlyEnabled
            ? `asset_group.status = 'ENABLED'`
            : `asset_group.status != 'REMOVED'`;

        const campaignClause = campaignId
            ? `AND campaign.id = ${campaignId}`
            : '';

        console.log(`[getAssetGroups] customerId=${customerId}, campaignId=${campaignId || 'ALL'}`);

        const result = await customer.query(`
            SELECT
                asset_group.id,
                asset_group.name,
                asset_group.status,
                asset_group.ad_strength,
                campaign.id,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.ctr,
                metrics.average_cpc,
                metrics.conversions_value
            FROM asset_group
            WHERE ${statusClause} ${campaignClause} ${dateFilter}
            ORDER BY metrics.impressions DESC
            LIMIT 1000
        `);

        const STRENGTH_MAP: Record<string, string> = {
            '4': 'POOR',
            '5': 'AVERAGE',
            '6': 'GOOD',
            '7': 'EXCELLENT',
            'POOR': 'POOR',
            'AVERAGE': 'AVERAGE',
            'GOOD': 'GOOD',
            'EXCELLENT': 'EXCELLENT'
        };

        return result.map((row) => {
            const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            const conversions = Number(row.metrics?.conversions) || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;
            const rawStrength = String(row.asset_group?.ad_strength);

            return {
                id: row.asset_group?.id?.toString() || "",
                campaignId: row.campaign?.id?.toString() || "",
                name: row.asset_group?.name || "",
                status: mapStatus(row.asset_group?.status),
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost,
                conversions,
                ctr: Number(row.metrics?.ctr) || 0,
                cpc: Number(row.metrics?.average_cpc) / 1_000_000 || 0,
                strength: STRENGTH_MAP[rawStrength] || "UNSPECIFIED",
                conversionValue,
                roas: cost > 0 ? conversionValue / cost : null,
                cpa: conversions > 0 ? cost / conversions : null,
            };
        });
    } catch (error: unknown) {
        logApiError("getAssetGroups", error);
        throw error;
    }
}

export async function getAssetGroupAssets(refreshToken: string, assetGroupId: string, customerId?: string): Promise<PMaxAsset[]> {
    console.log(`[getAssetGroupAssets] Fetching assets for group: ${assetGroupId}, Customer: ${customerId} `);
    const customer = getGoogleAdsCustomer(refreshToken, customerId);

    try {
        // Query asset_group_asset to get the assets linked to this group
        // performance_label is available on asset_group_asset
        const result = await customer.query(`
    SELECT
    asset_group_asset.asset_group,
        asset_group_asset.asset,
        asset_group_asset.field_type,
        asset_group_asset.status,
        asset.id,
        asset.name,
        asset.type,
        asset.text_asset.text,
        asset.image_asset.full_size.url
            FROM asset_group_asset
            WHERE asset_group.id = ${assetGroupId} AND asset_group_asset.status != 'REMOVED'
            LIMIT 500
        `);

        return result.map((row) => {
            const asset = row.asset;
            const link = row.asset_group_asset;

            return {
                id: asset?.id?.toString() || "",
                assetGroupId: assetGroupId,
                type: String(asset?.type) || "UNKNOWN",
                fieldType: String(link?.field_type) || "UNKNOWN",
                text: asset?.text_asset?.text || asset?.name || "",
                name: asset?.name || "",
                status: mapStatus(link?.status),
                performanceLabel: "UNKNOWN", // Field not available in this API version
            };
        });
    } catch (error: unknown) {
        logApiError("getAssetGroupAssets", error);
        throw error;
    }
}
export async function getCustomerAssets(refreshToken: string, customerId?: string, dateRange?: DateRange): Promise<AccountAsset[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    try {
        const result = await customer.query(`
    SELECT
    customer_asset.asset,
        customer_asset.field_type,
        customer_asset.status,
        asset.id,
        asset.name,
        asset.type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
            FROM customer_asset
            WHERE customer_asset.status != 'REMOVED'
            ${dateFilter}
            ORDER BY metrics.impressions DESC
            LIMIT 500
        `);

        return result.map((row) => {
            const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            const conversions = Number(row.metrics?.conversions) || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;

            return {
                id: row.asset?.id?.toString() || "",
                name: row.asset?.name || "",
                type: String(row.asset?.type) || "UNKNOWN",
                fieldType: String(row.customer_asset?.field_type) || "UNKNOWN",
                status: mapStatus(row.customer_asset?.status),
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost,
                conversions,
                conversionValue,
                ctr: Number(row.metrics?.ctr) || 0,
                cpc: Number(row.metrics?.average_cpc) / 1_000_000 || 0,
                performanceLabel: String((row.customer_asset as any)?.performance_label || ""),
            };
        });
    } catch (error: unknown) {
        logApiError("getCustomerAssets", error);
        throw error;
    }
}

export interface DailyMetric {
    date: string;
    cost: number;
    conversions: number;
    conversionValue: number;
    clicks: number;
    impressions: number;
    roas: number;
    cpa: number;
}

export async function getCampaignTrends(refreshToken: string, customerId?: string, dateRange?: DateRange, campaignIds?: string[]): Promise<Record<string, DailyMetric[]>> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    // If we have a specific list of campaigns, filter by them
    let campaignFilter = "";
    if (campaignIds && campaignIds.length > 0) {
        campaignFilter = `AND campaign.id IN(${campaignIds.join(',')})`;
    }

    try {
        const query = `
    SELECT
    campaign.id,
        segments.date,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.clicks,
        metrics.impressions
            FROM campaign
            WHERE campaign.status != 'REMOVED' ${dateFilter} ${campaignFilter}
            ORDER BY segments.date ASC
        `;

        const result = await customer.query(query);
        const trends: Record<string, DailyMetric[]> = {};

        result.forEach((row) => {
            const campaignId = row.campaign?.id?.toString() || "";
            if (!trends[campaignId]) {
                trends[campaignId] = [];
            }

            const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            const conversions = Number(row.metrics?.conversions) || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;
            const clicks = Number(row.metrics?.clicks) || 0;
            const impressions = Number(row.metrics?.impressions) || 0;

            trends[campaignId].push({
                date: row.segments?.date || "",
                cost,
                conversions,
                conversionValue,
                clicks,
                impressions,
                roas: cost > 0 ? conversionValue / cost : 0,
                cpa: conversions > 0 ? cost / conversions : 0
            });
        });

        return trends;
    } catch (error: unknown) {
        logApiError("getCampaignTrends", error);
        // Return empty trends object instead of throwing to avoid blocking the main UI
        return {};
    }
}

// ============================================
// PMax Enrichment Functions
// ============================================

export interface AssetGroupSignal {
    id: string;
    assetGroupId: string;
    audienceName: string;
    audienceType: string;
}

export async function getAssetGroupSignals(refreshToken: string, assetGroupId: string, customerId?: string): Promise<AssetGroupSignal[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);

    try {
        const result = await customer.query(`
    SELECT
    asset_group_signal.asset_group,
        asset_group_signal.audience.audience,
        audience.id,
        audience.name,
        audience.description
            FROM asset_group_signal
            WHERE asset_group.id = ${assetGroupId}
            LIMIT 100
        `);

        return result.map((row) => ({
            id: row.audience?.id?.toString() || "",
            assetGroupId: assetGroupId,
            audienceName: row.audience?.name || "Unknown Audience",
            audienceType: row.audience?.description || "N/A",
        }));
    } catch (error: unknown) {
        logApiError("getAssetGroupSignals", error);
        // Return empty array instead of throwing to avoid blocking analysis
        return [];
    }
}

export interface ListingGroup {
    id: string;
    assetGroupId: string;
    path: string;
    type: string;
}

export async function getAssetGroupListingGroups(refreshToken: string, assetGroupId: string, customerId?: string): Promise<ListingGroup[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);

    try {
        const result = await customer.query(`
    SELECT
    asset_group_listing_group_filter.id,
        asset_group_listing_group_filter.asset_group,
        asset_group_listing_group_filter.type,
        asset_group_listing_group_filter.path
            FROM asset_group_listing_group_filter
            WHERE asset_group.id = ${assetGroupId}
            LIMIT 500
        `);

        return result.map((row) => {
            const path = row.asset_group_listing_group_filter?.path;
            let pathStr = "ROOT";
            if (Array.isArray(path) && path.length > 0) {
                pathStr = path.map((p: any) => `${p.dimension || 'unknown'}: ${p.value || 'ROOT'} `).join(' > ');
            }

            return {
                id: row.asset_group_listing_group_filter?.id?.toString() || "",
                assetGroupId: assetGroupId,
                path: pathStr,
                type: String(row.asset_group_listing_group_filter?.type) || "UNKNOWN",
            };
        });
    } catch (error: unknown) {
        logApiError("getAssetGroupListingGroups", error);
        // Return empty array instead of throwing
        return [];
    }
}

export interface PMaxSearchInsight {
    campaignId: string;
    category: string;
    categoryLabel: string;
    clicks: number;
    impressions: number;
    conversions: number;
    conversionValue: number;
    ctr: number;
}

export async function getPMaxSearchInsights(refreshToken: string, campaignId: string, customerId?: string): Promise<PMaxSearchInsight[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);

    try {
        // Note: campaign_search_term_insight requires filtering by campaign
        const result = await customer.query(`
    SELECT
    campaign_search_term_insight.id,
        campaign_search_term_insight.campaign_id,
        campaign_search_term_insight.category_label,
        metrics.clicks,
        metrics.impressions,
        metrics.conversions,
        metrics.conversions_value
            FROM campaign_search_term_insight
            WHERE campaign.id = ${campaignId}
            ORDER BY metrics.clicks DESC
            LIMIT 100
        `);

        return result.map((row) => {
            const insight = row.campaign_search_term_insight as any;
            const clicks = Number(row.metrics?.clicks) || 0;
            const impressions = Number(row.metrics?.impressions) || 0;
            const conversions = Number(row.metrics?.conversions) || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;

            return {
                campaignId: campaignId,
                category: insight?.id?.toString() || "",
                categoryLabel: insight?.category_label || "Unknown Category",
                clicks,
                impressions,
                conversions,
                conversionValue,
                ctr: impressions > 0 ? clicks / impressions : 0,
            };
        });
    } catch (error: unknown) {
        logApiError("getPMaxSearchInsights", error);
        // Return empty array instead of throwing
        return [];
    }
}

// ============================================
// Device Breakdown - Mobile vs Desktop Analysis
// ============================================

export interface DevicePerformance {
    campaignId: string;
    campaignName: string;
    device: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    ctr: number;
    cpc: number;
    roas: number | null;
    cpa: number | null;
}

export async function getCampaignDeviceBreakdown(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange
): Promise<DevicePerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    try {
        const result = await customer.query(`
    SELECT
    campaign.id,
        campaign.name,
        segments.device,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.ctr,
        metrics.average_cpc
            FROM campaign
            WHERE campaign.status != 'REMOVED' ${dateFilter}
            ORDER BY metrics.cost_micros DESC
        `);

        const DEVICE_MAP: Record<number, string> = {
            2: 'MOBILE', 3: 'TABLET', 4: 'DESKTOP', 6: 'CONNECTED_TV'
        };

        return result.map((row) => {
            const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            const conversions = Number(row.metrics?.conversions) || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;
            const rawDevice = row.segments?.device;

            return {
                campaignId: row.campaign?.id?.toString() || "",
                campaignName: row.campaign?.name || "",
                device: typeof rawDevice === 'string' ? rawDevice : (typeof rawDevice === 'number' ? (DEVICE_MAP[rawDevice] || 'UNKNOWN') : 'UNKNOWN'),
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost,
                conversions,
                conversionValue,
                ctr: Number(row.metrics?.ctr) || 0,
                cpc: Number(row.metrics?.average_cpc) / 1_000_000 || 0,
                roas: cost > 0 ? conversionValue / cost : null,
                cpa: conversions > 0 ? cost / conversions : null,
            };
        });
    } catch (error: unknown) {
        logApiError("getCampaignDeviceBreakdown", error);
        return [];
    }
}

// ============================================
// Conversion Actions - Purchase vs Micro-conversion Analysis
// ============================================

export interface ConversionActionBreakdown {
    campaignId: string;
    campaignName: string;
    conversionAction: string;
    conversionCategory: string;
    conversions: number;
    conversionValue: number;
    allConversions: number;
    allConversionValue: number;
}

export async function getConversionActions(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange
): Promise<ConversionActionBreakdown[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    try {
        const result = await customer.query(`
    SELECT
    campaign.id,
        campaign.name,
        segments.conversion_action_name,
        segments.conversion_action_category,
        metrics.conversions,
        metrics.conversions_value,
        metrics.all_conversions,
        metrics.all_conversions_value
            FROM campaign
            WHERE campaign.status != 'REMOVED' ${dateFilter}
                AND metrics.conversions > 0
            ORDER BY metrics.conversions DESC
        `);

        const CONV_CATEGORY_MAP: Record<number, string> = {
            0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'DEFAULT',
            3: 'PAGE_VIEW', 4: 'PURCHASE', 5: 'SIGNUP',
            6: 'LEAD', 7: 'DOWNLOAD', 8: 'ADD_TO_CART',
            9: 'BEGIN_CHECKOUT', 10: 'SUBSCRIBE_PAID',
            11: 'PHONE_CALL_LEAD', 12: 'IMPORTED_LEAD',
            13: 'SUBMIT_LEAD_FORM', 14: 'BOOK_APPOINTMENT',
            15: 'REQUEST_QUOTE', 16: 'GET_DIRECTIONS',
            17: 'OUTBOUND_CLICK', 18: 'CONTACT',
            19: 'ENGAGEMENT', 20: 'STORE_VISIT',
            21: 'STORE_SALE', 22: 'QUALIFIED_LEAD',
            23: 'CONVERTED_LEAD'
        };

        return result.map((row) => {
            const rawCategory = row.segments?.conversion_action_category;

            return {
                campaignId: row.campaign?.id?.toString() || "",
                campaignName: row.campaign?.name || "",
                conversionAction: row.segments?.conversion_action_name || "Unknown",
                conversionCategory: typeof rawCategory === 'string'
                    ? rawCategory
                    : (typeof rawCategory === 'number' ? (CONV_CATEGORY_MAP[rawCategory] || String(rawCategory)) : 'UNKNOWN'),
                conversions: Number(row.metrics?.conversions) || 0,
                conversionValue: Number(row.metrics?.conversions_value) || 0,
                allConversions: Number(row.metrics?.all_conversions) || 0,
                allConversionValue: Number(row.metrics?.all_conversions_value) || 0,
            };
        });
    } catch (error: unknown) {
        logApiError("getConversionActions", error);
        return [];
    }
}


export interface ConversionActionTrend {
    date: string;
    conversionAction: string;
    actionCategory: string;
    conversions: number;
    conversionValue: number;
}

export async function getConversionActionTrends(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange // Default to 30 days if not provided
): Promise<ConversionActionTrend[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    let dateFilter = getDateFilter(dateRange);

    if (!dateRange) {
        // Default to last 30 days if no range provided
        dateFilter = " AND segments.date DURING LAST_30_DAYS";
    }

    try {
        const result = await customer.query(`
            SELECT
                segments.date,
                segments.conversion_action_name,
                segments.conversion_action_category,
                metrics.conversions,
                metrics.conversions_value
            FROM campaign
            WHERE campaign.status != 'REMOVED' ${dateFilter}
                AND metrics.conversions > 0
            ORDER BY segments.date ASC
        `);

        return result.map((row) => ({
            date: row.segments?.date || "",
            conversionAction: row.segments?.conversion_action_name || "Unknown",
            actionCategory: String(row.segments?.conversion_action_category) || "UNKNOWN",
            conversions: Number(row.metrics?.conversions) || 0,
            conversionValue: Number(row.metrics?.conversions_value) || 0,
        }));
    } catch (error: unknown) {
        logApiError("getConversionActionTrends", error);
        return [];
    }
}

// ============================================
// PRIORITY 3: Auction Insights (Competitive Analysis)
// ============================================

export interface AuctionInsight {
    campaignId: string;
    competitor: string;
    impressionShare: number | null;
    overlapRate: number | null;
    outrankingShare: number | null;
    positionAboveRate: number | null;
    topOfPageRate: number | null;
    absTopOfPageRate: number | null;
}

export async function getAuctionInsights(
    refreshToken: string,
    campaignId?: string,
    customerId?: string,
    dateRange?: DateRange
): Promise<AuctionInsight[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);

    // Ensure a date filter is always present (default to last 30 days)
    let dateFilter = getDateFilter(dateRange);
    if (!dateFilter) {
        dateFilter = " AND segments.date DURING LAST_30_DAYS";
    }

    const campaignFilter = campaignId ? `AND campaign.id = ${campaignId}` : '';

    try {
        const result = await customer.query(`
    SELECT
        campaign.id,
        segments.auction_insight_domain,
        metrics.auction_insight_search_impression_share,
        metrics.auction_insight_search_overlap_rate,
        metrics.auction_insight_search_outranking_share,
        metrics.auction_insight_search_position_above_rate,
        metrics.auction_insight_search_top_of_page_rate,
        metrics.auction_insight_search_absolute_top_of_page_rate
            FROM campaign
            WHERE campaign.status != 'REMOVED' ${campaignFilter} ${dateFilter}
    `);

        return result.map((row: any) => ({
            campaignId: row.campaign?.id?.toString() || "",
            competitor: row.segments?.auction_insight_domain || "Unknown",
            impressionShare: row.metrics?.auction_insight_search_impression_share ?? null,
            overlapRate: row.metrics?.auction_insight_search_overlap_rate ?? null,
            outrankingShare: row.metrics?.auction_insight_search_outranking_share ?? null,
            positionAboveRate: row.metrics?.auction_insight_search_position_above_rate ?? null,
            topOfPageRate: row.metrics?.auction_insight_search_top_of_page_rate ?? null,
            absTopOfPageRate: row.metrics?.auction_insight_search_absolute_top_of_page_rate ?? null,
        }));
    } catch (error: unknown) {
        logApiError("getAuctionInsights", error);
        return [];
    }
}

// ============================================
// PRIORITY 3: Day-of-Week Performance
// ============================================

export interface DayOfWeekPerformance {
    campaignId: string;
    dayOfWeek: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    roas: number | null;
    cpa: number | null;
}

export async function getDayOfWeekPerformance(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange,
    campaignIds?: string[]
): Promise<DayOfWeekPerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);
    const campaignFilter = campaignIds?.length
        ? `AND campaign.id IN(${campaignIds.join(',')})` : '';

    try {
        const DAY_MAP: Record<number, string> = {
            2: 'MONDAY', 3: 'TUESDAY', 4: 'WEDNESDAY',
            5: 'THURSDAY', 6: 'FRIDAY', 7: 'SATURDAY', 8: 'SUNDAY'
        };

        const result = await customer.query(`
    SELECT
    campaign.id,
        segments.day_of_week,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
            FROM campaign
            WHERE campaign.status != 'REMOVED' ${dateFilter} ${campaignFilter}
    `);

        return result.map((row) => {
            const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            const conversions = Number(row.metrics?.conversions) || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;
            const rawDay = row.segments?.day_of_week;

            return {
                campaignId: row.campaign?.id?.toString() || "",
                dayOfWeek: typeof rawDay === 'string' ? rawDay : (typeof rawDay === 'number' ? (DAY_MAP[rawDay] || 'UNKNOWN') : 'UNKNOWN'),
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost,
                conversions,
                conversionValue,
                roas: cost > 0 ? conversionValue / cost : null,
                cpa: conversions > 0 ? cost / conversions : null,
            };
        });
    } catch (error: unknown) {
        logApiError("getDayOfWeekPerformance", error);
        return [];
    }
}

// ============================================
// PRIORITY 3: Device Performance (Account Level)
// ============================================

export interface AccountDevicePerformance {
    device: string;
    cost: number;
    conversions: number;
    conversionValue: number;
    clicks: number;
    impressions: number;
    roas: number | null;
    cpa: number | null;
}

export async function getAccountDeviceStats(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange
): Promise<AccountDevicePerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    const DEVICE_MAPPING: Record<number, string> = {
        2: 'MOBILE',
        3: 'TABLET',
        4: 'DESKTOP',
        6: 'CONNECTED_TV'
    };

    try {
        const result = await customer.query(`
            SELECT 
                segments.device,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value,
                metrics.clicks,
                metrics.impressions
            FROM campaign 
            WHERE 
                campaign.status != 'REMOVED' 
                ${dateFilter}
                AND metrics.impressions > 0
        `);

        // Aggregate by device
        const aggregator: Record<string, AccountDevicePerformance> = {};

        for (const row of result) {
            const rawDevice = row.segments?.device;
            // Map enum number or string to readable name if needed, 
            // but GAQL returns 'MOBILE', 'DESKTOP' etc strings usually if queried as segments.device
            // Actually, querying via client typically returns the enum string value.
            // Let's rely on the string returned.
            // The previous mapping had numbers 2,3,4... let's be safe.
            let deviceName = 'UNKNOWN';
            if (typeof rawDevice === 'number') {
                deviceName = DEVICE_MAPPING[rawDevice] || 'UNKNOWN';
            } else if (typeof rawDevice === 'string') {
                deviceName = rawDevice;
            }

            if (!aggregator[deviceName]) {
                aggregator[deviceName] = {
                    device: deviceName,
                    cost: 0,
                    conversions: 0,
                    conversionValue: 0,
                    clicks: 0,
                    impressions: 0,
                    roas: null,
                    cpa: null
                };
            }

            const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            const conversions = Number(row.metrics?.conversions) || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;
            const clicks = Number(row.metrics?.clicks) || 0;
            const impressions = Number(row.metrics?.impressions) || 0;

            aggregator[deviceName].cost += cost;
            aggregator[deviceName].conversions += conversions;
            aggregator[deviceName].conversionValue += conversionValue;
            aggregator[deviceName].clicks += clicks;
            aggregator[deviceName].impressions += impressions;
        }

        // Calculate calculated fields (ROAS, CPA)
        return Object.values(aggregator).map(d => ({
            ...d,
            roas: d.cost > 0 ? d.conversionValue / d.cost : null,
            cpa: d.conversions > 0 ? d.cost / d.conversions : null
        }));

    } catch (error: unknown) {
        logApiError("getAccountDeviceStats", error);
        return [];
    }
}


// ============================================
// PRIORITY 3: Hour-of-Day Performance
// ============================================

export interface HourOfDayPerformance {
    campaignId: string;
    hour: number;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    roas: number | null;
    cpa: number | null;
}

export async function getHourOfDayPerformance(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange,
    campaignIds?: string[]
): Promise<HourOfDayPerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);
    const campaignFilter = campaignIds?.length
        ? `AND campaign.id IN(${campaignIds.join(',')})` : '';

    try {
        const result = await customer.query(`
    SELECT
    campaign.id,
        segments.hour,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
            FROM campaign
            WHERE campaign.status != 'REMOVED' ${dateFilter} ${campaignFilter}
    `);

        return result.map((row) => {
            const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            const conversions = Number(row.metrics?.conversions) || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;

            return {
                campaignId: row.campaign?.id?.toString() || "",
                hour: Number(row.segments?.hour) ?? 0,
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost,
                conversions,
                conversionValue,
                roas: cost > 0 ? conversionValue / cost : null,
                cpa: conversions > 0 ? cost / conversions : null,
            };
        });
    } catch (error: unknown) {
        logApiError("getHourOfDayPerformance", error);
        return [];
    }
}

// ============================================
// PRIORITY 4: Landing Page Performance
// ============================================

export interface LandingPagePerformance {
    landingPageUrl: string;
    campaignId?: string | null;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    ctr: number;
    roas: number | null;
    cpa: number | null;
    mobileFriendlyClicksPercentage: number | null;
    speedScore: number | null;
    landingPageExperience: string | null;
}

export async function getLandingPagePerformance(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange,
    campaignIds?: string[]
): Promise<LandingPagePerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);
    const campaignFilter = campaignIds?.length
        ? `AND campaign.id IN(${campaignIds.join(',')})` : '';

    try {
        const result = await customer.query(`
    SELECT
    campaign.id,
        landing_page_view.unexpanded_final_url,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.ctr,
        metrics.mobile_friendly_clicks_percentage,
        metrics.speed_score
            FROM landing_page_view
            WHERE metrics.impressions > 0 
            ${dateFilter} ${campaignFilter}
            ORDER BY metrics.cost_micros DESC
            LIMIT 200
        `);

        console.log(`[GoogleAds/LandingPages] Found ${result.length} rows`);

        const baseResults: LandingPagePerformance[] = result.map((row: any) => {
            const m = row.metrics || {};
            const lpv = row.landing_page_view || {};

            const cost = Number(m.cost_micros) / 1_000_000 || 0;
            const conversions = Number(m.conversions) || 0;
            const conversionValue = Number(m.conversions_value) || 0;


            return {
                landingPageUrl: lpv.unexpanded_final_url || 'Unknown',
                campaignId: row.campaign?.id?.toString() || null,
                impressions: Number(m.impressions) || 0,
                clicks: Number(m.clicks) || 0,
                cost: cost,
                conversions: conversions,
                conversionValue: conversionValue,
                ctr: Number(m.ctr) || 0,
                roas: cost > 0 ? conversionValue / cost : null,
                cpa: conversions > 0 ? cost / conversions : null,
                mobileFriendlyClicksPercentage: m.mobile_friendly_clicks_percentage !== undefined ? Number(m.mobile_friendly_clicks_percentage) : null,
                speedScore: m.speed_score !== undefined ? Number(m.speed_score) : null,
                landingPageExperience: null, // Placeholder, will be filled below
            };
        });

        // 2. Fetch Keyword Quality Scores for these URLs as a proxy for Experience
        try {
            const qualityData = await getLandingPageQualityScores(refreshToken, customerId, dateRange, campaignIds);

            // Normalize URL for matching (remove protocol and trailing slash)
            const normalize = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();

            // Map the aggregated scores back to our landing pages
            const enrichedWithQuality = baseResults.map((lp: any) => ({
                ...lp,
                landingPageExperience: qualityData[normalize(lp.landingPageUrl)] || null
            }));

            // 3. Fetch Mobile Percentages via device segmentation
            try {
                const mobileData = await getLandingPageMobilePercentages(refreshToken, customerId, dateRange, campaignIds);

                return enrichedWithQuality.map((lp: any) => ({
                    ...lp,
                    mobileFriendlyClicksPercentage: mobileData[normalize(lp.landingPageUrl)] ?? null
                }));
            } catch (mError) {
                console.error("[GoogleAds/LandingPages] Failed to fetch mobile percentages:", mError);
                return enrichedWithQuality;
            }
        } catch (qError) {
            console.error("[GoogleAds/LandingPages] Failed to fetch quality proxy:", qError);
            return baseResults;
        }
    } catch (error: unknown) {
        logApiError("getLandingPagePerformance", error);
        return [];
    }
}

/**
 * Helper to fetch keyword-level Landing Page Experience scores as a proxy for the Landing Page report.
 * Since keywords don't have their own final_urls, we need to:
 * 1. Fetch ad group → URL mappings from ad_group_ad
 * 2. Fetch keyword → ad group → score mappings
 * 3. Aggregate scores by URL
 */
async function getLandingPageQualityScores(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange,
    campaignIds?: string[]
): Promise<Record<string, string>> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);
    const campaignFilter = campaignIds?.length
        ? `AND campaign.id IN(${campaignIds.join(',')})` : '';

    // Step 1: Build ad_group_id → URL mapping from ad_group_ad
    const adGroupUrlMap: Record<string, string> = {};
    try {
        const adsResult = await customer.query(`
            SELECT
                ad_group.id,
                ad_group_ad.ad.final_urls
            FROM ad_group_ad
            WHERE ad_group_ad.status = 'ENABLED'
            ${campaignFilter}
            LIMIT 2000
        `);

        adsResult.forEach((row: any) => {
            const agId = row.ad_group?.id?.toString();
            const urls = row.ad_group_ad?.ad?.final_urls || [];
            if (agId && urls.length > 0) {
                // Normalize the URL for consistent matching
                const url = urls[0].replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
                adGroupUrlMap[agId] = url;
            }
        });
    } catch (e) {
        console.error("[GoogleAds/QualityScores] Failed to fetch ad group URLs:", e);
        return {};
    }

    // Step 2: Fetch keyword quality scores with ad_group.id
    const urlScores: Record<string, number[]> = {};
    try {
        const keywordResult = await customer.query(`
            SELECT
                ad_group.id,
                ad_group_criterion.quality_info.post_click_quality_score,
                metrics.impressions
            FROM keyword_view
            WHERE ad_group_criterion.status = 'ENABLED'
            AND metrics.impressions > 0
            ${dateFilter} ${campaignFilter}
            LIMIT 2000
        `);

        keywordResult.forEach((row: any) => {
            const agId = row.ad_group?.id?.toString();
            const score = row.ad_group_criterion?.quality_info?.post_click_quality_score;

            if (agId && score && score >= 2) {
                const url = adGroupUrlMap[agId];
                if (url) {
                    if (!urlScores[url]) urlScores[url] = [];
                    urlScores[url].push(score);
                }
            }
        });
    } catch (e) {
        console.error("[GoogleAds/QualityScores] Failed to fetch keyword scores:", e);
        return {};
    }

    // Step 3: Aggregate scores to final mapping
    const finalMapping: Record<string, string> = {};
    const scoreMap: Record<number, string> = {
        2: "BELOW_AVERAGE",
        3: "AVERAGE",
        4: "ABOVE_AVERAGE"
    };

    Object.entries(urlScores).forEach(([url, scores]) => {
        if (scores.length > 0) {
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            const finalScore = Math.round(avg);
            finalMapping[url] = scoreMap[finalScore] || "UNKNOWN";
        }
    });

    console.log(`[GoogleAds/QualityScores] Mapped ${Object.keys(finalMapping).length} URLs with quality data`);
    return finalMapping;
}

/**
 * Helper to calculate mobile click percentage for landing pages using device segmentation.
 * Returns a mapping of normalized URL → mobile percentage (0-1).
 */
async function getLandingPageMobilePercentages(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange,
    campaignIds?: string[]
): Promise<Record<string, number>> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);
    const campaignFilter = campaignIds?.length
        ? `AND campaign.id IN(${campaignIds.join(',')})` : '';

    try {
        const result = await customer.query(`
            SELECT
                landing_page_view.unexpanded_final_url,
                segments.device,
                metrics.clicks
            FROM landing_page_view
            WHERE metrics.clicks > 0
            ${dateFilter} ${campaignFilter}
            LIMIT 5000
        `);

        // Device enum: 2=MOBILE, 3=TABLET, 4=DESKTOP, 5=CONNECTED_TV
        const urlDeviceClicks: Record<string, { mobile: number, tablet: number, total: number }> = {};

        result.forEach((row: any) => {
            const url = row.landing_page_view?.unexpanded_final_url;
            const device = row.segments?.device?.toString();
            const clicks = Number(row.metrics?.clicks) || 0;

            if (url && device && clicks > 0) {
                const normalizedUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();

                if (!urlDeviceClicks[normalizedUrl]) {
                    urlDeviceClicks[normalizedUrl] = { mobile: 0, tablet: 0, total: 0 };
                }

                urlDeviceClicks[normalizedUrl].total += clicks;

                if (device === '2') {
                    urlDeviceClicks[normalizedUrl].mobile += clicks;
                } else if (device === '3') {
                    urlDeviceClicks[normalizedUrl].tablet += clicks;
                }
            }
        });

        // Calculate mobile percentage (mobile + tablet) / total
        const mobilePercentages: Record<string, number> = {};
        Object.entries(urlDeviceClicks).forEach(([url, stats]) => {
            if (stats.total > 0) {
                mobilePercentages[url] = (stats.mobile + stats.tablet) / stats.total;
            }
        });

        console.log(`[GoogleAds/MobilePercentages] Calculated mobile % for ${Object.keys(mobilePercentages).length} URLs`);
        return mobilePercentages;
    } catch (error) {
        console.error("[GoogleAds/MobilePercentages] Failed to fetch device data:", error);
        return {};
    }
}

// ============================================
// PRIORITY 4: Geographic Performance
// ============================================

export interface GeographicPerformance {
    campaignId: string;
    countryId: string;
    locationType: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    roas: number | null;
    cpa: number | null;
}

export async function getGeographicPerformance(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange
): Promise<GeographicPerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    try {
        const result = await customer.query(`
    SELECT
    campaign.id,
        geographic_view.country_criterion_id,
        geographic_view.location_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
            FROM geographic_view
            WHERE metrics.impressions > 0 ${dateFilter}
            ORDER BY metrics.cost_micros DESC
            LIMIT 500
        `);

        return result.map((row) => {
            const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            const conversions = Number(row.metrics?.conversions) || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;

            return {
                campaignId: row.campaign?.id?.toString() || "",
                countryId: row.geographic_view?.country_criterion_id?.toString() || "",
                locationType: String(row.geographic_view?.location_type) || "UNKNOWN",
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost,
                conversions,
                conversionValue,
                roas: cost > 0 ? conversionValue / cost : null,
                cpa: conversions > 0 ? cost / conversions : null,
            };
        });
    } catch (error: unknown) {
        logApiError("getGeographicPerformance", error);
        return [];
    }
}

// ============================================
// City-level Performance (segments.geo_target_city)
// ============================================

export interface RegionalPerformance {
    locationId: string;
    locationName: string;
    locationType: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    roas: number | null;
    cpa: number | null;
}

// Map target_type enum values (numeric) to readable strings
const TARGET_TYPE_MAP: Record<number, string> = {
    0: 'Unknown', 1: 'Unknown', 2: 'Airport', 3: 'Autonomous Community',
    4: 'Borough', 5: 'Canton', 6: 'City', 7: 'City Region',
    8: 'Congressional District', 9: 'Country', 10: 'County',
    11: 'Department', 12: 'District', 13: 'Governorate',
    14: 'Municipality', 15: 'National Park', 16: 'Neighborhood',
    17: 'Okrug', 18: 'Postal Code', 19: 'Prefecture',
    20: 'Province', 21: 'Region', 22: 'State', 23: 'Territory',
    24: 'TV Region', 25: 'Union Territory', 26: 'University',
};

export async function getRegionalPerformance(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange
): Promise<RegionalPerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    // Use geographic_view with geo_target_most_specific_location for city/region data
    const result = await customer.query(`
        SELECT
            segments.geo_target_most_specific_location,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value
        FROM geographic_view
        WHERE metrics.impressions > 0
            ${dateFilter}
        ORDER BY metrics.cost_micros DESC
        LIMIT 1000
    `);

    console.log(`[GoogleAds] getRegionalPerformance: got ${result.length} rows`);
    if (result.length > 0) {
        const sample = result[0] as any;
        console.log(`[GoogleAds] Sample row segments:`, JSON.stringify(sample.segments));
        console.log(`[GoogleAds] Sample row keys:`, Object.keys(sample));
    }

    // Extract unique geo_target_constant IDs from location resource names
    const locationIds = new Set<string>();
    result.forEach((row: any) => {
        const locRef = row.segments?.geo_target_most_specific_location
            ?? row.segments?.geoTargetMostSpecificLocation
            ?? (row as any).geo_target_most_specific_location;
        if (locRef) {
            const id = String(locRef).replace(/^geoTargetConstants\//, '');
            if (id && id !== '0' && id !== 'undefined' && id !== 'null' && id !== 'false') {
                locationIds.add(id);
            }
        }
    });

    console.log(`[GoogleAds] Unique location IDs found: ${locationIds.size}`);

    // Batch resolve location names via geo_target_constant
    const locationNames: Record<string, { name: string; canonicalName: string; type: string }> = {};

    if (locationIds.size > 0) {
        const idsArray = Array.from(locationIds);
        for (let i = 0; i < idsArray.length; i += 100) {
            const batch = idsArray.slice(i, i + 100);
            const idList = batch.join(', ');
            try {
                const geoResult = await customer.query(`
                    SELECT
                        geo_target_constant.id,
                        geo_target_constant.name,
                        geo_target_constant.canonical_name,
                        geo_target_constant.target_type
                    FROM geo_target_constant
                    WHERE geo_target_constant.id IN (${idList})
                `);
                geoResult.forEach((geoRow: any) => {
                    const id = geoRow.geo_target_constant?.id?.toString();
                    if (id) {
                        const rawType = geoRow.geo_target_constant?.target_type;
                        locationNames[id] = {
                            name: geoRow.geo_target_constant?.name || `Location ${id}`,
                            canonicalName: geoRow.geo_target_constant?.canonical_name || '',
                            type: typeof rawType === 'string'
                                ? rawType
                                : (typeof rawType === 'number' ? (TARGET_TYPE_MAP[rawType] || 'Location') : 'Location'),
                        };
                    }
                });
            } catch (geoErr) {
                console.warn("[GoogleAds] Failed to resolve geo_target_constant batch:", geoErr);
            }
        }
    }

    // Build results with resolved names, filtering out country-level entries (those are in getGeographicPerformance)
    return result
        .filter((row: any) => {
            const locRef = row.segments?.geo_target_most_specific_location
                ?? row.segments?.geoTargetMostSpecificLocation
                ?? (row as any).geo_target_most_specific_location;
            const id = String(locRef || '').replace(/^geoTargetConstants\//, '');
            if (!id || id === '0' || id === 'undefined' || id === 'null' || id === 'false') return false;
            // Filter out Country-level entries (already shown in Countries tab)
            const info = locationNames[id];
            return !info || info.type !== 'Country';
        })
        .map((row: any) => {
            const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            const conversions = Number(row.metrics?.conversions) || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;
            const locRef = String(
                row.segments?.geo_target_most_specific_location
                ?? row.segments?.geoTargetMostSpecificLocation
                ?? (row as any).geo_target_most_specific_location
                ?? ''
            );
            const locationId = locRef.replace(/^geoTargetConstants\//, '');
            const locInfo = locationNames[locationId];

            return {
                locationId,
                locationName: locInfo?.canonicalName || locInfo?.name || `Location ${locationId}`,
                locationType: locInfo?.type || 'Location',
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost,
                conversions,
                conversionValue,
                roas: cost > 0 ? conversionValue / cost : null,
                cpa: conversions > 0 ? cost / conversions : null,
            };
        });
}

// ============================================
// Search Terms Functions
// ============================================
export async function getSearchTerms(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange
): Promise<any[]> {
    try {
        console.log(`\n========== 🔍 SEARCH TERMS START ==========`);
        console.log(`Customer: ${customerId}`);
        console.log(`Date Range:`, dateRange);

        const customer = getGoogleAdsCustomer(refreshToken, customerId);
        // Fix: getDateFilter returns " AND segments.date...", which is invalid as first WHERE condition
        // We strip the leading " AND" to make it valid
        const rawDateFilter = getDateFilter(dateRange);
        const dateFilter = rawDateFilter.trim().replace(/^AND\s+/, '');

        // Use fields known to work from the API route
        const query = `
            SELECT 
                search_term_view.search_term,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value
            FROM 
                search_term_view 
            WHERE 
                ${dateFilter}
            ORDER BY 
                metrics.impressions DESC
            LIMIT 10000
        `;

        const rows = await customer.query(query);
        console.log(`✅ SUCCESS: Got ${rows.length} rows`);
        console.log(`========== 🔍 SEARCH TERMS END ==========\n`);

        return rows.map((row: any) => {
            const impressions = Number(row.metrics?.impressions) || 0;
            const clicks = Number(row.metrics?.clicks) || 0;
            const cost = Number(row.metrics?.cost_micros) / 1000000 || 0;

            return {
                term: row.search_term_view?.search_term,
                status: 'UNKNOWN', // Removed from query
                impressions,
                clicks,
                cost,
                conversions: Number(row.metrics?.conversions) || 0,
                conversionValue: Number(row.metrics?.conversions_value) || 0,
                ctr: impressions > 0 ? clicks / impressions : 0,
                averageCpc: clicks > 0 ? cost / clicks : 0
            };
        });
    } catch (error) {
        console.error(`\n❌ SEARCH TERMS FAILED:`, error);
        console.log(`========== 🔍 SEARCH TERMS END ==========\n`);
        logApiError("getSearchTerms", error);
        return [];
    }
}
