import { GoogleAdsApi } from "google-ads-api";

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
    // For MCC (Manager Account) access:
    // - login_customer_id: The MCC account ID (the one you're authenticated with)
    // - customer_id: The specific client account to query (defaults to MCC if not specified)
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || process.env.GOOGLE_ADS_CUSTOMER_ID;
    const targetCustomerId = customerId || process.env.GOOGLE_ADS_CUSTOMER_ID;

    console.log("Creating customer with:", {
        login_customer_id: loginCustomerId,
        customer_id: targetCustomerId,
        refresh_token: refreshToken ? "present" : "missing",
    });

    const googleClient = getClient();
    return googleClient.Customer({
        customer_id: targetCustomerId!,
        login_customer_id: loginCustomerId!,
        refresh_token: refreshToken,
    });
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
    searchLostISRank: number | null;
    searchLostISBudget: number | null;
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
    qualityScore: number | null;
    expectedCtr: string;
    landingPageExperience: string;
    adRelevance: string;
    impressions: number;
    clicks: number;
    cost: number;
}

export interface AdWithStrength {
    id: string;
    adGroupId: string;
    type: string;
    adStrength: string; // UNSPECIFIED, UNKNOWN, PENDING, NO_ADS, POOR, AVERAGE, GOOD, EXCELLENT
    headlinesCount: number;
    descriptionsCount: number;
    finalUrls: string[];
    headlines: string[];
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

export async function getCampaigns(refreshToken: string): Promise<CampaignPerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken);

    try {
        const campaigns = await customer.query(`
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
                metrics.search_impression_share,
                metrics.search_rank_lost_impression_share,
                metrics.search_budget_lost_impression_share
            FROM campaign
            WHERE campaign.status != 'REMOVED'
            ORDER BY metrics.impressions DESC
            LIMIT 50
        `);

        return campaigns.map((row) => ({
            id: row.campaign?.id?.toString() || "",
            name: row.campaign?.name || "",
            status: String(row.campaign?.status) || "",
            impressions: Number(row.metrics?.impressions) || 0,
            clicks: Number(row.metrics?.clicks) || 0,
            cost: Number(row.metrics?.cost_micros) / 1_000_000 || 0,
            conversions: Number(row.metrics?.conversions) || 0,
            ctr: Number(row.metrics?.ctr) || 0,
            cpc: Number(row.metrics?.average_cpc) / 1_000_000 || 0,
            searchImpressionShare: row.metrics?.search_impression_share ?? null,
            searchLostISRank: row.metrics?.search_rank_lost_impression_share ?? null,
            searchLostISBudget: row.metrics?.search_budget_lost_impression_share ?? null,
        }));
    } catch (error: unknown) {
        logApiError("getCampaigns", error);
        throw error;
    }
}

// List all accessible customer accounts under the MCC
export async function getAccessibleCustomers(refreshToken: string): Promise<{id: string, name: string, isManager: boolean}[]> {
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

export async function getAccountInfo(refreshToken: string) {
    const customer = getGoogleAdsCustomer(refreshToken);

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

export async function getAdGroups(refreshToken: string, campaignId?: string): Promise<AdGroupPerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken);

    try {
        const whereClause = campaignId
            ? `WHERE ad_group.status != 'REMOVED' AND campaign.id = ${campaignId}`
            : `WHERE ad_group.status != 'REMOVED'`;

        const adGroups = await customer.query(`
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
                metrics.average_cpc
            FROM ad_group
            ${whereClause}
            ORDER BY metrics.impressions DESC
            LIMIT 100
        `);

        // Note: avgQualityScore and ad counts require separate queries
        // These will be populated by getKeywordsWithQS and getAdsWithStrength
        return adGroups.map((row) => ({
            id: row.ad_group?.id?.toString() || "",
            campaignId: row.campaign?.id?.toString() || "",
            name: row.ad_group?.name || "",
            status: String(row.ad_group?.status) || "",
            impressions: Number(row.metrics?.impressions) || 0,
            clicks: Number(row.metrics?.clicks) || 0,
            cost: Number(row.metrics?.cost_micros) / 1_000_000 || 0,
            conversions: Number(row.metrics?.conversions) || 0,
            ctr: Number(row.metrics?.ctr) || 0,
            cpc: Number(row.metrics?.average_cpc) / 1_000_000 || 0,
            avgQualityScore: null, // Populated separately
            keywordsWithLowQS: 0,
            adsCount: 0,
            poorAdsCount: 0,
        }));
    } catch (error: unknown) {
        logApiError("API call", error);
        throw error;
    }
}

export async function getNegativeKeywords(refreshToken: string, adGroupId?: string): Promise<NegativeKeyword[]> {
    const customer = getGoogleAdsCustomer(refreshToken);

    try {
        const whereClause = adGroupId
            ? `WHERE ad_group_criterion.negative = TRUE AND ad_group.id = ${adGroupId}`
            : `WHERE ad_group_criterion.negative = TRUE`;

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

        return keywords.map((row) => ({
            id: row.ad_group_criterion?.criterion_id?.toString() || "",
            adGroupId: row.ad_group?.id?.toString() || "",
            text: row.ad_group_criterion?.keyword?.text || "",
            matchType: String(row.ad_group_criterion?.keyword?.match_type) || "",
        }));
    } catch (error: unknown) {
        logApiError("API call", error);
        throw error;
    }
}

export async function getKeywordsWithQS(refreshToken: string, adGroupId?: string): Promise<KeywordWithQS[]> {
    const customer = getGoogleAdsCustomer(refreshToken);

    try {
        const whereClause = adGroupId
            ? `WHERE ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED' AND ad_group.id = ${adGroupId}`
            : `WHERE ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED'`;

        const keywords = await customer.query(`
            SELECT
                ad_group_criterion.criterion_id,
                ad_group.id,
                ad_group_criterion.keyword.text,
                ad_group_criterion.keyword.match_type,
                ad_group_criterion.quality_info.quality_score,
                ad_group_criterion.quality_info.creative_quality_score,
                ad_group_criterion.quality_info.post_click_quality_score,
                ad_group_criterion.quality_info.search_predicted_ctr,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros
            FROM keyword_view
            ${whereClause}
            ORDER BY metrics.impressions DESC
            LIMIT 200
        `);

        return keywords.map((row) => ({
            id: row.ad_group_criterion?.criterion_id?.toString() || "",
            adGroupId: row.ad_group?.id?.toString() || "",
            text: row.ad_group_criterion?.keyword?.text || "",
            matchType: String(row.ad_group_criterion?.keyword?.match_type) || "",
            qualityScore: row.ad_group_criterion?.quality_info?.quality_score ?? null,
            expectedCtr: String(row.ad_group_criterion?.quality_info?.search_predicted_ctr) || "UNSPECIFIED",
            landingPageExperience: String(row.ad_group_criterion?.quality_info?.post_click_quality_score) || "UNSPECIFIED",
            adRelevance: String(row.ad_group_criterion?.quality_info?.creative_quality_score) || "UNSPECIFIED",
            impressions: Number(row.metrics?.impressions) || 0,
            clicks: Number(row.metrics?.clicks) || 0,
            cost: Number(row.metrics?.cost_micros) / 1_000_000 || 0,
        }));
    } catch (error: unknown) {
        logApiError("API call", error);
        throw error;
    }
}

export async function getAdsWithStrength(refreshToken: string, adGroupId?: string): Promise<AdWithStrength[]> {
    const customer = getGoogleAdsCustomer(refreshToken);

    try {
        const whereClause = adGroupId
            ? `WHERE ad_group_ad.status != 'REMOVED' AND ad_group.id = ${adGroupId}`
            : `WHERE ad_group_ad.status != 'REMOVED'`;

        const ads = await customer.query(`
            SELECT
                ad_group_ad.ad.id,
                ad_group.id,
                ad_group_ad.ad.type,
                ad_group_ad.ad.responsive_search_ad.headlines,
                ad_group_ad.ad.responsive_search_ad.descriptions,
                ad_group_ad.ad.final_urls,
                ad_group_ad.ad_strength
            FROM ad_group_ad
            ${whereClause}
            LIMIT 200
        `);

        return ads.map((row) => ({
            id: row.ad_group_ad?.ad?.id?.toString() || "",
            adGroupId: row.ad_group?.id?.toString() || "",
            type: String(row.ad_group_ad?.ad?.type) || "",
            adStrength: String(row.ad_group_ad?.ad_strength) || "UNSPECIFIED",
            headlinesCount: row.ad_group_ad?.ad?.responsive_search_ad?.headlines?.length || 0,
            descriptionsCount: row.ad_group_ad?.ad?.responsive_search_ad?.descriptions?.length || 0,
            finalUrls: row.ad_group_ad?.ad?.final_urls || [],
            headlines: (row.ad_group_ad?.ad?.responsive_search_ad?.headlines || []).map((h: any) => h.text || ""),
        }));
    } catch (error: unknown) {
        logApiError("API call", error);
        throw error;
    }
}
