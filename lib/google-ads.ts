import { GoogleAdsApi } from "google-ads-api";
import { logActivity } from "./activity-logger";
export type { AuctionInsight };
import {

    PMaxAsset,
    AssetPerformance,
    ChangeEvent,
    ConversionAction,
    PMaxProductPerformance,
    AccountAsset,
    NetworkPerformance,
    AuctionInsight,
    AudiencePerformance,
    PMaxSearchInsight,
    PlacementPerformance,
    DemographicPerformance,
    TimeAnalysisPerformance,
    NegativeKeyword,
    KeywordWithQS
} from "@/types/google-ads";


let client: GoogleAdsApi | null = null;

// ── In-memory API cache ──────────────────────────────────────────────
interface CacheEntry { data: unknown; expiresAt: number; }
const apiCache = new Map<string, CacheEntry>();

const CACHE_TTL = {
    account: 30 * 60 * 1000,  // 30 min - account info rarely changes
    campaigns: 5 * 60 * 1000,  // 5 min
    adGroups: 5 * 60 * 1000,
    assets: 5 * 60 * 1000,
    keywords: 5 * 60 * 1000,
    assetGroups: 5 * 60 * 1000,
    listingGroups: 5 * 60 * 1000,
    ads: 5 * 60 * 1000,
    device: 5 * 60 * 1000,
    search: 5 * 60 * 1000,
    diagnostics: 10 * 60 * 1000, // Device, Geo, Hour, etc.
    default: 5 * 60 * 1000,
};

async function withCache<T>(category: keyof typeof CACHE_TTL, keyParts: unknown[], fn: () => Promise<T>): Promise<T> {
    const key = `${category}:${JSON.stringify(keyParts)} `;
    const cached = apiCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        console.log(`[Cache HIT] ${category} (${Math.round((cached.expiresAt - Date.now()) / 1000)}s left)`);
        return cached.data as T;
    }
    const result = await fn();
    apiCache.set(key, { data: result, expiresAt: Date.now() + (CACHE_TTL[category] || CACHE_TTL.default) });
    console.log(`[Cache SET] ${category} `);
    // Cleanup expired entries periodically
    if (apiCache.size > 100) {
        const now = Date.now();
        for (const [k, v] of apiCache) {
            if (v.expiresAt < now) apiCache.delete(k);
        }
    }
    return result;
}
// ─────────────────────────────────────────────────────────────────────

export function getClient() {
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

export function getDateFilter(dateRange?: DateRange, field: string = 'segments.date') {
    if (!dateRange?.start || !dateRange?.end) return "";
    return ` AND ${field} BETWEEN '${dateRange.start}' AND '${dateRange.end}'`;
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
    adStrength?: string;
    conversionValue: number;
    roas: number | null;
    cpa: number | null;
    campaignName?: string;
    // Type classification
    adGroupType?: string;   // SEARCH_STANDARD, SEARCH_DYNAMIC_AD, etc.
    campaignType?: string;  // SEARCH, PERFORMANCE_MAX, DISPLAY, VIDEO
    // Impression Share metrics
    searchImpressionShare: number | null;
    searchLostISRank: number | null;
    searchLostISBudget: number | null;
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
    campaignName?: string;
}

export function extractApiErrorInfo(error: unknown): { message: string; isQuotaError: boolean; retryAfterSeconds?: number } {
    const anyError = error as any;
    const errors = anyError?.errors;
    if (Array.isArray(errors)) {
        for (const e of errors) {
            if (e?.error_code?.quota_error) {
                const retryMatch = e.message?.match(/Retry in (\d+) seconds/);
                const retrySeconds = retryMatch ? parseInt(retryMatch[1]) : undefined;
                return {
                    message: e.message || 'Quota exceeded',
                    isQuotaError: true,
                    retryAfterSeconds: retrySeconds,
                };
            }
            if (e?.message) {
                return { message: e.message, isQuotaError: false };
            }
        }
    }
    if (error instanceof Error && error.message) {
        return { message: error.message, isQuotaError: false };
    }
    return { message: String(error), isQuotaError: false };
}

function logApiError(context: string, error: unknown) {
    console.error(`\n === Google Ads API Error(${context}) === `);
    if (error instanceof Error) {
        console.error("Message:", error.message);
        console.error("Stack:", error.stack);
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

const PERFORMANCE_LABEL_MAP: Record<number, string> = {
    0: 'UNSPECIFIED',
    1: 'UNKNOWN',
    2: 'PENDING',
    3: 'LEARNING',
    4: 'LOW',
    5: 'GOOD',
    6: 'BEST',
};

function mapPerformanceLabel(label: any): string {
    if (typeof label === 'string') {
        // Already a string enum name like "BEST", "GOOD", etc.
        return label === 'UNSPECIFIED' ? 'PENDING' : label;
    }
    if (typeof label === 'number') {
        return PERFORMANCE_LABEL_MAP[label] || 'UNKNOWN';
    }
    return 'UNKNOWN';
}

function mapStatus(status: any): string {
    if (status === 2 || status === '2' || status === 'ENABLED') return 'ENABLED';
    if (status === 3 || status === '3' || status === 'PAUSED') return 'PAUSED';
    if (status === 4 || status === '4' || status === 'REMOVED') return 'REMOVED';
    return String(status || 'UNKNOWN');
}

export function mapMatchType(type: any): string {
    const MAP: Record<number | string, string> = {
        0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'EXACT', 3: 'PHRASE', 4: 'BROAD'
    };
    if (typeof type === 'string' && isNaN(Number(type))) return type;
    return MAP[type] || MAP[Number(type)] || 'UNKNOWN';
}

export function mapSearchTermMatchType(type: any): string {
    const MAP: Record<number | string, string> = {
        0: 'UNSPECIFIED',
        1: 'UNKNOWN',
        2: 'BROAD',
        3: 'EXACT',
        4: 'PHRASE',
        5: 'NEAR_EXACT',
        6: 'NEAR_PHRASE'
    };
    if (typeof type === 'string' && isNaN(Number(type))) return type;
    const mapped = MAP[type] || MAP[Number(type)] || 'UNKNOWN';

    // Convert to readable format
    if (mapped === 'NEAR_EXACT') return 'Exact (Close Variant)';
    if (mapped === 'NEAR_PHRASE') return 'Phrase (Close Variant)';

    // Capitalize first letter for others
    return mapped.charAt(0) + mapped.slice(1).toLowerCase();
}

export function mapConversionCategory(category: any): string {
    const MAP: Record<number | string, string> = {
        0: 'UNSPECIFIED',
        1: 'UNKNOWN',
        2: 'DEFAULT',
        3: 'PAGE_VIEW',
        4: 'PURCHASE',
        5: 'SIGNUP',
        6: 'LEAD',
        7: 'DOWNLOAD',
        8: 'ADD_TO_CART',
        9: 'BEGIN_CHECKOUT',
        10: 'SUBSCRIBE_PAID',
        11: 'PHONE_CALL_LEAD',
        12: 'IMPORTED_LEAD',
        13: 'SUBMIT_LEAD_FORM',
        14: 'BOOK_APPOINTMENT',
        15: 'REQUEST_QUOTE',
        16: 'GET_DIRECTIONS',
        17: 'OUTBOUND_CLICK',
        18: 'CONTACT',
        19: 'ENGAGEMENT',
        20: 'STORE_VISIT',
        21: 'STORE_SALE',
        22: 'QUALIFIED_LEAD',
        23: 'CONVERTED_LEAD'
    };
    if (typeof category === 'string' && isNaN(Number(category))) return category;
    return MAP[category] || MAP[Number(category)] || 'UNKNOWN';
}

export function mapQSComponent(score: any): string {
    const MAP: Record<number | string, string> = {
        0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'BELOW_AVERAGE', 3: 'AVERAGE', 4: 'ABOVE_AVERAGE'
    };
    if (typeof score === 'string' && isNaN(Number(score))) return score;
    return MAP[score] || MAP[Number(score)] || 'UNSPECIFIED';
}

export function mapBiddingStrategyType(type: any): string {
    const MAP: Record<number | string, string> = {
        0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'MANUAL_CPC', 3: 'MANUAL_CPM',
        4: 'MANUAL_CPV', 5: 'MAXIMIZE_CONVERSIONS', 6: 'MAXIMIZE_CONVERSION_VALUE',
        7: 'TARGET_CPA', 8: 'TARGET_ROAS', 9: 'TARGET_IMPRESSION_SHARE',
        10: 'ENHANCED_CPC', 11: 'MAXIMIZE_CONVERSIONS', 12: 'MAXIMIZE_CONVERSION_VALUE',
        13: 'TARGET_SPEND'
    };
    if (typeof type === 'string' && isNaN(Number(type))) return type;
    return MAP[type] || MAP[Number(type)] || 'UNKNOWN';
}

function parseImpressionShare(val: any): number | null {
    if (val === null || val === undefined || val === '--') return null;
    if (typeof val === 'number') return val;
    const s = String(val);
    if (s.includes('< 0.1') || s.includes('< 10%')) return 0.099; // Represent as slightly less than 0.1
    const clean = s.replace('< ', '').replace('> ', '').replace('%', '');
    const num = parseFloat(clean);
    if (isNaN(num)) return null;
    // If it's a percentage (e.g. > 10), convert to fraction
    if (num > 1 && s.includes('%')) return num / 100;
    return num;
}

export async function getCampaigns(refreshToken: string, customerId?: string, dateRange?: DateRange, onlyEnabled: boolean = false, userId?: string): Promise<CampaignPerformance[]> {
    if (userId) logActivity(userId, 'API_CALL', { category: 'campaigns', customerId });
    return withCache('campaigns', [customerId, dateRange, onlyEnabled], async () => {
        const customer = getGoogleAdsCustomer(refreshToken, customerId);
        const dateFilter = getDateFilter(dateRange);

        const statusFilter = onlyEnabled
            ? `AND campaign.status = 'ENABLED'`
            : `AND campaign.status != 'REMOVED'`;

        try {
            const result = await customer.query(`
SELECT
campaign.id, campaign.name, campaign.status,
    metrics.impressions, metrics.clicks, metrics.cost_micros,
    metrics.conversions, metrics.ctr, metrics.average_cpc,
    metrics.conversions_value,
    metrics.search_impression_share, metrics.search_top_impression_share,
    metrics.search_rank_lost_impression_share, metrics.search_budget_lost_impression_share,
    metrics.search_absolute_top_impression_share,
    campaign.bidding_strategy_type, campaign.advertising_channel_type,
    campaign.target_roas.target_roas, campaign.target_cpa.target_cpa_micros,
    campaign.campaign_budget, campaign_budget.amount_micros,
    campaign_budget.delivery_method, campaign_budget.status,
    campaign.optimization_score
                FROM campaign
                WHERE campaign.status != 'REMOVED' ${statusFilter} ${dateFilter}
                ORDER BY 
                    metrics.impressions DESC,
                    metrics.clicks DESC,
                    metrics.cost_micros DESC,
                    campaign.name ASC
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
                    searchImpressionShare: parseImpressionShare(row.metrics?.search_impression_share),
                    searchTopImpressionShare: parseImpressionShare(row.metrics?.search_top_impression_share),
                    searchLostISRank: parseImpressionShare(row.metrics?.search_rank_lost_impression_share),
                    searchLostISBudget: parseImpressionShare(row.metrics?.search_budget_lost_impression_share),
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
                    searchAbsTopIS: parseImpressionShare(row.metrics?.search_absolute_top_impression_share),
                };
            });
        } catch (error: unknown) {
            logApiError("getCampaigns", error);
            throw error;
        }
    });
}

// List all accessible customer accounts under the MCC
export async function getAccessibleCustomers(refreshToken: string): Promise<{ id: string, name: string, isManager: boolean }[]> {
    return withCache('account', ['accessible_customers'], async () => {
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
    });
}

export async function resolveCustomerAccountId(refreshToken: string, requestedId?: string): Promise<string> {
    const customers = await getAccessibleCustomers(refreshToken);
    const cleanRequestedId = requestedId?.replace(/-/g, '');

    // 1. If we have a requested ID, check if it's a valid client account
    if (cleanRequestedId) {
        const match = customers.find(c => c.id === cleanRequestedId);
        if (match && !match.isManager) {
            return match.id;
        }
        // If it was found but is a manager, we continue to resolve to a client
    }

    // 2. Find the first valid client account in the hierarchy
    // Sort by level or simply pick the first non-manager one
    const clientAccount = customers.find(c => !c.isManager);

    if (clientAccount) {
        if (cleanRequestedId && cleanRequestedId !== clientAccount.id) {
            console.log(`[GoogleAds] Requested ID ${cleanRequestedId} is a Manager. Redirecting to client account: ${clientAccount.name} (${clientAccount.id})`);
        } else {
            console.log(`[GoogleAds] Auto-resolved client account: ${clientAccount.name} (${clientAccount.id})`);
        }
        return clientAccount.id;
    }

    // 3. Fallback to process.env if somehow not caught in the list (unlikely)
    const envId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, '');
    if (envId) {
        const isClient = customers.some(c => c.id === envId && !c.isManager);
        if (isClient) return envId;
    }

    throw new Error("No valid client account found. The account hierarchy only contains Manager Accounts.");
}

export async function getAccountInfo(refreshToken: string, customerId?: string) {
    return withCache('account', [customerId], async () => {
        const customer = getGoogleAdsCustomer(refreshToken, customerId);
        try {
            const result = await customer.query(`
                SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone
                FROM customer LIMIT 1
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
    });
}

export async function getAdGroups(refreshToken: string, campaignId?: string, customerId?: string, dateRange?: DateRange, onlyEnabled: boolean = false, userId?: string): Promise<AdGroupPerformance[]> {
    if (userId) logActivity(userId, 'API_CALL', { category: 'adGroups', customerId, campaignId });
    return withCache('adGroups', [campaignId, customerId, dateRange, onlyEnabled], async () => {
        const customer = getGoogleAdsCustomer(refreshToken, customerId);
        const dateFilter = getDateFilter(dateRange);

        try {
            const statusClause = onlyEnabled
                ? `ad_group.status = 'ENABLED'`
                : `ad_group.status != 'REMOVED'`;

            const campaignClause = campaignId
                ? `AND campaign.id = ${campaignId} `
                : '';

            const query = `
SELECT
ad_group.id,
    ad_group.name,
    ad_group.status,
    ad_group.type,
    campaign.id,
    campaign.name,
    campaign.advertising_channel_type,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions,
    metrics.ctr,
    metrics.average_cpc,
    metrics.conversions_value,
    metrics.view_through_conversions,
    metrics.interaction_rate,
    metrics.average_cpm,
    metrics.search_impression_share,
    metrics.search_rank_lost_impression_share
            FROM ad_group
            WHERE ${statusClause} ${campaignClause} ${dateFilter}
            ORDER BY 
                metrics.impressions DESC,
                metrics.clicks DESC,
                metrics.cost_micros DESC,
                ad_group.name ASC
    `;

            console.log(`[getAdGroups] customerId = ${customerId}, campaignId = ${campaignId || 'ALL'} `);

            const adGroups = await customer.query(query);

            console.log(`GAQL found ${adGroups.length} ad groups`);

            const adGroupIds = adGroups.map(ag => ag.ad_group?.id?.toString()).filter((id): id is string => !!id);

            let keywords: KeywordWithQS[] = [];
            let ads: AdWithStrength[] = [];

            // Cap enrichment to top 150 ad groups (by impressions, already sorted).
            // Large IN() clauses (500+ IDs) cause slow GAQL queries and timeouts.
            const enrichIds = adGroupIds.slice(0, 150);
            if (enrichIds.length < adGroupIds.length) {
                console.log(`[getAdGroups] Enriching top ${enrichIds.length} of ${adGroupIds.length} ad groups`);
            }

            if (enrichIds.length > 0) {
                try {
                    [keywords, ads] = await Promise.all([
                        getKeywordsWithQS(refreshToken, undefined, customerId, dateRange, enrichIds, undefined, undefined, onlyEnabled),
                        getAdsWithStrength(refreshToken, undefined, customerId, enrichIds, dateRange, onlyEnabled)
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

                // Deduplicate by ID: keyword_view/ad_group_ad return 1 row per day with date ranges
                const seenKeywords = new Map<string, KeywordWithQS>();
                for (const k of keywords) {
                    if (k.adGroupId === id && !seenKeywords.has(k.id)) seenKeywords.set(k.id, k);
                }
                const groupKeywords = Array.from(seenKeywords.values());

                const seenAds = new Map<string, AdWithStrength>();
                for (const a of ads) {
                    if (a.adGroupId === id && !seenAds.has(a.id)) seenAds.set(a.id, a);
                }
                const groupAds = Array.from(seenAds.values());

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
                    campaignName: row.campaign?.name || "",
                    name: row.ad_group?.name || "",
                    status: mapStatus(row.ad_group?.status),
                    impressions: Number(row.metrics?.impressions) || 0,
                    clicks: Number(row.metrics?.clicks) || 0,
                    cost,
                    conversions,
                    ctr: Number(row.metrics?.ctr) || 0,
                    cpc: Number(row.metrics?.average_cpc) / 1_000_000 || 0,
                    searchImpressionShare: parseImpressionShare(row.metrics?.search_impression_share),
                    searchLostISRank: parseImpressionShare(row.metrics?.search_rank_lost_impression_share),
                    viewThroughConversions: Number(row.metrics?.view_through_conversions) || 0,
                    interactionRate: Number(row.metrics?.interaction_rate) || 0,
                    averageCpm: Number(row.metrics?.average_cpm) / 1_000_000 || 0,
                    keywords: groupKeywords,
                    searchLostISBudget: null,
                    avgQualityScore,
                    keywordsWithLowQS,
                    adsCount: groupAds.length,
                    poorAdsCount,
                    adStrength,
                    conversionValue,
                    roas: cost > 0 ? conversionValue / cost : null,
                    cpa: conversions > 0 ? cost / conversions : null,
                    adGroupType: String(row.ad_group?.type || 'UNKNOWN'),
                    campaignType: String(row.campaign?.advertising_channel_type || 'UNKNOWN'),
                };
            });
        } catch (error: unknown) {
            logApiError("API call", error);
            throw error;
        }
    });
}

export async function getNegativeKeywords(refreshToken: string, adGroupId?: string, customerId?: string): Promise<NegativeKeyword[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);

    try {
        const MATCH_TYPE_MAP: Record<string, string> = {
            '2': 'UNSPECIFIED',
            '3': 'EXACT',
            '4': 'BROAD',
            '5': 'PHRASE'
        };

        // 1. Ad Group Negatives
        const agWhere = adGroupId
            ? `WHERE ad_group_criterion.negative = TRUE AND ad_group.id = ${adGroupId} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'`
            : `WHERE ad_group_criterion.negative = TRUE AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'`;

        const agKeywordsPromise = customer.query(`
            SELECT
                ad_group_criterion.criterion_id,
                ad_group.id,
                ad_group_criterion.keyword.text,
                ad_group_criterion.keyword.match_type
            FROM ad_group_criterion
            ${agWhere}
            LIMIT 1000
        `);

        // 2. Campaign Negatives
        // Note: If adGroupId is provided, we'd ideally filter by campaign. For health checks, we usually fetch all.
        const campaignKeywordsPromise = customer.query(`
            SELECT
                campaign_criterion.criterion_id,
                campaign.id,
                campaign_criterion.keyword.text,
                campaign_criterion.keyword.match_type
            FROM campaign_criterion
            WHERE campaign_criterion.negative = TRUE 
              AND campaign_criterion.type = 'KEYWORD'
              AND campaign_criterion.status != 'REMOVED'
            LIMIT 1000
        `);

        // 3. Shared Set Negatives (Shared Criteria)
        const sharedKeywordsPromise = customer.query(`
            SELECT
                shared_criterion.criterion_id,
                shared_set.id,
                shared_criterion.keyword.text,
                shared_criterion.keyword.match_type
            FROM shared_criterion
            LIMIT 2000
        `);

        const [agResults, campaignResults, sharedResults] = await Promise.all([
            agKeywordsPromise,
            campaignKeywordsPromise,
            sharedKeywordsPromise
        ]);

        console.log(`[getNegativeKeywords] API results: AG=${agResults.length}, Campaign=${campaignResults.length}, Shared=${sharedResults.length}`);

        const allNegatives: NegativeKeyword[] = [];

        // Map AG results
        agResults.forEach((row) => {
            const rawMatchType = String(row.ad_group_criterion?.keyword?.match_type);
            allNegatives.push({
                id: row.ad_group_criterion?.criterion_id?.toString() || "",
                adGroupId: row.ad_group?.id?.toString() || "",
                text: row.ad_group_criterion?.keyword?.text || "",
                matchType: MATCH_TYPE_MAP[rawMatchType] || rawMatchType || "UNKNOWN",
            });
        });

        // Map Campaign results
        campaignResults.forEach((row) => {
            const rawMatchType = String(row.campaign_criterion?.keyword?.match_type);
            allNegatives.push({
                id: row.campaign_criterion?.criterion_id?.toString() || "",
                campaignId: row.campaign?.id?.toString() || "",
                text: row.campaign_criterion?.keyword?.text || "",
                matchType: MATCH_TYPE_MAP[rawMatchType] || rawMatchType || "UNKNOWN",
            });
        });

        // Map Shared results
        sharedResults.forEach((row) => {
            const rawMatchType = String(row.shared_criterion?.keyword?.match_type);
            allNegatives.push({
                id: row.shared_criterion?.criterion_id?.toString() || "",
                text: row.shared_criterion?.keyword?.text || "",
                matchType: MATCH_TYPE_MAP[rawMatchType] || rawMatchType || "UNKNOWN",
            });
        });

        return allNegatives;
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
    return withCache('keywords', [adGroupId, customerId, dateRange, adGroupIds, onlyEnabled], async () => {
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
    ad_group_criterion.final_urls,
    ad_group_criterion.status,
    ad_group_criterion.quality_info.quality_score,
    ad_group_criterion.quality_info.creative_quality_score,
    ad_group_criterion.quality_info.post_click_quality_score,
    ad_group_criterion.quality_info.search_predicted_ctr,
    ad_group.name,
    campaign.bidding_strategy_type,
    campaign.name,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions,
    metrics.conversions_value,
    metrics.average_cpc,
    metrics.all_conversions,
    metrics.view_through_conversions,
    metrics.search_impression_share,
    ad_group_criterion.approval_status
            FROM keyword_view
            ${whereClause} ${dateFilter}
            ORDER BY metrics.impressions DESC
    `);

            // Fetch Ad-level URLs as fallback
            const adUrlQuery = `
SELECT
ad_group.id,
    ad_group_ad.ad.final_urls
                FROM ad_group_ad
WHERE
campaign.status = 'ENABLED'
                    AND ad_group.status = 'ENABLED'
                    AND ad_group_ad.status = 'ENABLED'
    `;
            const adUrlResults = await customer.query(adUrlQuery);
            const adGroupUrlMap = new Map<string, string>();
            for (const row of adUrlResults) {
                const agId = String(row.ad_group?.id);
                const url = row.ad_group_ad?.ad?.final_urls?.[0];
                if (url && !adGroupUrlMap.has(agId)) {
                    adGroupUrlMap.set(agId, url);
                }
            }

            const allKeywords = keywords.map((row) => ({
                id: row.ad_group_criterion?.criterion_id?.toString() || "",
                adGroupId: row.ad_group?.id?.toString() || "",
                text: row.ad_group_criterion?.keyword?.text || "",
                matchType: mapMatchType(row.ad_group_criterion?.keyword?.match_type),
                status: mapStatus(row.ad_group_criterion?.status),
                qualityScore: row.ad_group_criterion?.quality_info?.quality_score ?? null,
                expectedCtr: mapQSComponent(row.ad_group_criterion?.quality_info?.search_predicted_ctr),
                landingPageExperience: mapQSComponent(row.ad_group_criterion?.quality_info?.post_click_quality_score),
                adRelevance: mapQSComponent(row.ad_group_criterion?.quality_info?.creative_quality_score),
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost: Number(row.metrics?.cost_micros) / 1_000_000 || 0,
                conversions: Number(row.metrics?.conversions) || 0,
                conversionValue: Number(row.metrics?.conversions_value) || 0,
                cpc: Number(row.metrics?.average_cpc) / 1_000_000 || 0,
                biddingStrategyType: mapBiddingStrategyType(row.campaign?.bidding_strategy_type),
                campaignName: row.campaign?.name || "Unknown Campaign",
                adGroupName: row.ad_group?.name || "Unknown Ad Group",
                finalUrl: row.ad_group_criterion?.final_urls?.[0] || adGroupUrlMap.get(row.ad_group?.id?.toString() || "") || undefined,
                allConversions: Number(row.metrics?.all_conversions) || 0,
                viewThroughConversions: Number(row.metrics?.view_through_conversions) || 0,
                searchImpressionShare: row.metrics?.search_impression_share ?? null,
                searchLostISRank: row.metrics?.search_rank_lost_impression_share ?? null,
                searchLostISBudget: row.metrics?.search_budget_lost_impression_share ?? null,
                approvalStatus: String(row.ad_group_criterion?.approval_status || 'UNKNOWN'),
            }));

            // Deduplicate by criterion_id: keyword_view returns 1 row per day with date ranges.
            // Aggregate metrics across days for each unique keyword.
            const keywordMap = new Map<string, KeywordWithQS>();
            for (const k of allKeywords) {
                const existing = keywordMap.get(k.id);
                if (!existing) {
                    keywordMap.set(k.id, { ...k });
                } else {
                    existing.impressions += k.impressions;
                    existing.clicks += k.clicks;
                    existing.cost += k.cost;
                    existing.conversions += k.conversions;
                    existing.conversionValue += k.conversionValue;
                }
            }
            const validKeywords = Array.from(keywordMap.values());
            // Recalculate CPC after aggregation
            for (const k of validKeywords) {
                k.cpc = k.clicks > 0 ? k.cost / k.clicks : 0;
            }

            return validKeywords;
        } catch (error: unknown) {
            logApiError("API call", error);
            throw error;
        }
    });
}

export async function getAdsWithStrength(
    refreshToken: string,
    adGroupId?: string,
    customerId?: string,
    adGroupIds?: string[],

    dateRange?: DateRange,
    onlyEnabled: boolean = false
): Promise<AdWithStrength[]> {
    return withCache('ads', [adGroupId, customerId, adGroupIds, dateRange, onlyEnabled], async () => {
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
                    ad_group_ad.ad.demand_gen_multi_asset_ad.headlines,
                    ad_group_ad.ad.demand_gen_multi_asset_ad.descriptions,
                    ad_group_ad.ad.demand_gen_carousel_ad.headline,
                    ad_group_ad.ad.demand_gen_carousel_ad.description,
                    ad_group_ad.ad.demand_gen_video_responsive_ad.headlines,
                    ad_group_ad.ad.demand_gen_video_responsive_ad.descriptions,
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

            const allAds = ads.map((row) => {
                const rawStrength = String(row.ad_group_ad?.ad_strength);
                const rsa = row.ad_group_ad?.ad?.responsive_search_ad;
                const rda = row.ad_group_ad?.ad?.responsive_display_ad;
                // Cast to any because the type definitions might be missing these newer fields
                const dma = (row.ad_group_ad?.ad as any)?.demand_gen_multi_asset_ad;
                const dca = (row.ad_group_ad?.ad as any)?.demand_gen_carousel_ad;
                const dvra = (row.ad_group_ad?.ad as any)?.demand_gen_video_responsive_ad;
                const disma = (row.ad_group_ad?.ad as any)?.discovery_multi_asset_ad;
                const disca = (row.ad_group_ad?.ad as any)?.discovery_carousel_ad;

                let headlines: any[] = [];
                let descriptions: any[] = [];

                if (rsa) {
                    headlines = rsa.headlines || [];
                    descriptions = rsa.descriptions || [];
                } else if (rda) {
                    headlines = rda.headlines || [];
                    descriptions = rda.descriptions || [];
                } else if (dma) {
                    headlines = dma.headlines || [];
                    descriptions = dma.descriptions || [];
                } else if (dca) {
                    // Carousel ads have a single headline/description usually, wrapping in array
                    if (dca.headline) headlines = [dca.headline];
                    if (dca.description) descriptions = [dca.description];
                } else if (dvra) {
                    headlines = dvra.headlines || [];
                    descriptions = dvra.descriptions || [];
                } else if (disma) {
                    headlines = disma.headlines || [];
                    descriptions = disma.descriptions || [];
                } else if (disca) {
                    headlines = disca.headlines || [];
                    descriptions = disca.descriptions || [];
                } else if (row.ad_group_ad?.ad?.type === 10 || (row.ad_group_ad?.ad?.type as any) === 'SHOPPING_PRODUCT_AD') {
                    // Shopping Product Ad - content comes from feed
                    headlines = [{ text: "Shopping Product Ad" }];
                    descriptions = [{ text: "Auto-generated from product feed" }];
                }

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

            // Deduplicate by ad ID: ad_group_ad may return 1 row per day with date ranges.
            // Aggregate metrics across days for each unique ad.
            const adMap = new Map<string, AdWithStrength>();
            for (const a of allAds) {
                const existing = adMap.get(a.id);
                if (!existing) {
                    adMap.set(a.id, { ...a });
                } else {
                    existing.impressions += a.impressions;
                    existing.clicks += a.clicks;
                    existing.cost += a.cost;
                    existing.conversions += a.conversions;
                    existing.conversionValue += a.conversionValue;
                }
            }
            const dedupedAds = Array.from(adMap.values());
            // Recalculate derived metrics after aggregation
            for (const a of dedupedAds) {
                a.ctr = a.impressions > 0 ? a.clicks / a.impressions : 0;
                a.roas = a.cost > 0 ? a.conversionValue / a.cost : null;
            }

            return dedupedAds;
        } catch (error: unknown) {
            logApiError("API call", error);
            throw error;
        }
    });
}

export async function getAssetGroups(refreshToken: string, campaignId?: string, customerId?: string, dateRange?: DateRange, onlyEnabled: boolean = false, userId?: string): Promise<AdGroupPerformance[]> {
    if (userId) logActivity(userId, 'API_CALL', { category: 'assetGroups', customerId, campaignId });
    return withCache('assetGroups', [campaignId, customerId, dateRange, onlyEnabled], async () => {
        const customer = getGoogleAdsCustomer(refreshToken, customerId);
        const dateFilter = getDateFilter(dateRange);

        try {
            const statusClause = onlyEnabled
                ? "asset_group.status = 'ENABLED'"
                : "asset_group.status != 'REMOVED'";

            const campaignClause = campaignId
                ? "AND campaign.id = " + campaignId
                : '';

            const query = `
                SELECT
                    asset_group.id,
                    asset_group.name,
                    asset_group.status,
                    asset_group.ad_strength,
                    campaign.id,
                    campaign.name,
                    metrics.impressions,
                    metrics.clicks,
                    metrics.cost_micros,
                    metrics.conversions,
                    metrics.ctr,
                    metrics.average_cpc,
                    metrics.conversions_value
                FROM asset_group
                WHERE ${statusClause} ${campaignClause} ${dateFilter}
                ORDER BY 
                    metrics.impressions DESC,
                    metrics.clicks DESC,
                    metrics.cost_micros DESC,
                    asset_group.name ASC
            `;

            console.log(`[getAssetGroups] customerId = ${customerId}, campaignId = ${campaignId || 'ALL'} `);

            const assetGroups = await customer.query(query);

            console.log(`GAQL found ${assetGroups.length} asset groups`);

            return assetGroups.map((row) => {
                const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
                const conversions = Number(row.metrics?.conversions) || 0;
                const conversionValue = Number(row.metrics?.conversions_value) || 0;

                // Normalize status: Google Ads API may return proto enum number
                const ASSET_GROUP_STATUS_MAP: Record<string, string> = {
                    '2': 'ENABLED',
                    '3': 'PAUSED',
                    '4': 'REMOVED',
                    'ENABLED': 'ENABLED',
                    'PAUSED': 'PAUSED',
                    'REMOVED': 'REMOVED',
                };
                const rawStatus = String(row.asset_group?.status ?? 'UNKNOWN');
                const normalizedStatus = ASSET_GROUP_STATUS_MAP[rawStatus] ?? rawStatus;

                // Normalize ad_strength: proto enum number → readable string
                const ASSET_AD_STRENGTH_MAP: Record<string, string> = {
                    '0': 'UNSPECIFIED',
                    '1': 'UNKNOWN',
                    '2': 'POOR',
                    '3': 'AVERAGE',
                    '4': 'GOOD',
                    '5': 'EXCELLENT',
                    '6': 'PENDING',
                    '7': 'UNRATED',  // Too little traffic to evaluate
                    'POOR': 'POOR',
                    'AVERAGE': 'AVERAGE',
                    'GOOD': 'GOOD',
                    'EXCELLENT': 'EXCELLENT',
                    'PENDING': 'PENDING',
                    'UNRATED': 'UNRATED',
                };
                const rawStrength = String(row.asset_group?.ad_strength ?? 'UNKNOWN');
                const normalizedStrength = ASSET_AD_STRENGTH_MAP[rawStrength] ?? rawStrength;

                return {
                    id: row.asset_group?.id?.toString() || "",
                    campaignId: row.campaign?.id?.toString() || "",
                    campaignName: row.campaign?.name || "",
                    name: row.asset_group?.name || "",
                    status: normalizedStatus,
                    impressions: Number(row.metrics?.impressions) || 0,
                    clicks: Number(row.metrics?.clicks) || 0,
                    cost,
                    conversions,
                    ctr: Number(row.metrics?.ctr) || 0,
                    cpc: Number(row.metrics?.average_cpc) / 1_000_000 || 0,
                    avgQualityScore: null, // QS not applicable to Asset Groups in the same way
                    keywordsWithLowQS: 0,
                    adsCount: 0, // Asset Groups don't have "ads" in the standard sense
                    poorAdsCount: 0,
                    adStrength: normalizedStrength,
                    conversionValue,
                    roas: cost > 0 ? conversionValue / cost : null,
                    cpa: conversions > 0 ? cost / conversions : null,
                    adGroupType: 'ASSET_GROUP',
                    campaignType: 'PERFORMANCE_MAX',
                    searchImpressionShare: null,
                    searchLostISRank: null,
                    searchLostISBudget: null
                };
            });
        } catch (error: unknown) {
            logApiError("getAssetGroups", error);
            throw error;
        }
    });
}

// ─── Shopping: Listing Groups (Product Groups) ───────────────────────────────

import { ListingGroupItem } from "@/types/google-ads";

export async function getListingGroups(
    refreshToken: string,
    adGroupId: string,
    customerId?: string,
    dateRange?: DateRange
): Promise<ListingGroupItem[]> {
    return withCache('listingGroups', [adGroupId, customerId, dateRange], async () => {
        const customer = getGoogleAdsCustomer(refreshToken, customerId);
        const dateFilter = getDateFilter(dateRange);

        try {
            const query = `
                SELECT
                    ad_group_criterion.criterion_id,
                    ad_group_criterion.listing_group.type,
                    ad_group_criterion.listing_group.case_value.product_type.level,
                    ad_group_criterion.listing_group.case_value.product_type.value,
                    ad_group_criterion.listing_group.case_value.product_brand.value,
                    ad_group_criterion.listing_group.case_value.product_custom_attribute.index,
                    ad_group_criterion.listing_group.case_value.product_custom_attribute.value,
                    ad_group_criterion.listing_group.case_value.product_item_id.value,
                    ad_group.id,
                    ad_group.name,
                    campaign.id,
                    campaign.name,
                    metrics.impressions,
                    metrics.clicks,
                    metrics.cost_micros,
                    metrics.conversions,
                    metrics.conversions_value,
                    metrics.ctr,
                    metrics.average_cpc,
                    metrics.search_impression_share
                FROM listing_group_view
                WHERE ad_group.id = ${adGroupId}
                    AND ad_group_criterion.status != 'REMOVED'
                    ${dateFilter}
                ORDER BY metrics.cost_micros DESC
                LIMIT 500
            `;

            console.log(`[getListingGroups] adGroupId=${adGroupId}, customerId=${customerId}`);
            const rows = await customer.query(query);
            console.log(`[getListingGroups] Found ${rows.length} listing groups`);

            return rows.map((row): ListingGroupItem => {
                const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
                const conversions = Number(row.metrics?.conversions) || 0;
                const conversionValue = Number(row.metrics?.conversions_value) || 0;
                const caseVal = row.ad_group_criterion?.listing_group?.case_value;

                // Determine human-readable dimension label
                let dimension = 'All Products';
                let caseValue = '';
                if (caseVal?.product_type?.value) {
                    dimension = `Product Type (L${caseVal.product_type.level || 1})`;
                    caseValue = caseVal.product_type.value;
                } else if (caseVal?.product_brand?.value) {
                    dimension = 'Brand';
                    caseValue = caseVal.product_brand.value;
                } else if (caseVal?.product_custom_attribute?.value) {
                    dimension = `Custom Label ${caseVal.product_custom_attribute.index ?? ''}`.trim();
                    caseValue = caseVal.product_custom_attribute.value;
                } else if (caseVal?.product_item_id?.value) {
                    dimension = 'Item ID';
                    caseValue = caseVal.product_item_id.value;
                }

                const lgType = typeof row.ad_group_criterion?.listing_group?.type === 'string'
                    ? row.ad_group_criterion.listing_group.type
                    : String(row.ad_group_criterion?.listing_group?.type || 'UNIT');

                return {
                    id: row.ad_group_criterion?.criterion_id?.toString() || '',
                    adGroupId: row.ad_group?.id?.toString() || '',
                    adGroupName: row.ad_group?.name || '',
                    campaignId: row.campaign?.id?.toString() || '',
                    campaignName: row.campaign?.name || '',
                    dimension,
                    caseValue,
                    type: lgType,
                    impressions: Number(row.metrics?.impressions) || 0,
                    clicks: Number(row.metrics?.clicks) || 0,
                    cost,
                    conversions,
                    conversionValue,
                    ctr: Number(row.metrics?.ctr) || 0,
                    cpc: Number(row.metrics?.average_cpc) / 1_000_000 || 0,
                    roas: cost > 0 ? conversionValue / cost : null,
                    cpa: conversions > 0 ? cost / conversions : null,
                    searchImpressionShare: row.metrics?.search_impression_share ?? null,
                    searchLostISRank: null,
                    searchLostISBudget: null,
                };
            });
        } catch (error: unknown) {
            logApiError('getListingGroups', error);
            throw error;
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────

export async function getAssetGroupAssets(refreshToken: string, assetGroupId: string, customerId?: string): Promise<PMaxAsset[]> {
    return withCache('assets', ['assetGroup', assetGroupId, customerId], async () => {
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
    asset.image_asset.full_size.url,
    asset.youtube_video_asset.youtube_video_id
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
                    imageUrl: asset?.image_asset?.full_size?.url || undefined,
                    youtubeVideoId: asset?.youtube_video_asset?.youtube_video_id || undefined,
                };
            });
        } catch (error: unknown) {
            logApiError("getAssetGroupAssets", error);
            throw error;
        }
    });
}
export async function getCustomerAssets(refreshToken: string, customerId?: string, dateRange?: DateRange): Promise<AccountAsset[]> {
    return withCache('assets', ['customer', customerId, dateRange], async () => {
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
    });
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

// campaign_search_term_insight
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
    metrics.conversions_value,
    metrics.view_through_conversions
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
            const viewThroughConversions = Number(row.metrics?.view_through_conversions) || 0;

            return {
                campaignId: campaignId,
                campaignName: "", // Need to fetch if needed
                categoryName: insight?.category_label || "Unknown Category",
                term: insight?.id?.toString() || "",
                clicks,
                impressions,
                cost: 0, // Not available in this view
                conversions,
                conversionValue,
                viewThroughConversions,
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
    metrics.average_cpc,
    metrics.view_through_conversions
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
                viewThroughConversions: Number(row.metrics?.view_through_conversions) || 0,
                roas: cost > 0 ? conversionValue / cost : null,
                cpa: conversions > 0 ? cost / conversions : null,
                adGroupType: 'STANDARD',
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
    campaign.id,
    campaign.name,
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
            campaignId: row.campaign?.id?.toString() || "",
            campaignName: row.campaign?.name || "",
            conversionAction: row.segments?.conversion_action_name || "Unknown",
            conversionCategory: mapConversionCategory(row.segments?.conversion_action_category),
            actionCategory: mapConversionCategory(row.segments?.conversion_action_category), // Legacy compatibility / Lint fix
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

export async function getAuctionInsights(
    refreshToken: string,
    campaignId?: string,
    customerId?: string,
    dateRange?: DateRange
): Promise<AuctionInsight[]> {
    return withCache('diagnostics', [customerId, campaignId, dateRange, 'auctionInsights'], async () => {
        const customer = getGoogleAdsCustomer(refreshToken, customerId);

        // Ensure a date filter is always present (default to last 30 days)
        let dateFilter = getDateFilter(dateRange);
        if (!dateFilter) {
            dateFilter = " AND segments.date DURING LAST_30_DAYS";
        }

        const campaignFilter = campaignId ? `AND campaign.id = ${campaignId} ` : '';

        try {
            const result = await customer.query(`
SELECT
campaign.id,
    segments.auction_insight_domain,
    metrics.auction_insight_search_impression_share,
    metrics.auction_insight_search_overlap_rate,
    metrics.auction_insight_search_outranking_share,
    metrics.auction_insight_search_position_above_rate
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
                // Deprecated in API v22
            }));
        } catch (error: unknown) {
            logApiError("getAuctionInsights", error);
            return [];
        }
    });
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
    return withCache('diagnostics', [customerId, dateRange, campaignIds, 'dayOfWeek'], async () => {
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
    });
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
    viewThroughConversions?: number;
}

export async function getAccountDeviceStats(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange
): Promise<AccountDevicePerformance[]> {
    return withCache('diagnostics', [customerId, dateRange, 'deviceStats'], async () => {
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
                        cpa: null,
                        viewThroughConversions: 0
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
                aggregator[deviceName].viewThroughConversions = (aggregator[deviceName].viewThroughConversions || 0) + (Number(row.metrics?.view_through_conversions) || 0);
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
    });
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
    return withCache('diagnostics', [customerId, dateRange, campaignIds, 'hourOfDay'], async () => {
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
    });
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
    viewThroughConversions?: number;
    speedScore: number | null;
    landingPageExperience: string | null;
}

export async function getLandingPagePerformance(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange,
    campaignIds?: string[],
    userId?: string
): Promise<LandingPagePerformance[]> {
    return withCache('diagnostics', [customerId, dateRange, campaignIds, 'landingPage'], async () => {
        if (userId) logActivity(userId, 'API_CALL', { category: 'landingPages', customerId });
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

            console.log(`[GoogleAds / LandingPages] Found ${result.length} rows`);

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
                    viewThroughConversions: Number(row.metrics?.view_through_conversions) || 0,
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
    });
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

    console.log(`[GoogleAds / QualityScores] Mapped ${Object.keys(finalMapping).length} URLs with quality data`);
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

        console.log(`[GoogleAds / MobilePercentages] Calculated mobile % for ${Object.keys(mobilePercentages).length} URLs`);
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
    return withCache('diagnostics', [customerId, dateRange, 'geographic'], async () => {
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
    });
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
    return withCache('diagnostics', [customerId, dateRange, 'regional'], async () => {
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
            console.log(`[GoogleAds] Sample row segments: `, JSON.stringify(sample.segments));
            console.log(`[GoogleAds] Sample row keys: `, Object.keys(sample));
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

        console.log(`[GoogleAds] Unique location IDs found: ${locationIds.size} `);

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
                    WHERE geo_target_constant.id IN(${idList})
                `);
                    geoResult.forEach((geoRow: any) => {
                        const id = geoRow.geo_target_constant?.id?.toString();
                        if (id) {
                            const rawType = geoRow.geo_target_constant?.target_type;
                            locationNames[id] = {
                                name: geoRow.geo_target_constant?.name || `Location ${id} `,
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
                    locationName: locInfo?.canonicalName || locInfo?.name || `Location ${locationId} `,
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
    return withCache('search', [customerId, dateRange], async () => {
        try {
            console.log(`\n ========== 🔍 SEARCH TERMS START ==========`);
            console.log(`Customer: ${customerId} `);
            console.log(`Date Range: `, dateRange);

            const customer = getGoogleAdsCustomer(refreshToken, customerId);
            // Fix: getDateFilter returns " AND segments.date...", which is invalid as first WHERE condition
            // We strip the leading " AND" to make it valid
            const rawDateFilter = getDateFilter(dateRange);
            const dateFilter = rawDateFilter.trim().replace(/^AND\s+/, '');

            // Use fields known to work from the API route
            const query = `
SELECT
    search_term_view.search_term,
    segments.search_term_match_type,
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
                metrics.impressions DESC,
                metrics.clicks DESC,
                metrics.cost_micros DESC,
                search_term_view.search_term ASC
        `;

            const rows = await customer.query(query);
            console.log(`✅ SUCCESS: Got ${rows.length} rows`);
            console.log(`========== 🔍 SEARCH TERMS END ==========\n`);

            return rows.map((row: any) => {
                const impressions = Number(row.metrics?.impressions) || 0;
                const clicks = Number(row.metrics?.clicks) || 0;
                const cost = Number(row.metrics?.cost_micros) / 1000000 || 0;

                const conversions = Number(row.metrics?.conversions) || 0;
                // segments.search_term_match_type returns numeric enum or string
                const matchTypeRaw = row.segments?.search_term_match_type;
                const MATCH_TYPE_MAP: Record<string, string> = {
                    '2': 'BROAD', 'BROAD': 'BROAD',
                    '3': 'EXACT', 'EXACT': 'EXACT',
                    '4': 'PHRASE', 'PHRASE': 'PHRASE',
                    '5': 'NEAR_EXACT', 'NEAR_EXACT': 'NEAR_EXACT',
                    '6': 'NEAR_PHRASE', 'NEAR_PHRASE': 'NEAR_PHRASE',
                };
                return {
                    term: row.search_term_view?.search_term,
                    matchType: MATCH_TYPE_MAP[String(matchTypeRaw)] || null,
                    status: 'UNKNOWN', // Removed from query
                    impressions,
                    clicks,
                    cost,
                    conversions,
                    conversionValue: Number(row.metrics?.conversions_value) || 0,
                    ctr: impressions > 0 ? clicks / impressions : 0,
                    averageCpc: clicks > 0 ? cost / clicks : 0,
                    conversionRate: clicks > 0 ? conversions / clicks : 0,
                };
            });
        } catch (error) {
            console.error(`\n❌ SEARCH TERMS FAILED: `, error);
            console.log(`========== 🔍 SEARCH TERMS END ==========\n`);
            logApiError("getSearchTerms", error);
            return [];
        }
    });
}

// ============================================
// PRIORITY 4: Audience Performance
// ============================================

/**
 * Helper to resolve audience names from various signal types.
 * @param interestNames - Map of user_interest criterion_id → human-readable name
 */
function resolveAudienceName(row: any, interestNames: Record<string, string> = {}): string {
    const criterion = row.ad_group_criterion || row.campaign_criterion;

    // If it's a PMax signal, use the audience name from the attributed resource
    if (row.audience?.name) return row.audience.name;

    if (!criterion) return 'Unknown Audience';

    if (criterion.keyword?.text) return criterion.keyword.text;

    // Fallback names for various types
    const type = criterion.type || 'UNKNOWN';
    const criterionId = String(criterion.criterion_id || '');

    // Check user_list resource name in the names map (remarketing audiences)
    const userListRef = criterion.user_list?.user_list;
    if (userListRef && interestNames[userListRef]) return interestNames[userListRef];

    const resourceName = userListRef ||
        criterion.custom_audience?.custom_audience ||
        criterion.combined_audience?.combined_audience ||
        criterion.display_name;

    if (resourceName) {
        const lastSegment = resourceName.split('/').pop() || '';
        if (lastSegment.startsWith('uservertical::')) {
            const interestId = lastSegment.replace('uservertical::', '');
            if (interestNames[interestId]) return interestNames[interestId];
            return `Interest (${interestId})`;
        }
        // Check the bare ID/segment in the names map
        if (interestNames[lastSegment]) return interestNames[lastSegment];
        return lastSegment || 'Unknown';
    }

    // Check names map by criterion_id as fallback
    if (interestNames[criterionId]) return interestNames[criterionId];

    return `${type} (${criterionId || 'unknown'})`;
}

// Audience Performance Data
export async function getAudiencePerformance(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange,
    campaignIds?: string[],
    userId?: string,
    adGroupId?: string
): Promise<AudiencePerformance[]> {
    if (userId) logActivity(userId, 'API_CALL', { category: 'audiences', customerId });
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);
    const campaignFilter = campaignIds?.length
        ? `AND campaign.id IN(${campaignIds.join(',')})` : '';
    const adGroupFilter = adGroupId ? `AND ad_group.id = ${adGroupId}` : '';

    try {
        // Query Ad Group and Campaign audiences in parallel
        const [adGroupResults, campaignResults] = await Promise.all([
            customer.query(`
                SELECT
                    campaign.id,
                    campaign.name,
                    ad_group.id,
                    ad_group.name,
                    ad_group_criterion.criterion_id,
                    ad_group_criterion.type,
                    ad_group_criterion.keyword.text,
                    ad_group_criterion.user_list.user_list,
                    ad_group_criterion.display_name,
                    metrics.impressions,
                    metrics.clicks,
                    metrics.cost_micros,
                    metrics.conversions,
                    metrics.conversions_value,
                    metrics.average_cpc,
                    metrics.ctr
                FROM ad_group_audience_view
                WHERE campaign.status != 'REMOVED'
                AND ad_group.status != 'REMOVED'
                ${dateFilter}
                AND metrics.impressions > 0
                ${campaignFilter}
                ${adGroupFilter}
                LIMIT 1000
            `).catch(e => { console.error("AdGroup query failed:", e); return []; }),
            customer.query(`
                SELECT
                    campaign.id,
                    campaign.name,
                    campaign_criterion.criterion_id,
                    campaign_criterion.type,
                    campaign_criterion.user_list.user_list,
                    campaign_criterion.display_name,
                    metrics.impressions,
                    metrics.clicks,
                    metrics.cost_micros,
                    metrics.conversions,
                    metrics.conversions_value,
                    metrics.average_cpc,
                    metrics.ctr
                FROM campaign_audience_view
                WHERE campaign.status != 'REMOVED'
                ${dateFilter}
                AND metrics.impressions > 0
                ${campaignFilter}
                LIMIT 1000
            `).catch(e => { console.error("Campaign query failed:", e); return []; })
        ]);

        // Batch-resolve audience names (user_interest + user_list)
        const interestIds = new Set<string>();
        const userListResourceNames = new Set<string>();
        const allRows = [...adGroupResults, ...campaignResults];

        allRows.forEach((row: any) => {
            const criterion = row.ad_group_criterion || row.campaign_criterion;
            if (!criterion) return;
            const displayName = criterion.display_name || '';
            const lastSegment = displayName.split('/').pop() || '';
            if (lastSegment.startsWith('uservertical::')) {
                interestIds.add(lastSegment.replace('uservertical::', ''));
            } else if ((criterion.type === 'USER_INTEREST' || criterion.type === 2) && criterion.criterion_id) {
                interestIds.add(String(criterion.criterion_id));
            }
            // Collect user_list resource names for remarketing audiences
            const userListRef = criterion.user_list?.user_list;
            if (userListRef) userListResourceNames.add(userListRef);
        });

        const interestNames: Record<string, string> = {};

        // 1) Resolve user_interest names
        if (interestIds.size > 0) {
            try {
                const idList = Array.from(interestIds).join(',');
                const interestRows = await customer.query(`
                    SELECT user_interest.user_interest_id, user_interest.name
                    FROM user_interest
                    WHERE user_interest.user_interest_id IN (${idList})
                `);
                interestRows.forEach((r: any) => {
                    const id = String(r.user_interest?.user_interest_id || '');
                    const name = r.user_interest?.name || '';
                    if (id && name) interestNames[id] = name;
                });
            } catch (e) {
                console.error('[Audiences] user_interest lookup failed:', e);
            }
        }

        // 2) Resolve user_list names (remarketing audiences)
        // user_list resource names look like: "customers/123/userLists/456"
        // We map the full resource name → display name, and also the last segment (ID) → display name
        if (userListResourceNames.size > 0) {
            try {
                const resourceList = Array.from(userListResourceNames)
                    .map(r => `'${r}'`).join(',');
                const listRows = await customer.query(`
                    SELECT user_list.resource_name, user_list.name, user_list.id
                    FROM user_list
                    WHERE user_list.resource_name IN (${resourceList})
                `);
                listRows.forEach((r: any) => {
                    const resName = r.user_list?.resource_name || '';
                    const name = r.user_list?.name || '';
                    const id = String(r.user_list?.id || '');
                    // Map both the full resource name and the bare ID
                    if (resName && name) interestNames[resName] = name;
                    if (id && name) interestNames[id] = name;
                });
            } catch (e) {
                console.error('[Audiences] user_list lookup failed:', e);
            }
        }

        const processRows = (rows: any[], level: 'adgroup' | 'campaign') => {
            return rows.map((row) => {
                const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
                const conversions = Number(row.metrics?.conversions) || 0;
                const conversionValue = Number(row.metrics?.conversions_value) || 0;
                const clicks = Number(row.metrics?.clicks) || 0;
                const impressions = Number(row.metrics?.impressions) || 0;

                let audienceName = resolveAudienceName(row, interestNames);

                // Determine audience type label
                const criterion = row.ad_group_criterion || row.campaign_criterion;
                const cType = criterion?.type;
                const AUDIENCE_TYPE_MAP: Record<string | number, string> = {
                    'USER_INTEREST': 'Interest', 24: 'Interest',
                    'USER_LIST': 'Remarketing', 22: 'Remarketing',
                    'CUSTOM_AUDIENCE': 'Custom', 36: 'Custom',
                    'COMBINED_AUDIENCE': 'Combined', 29: 'Combined',
                };
                const audienceType = AUDIENCE_TYPE_MAP[cType] || (criterion?.display_name?.includes('uservertical') ? 'Interest' : 'Other');

                return {
                    campaignId: row.campaign?.id?.toString() || "",
                    campaignName: row.campaign?.name || "",
                    adGroupId: level === 'adgroup' ? (row.ad_group?.id?.toString() || "") : "CAMPAIGN_LEVEL",
                    adGroupName: level === 'adgroup' ? (row.ad_group?.name || "") : "All Ad Groups",
                    criterionId: (row.ad_group_criterion?.criterion_id || row.campaign_criterion?.criterion_id || row.audience?.id || "").toString(),
                    audienceName,
                    audienceType,
                    impressions,
                    clicks,
                    cost,
                    conversions,
                    conversionValue,
                    ctr: Number(row.metrics?.ctr) || 0,
                    cpc: Number(row.metrics?.average_cpc) / 1_000_000 || 0,
                    roas: cost > 0 ? conversionValue / cost : null,
                    cpa: conversions > 0 ? cost / conversions : null,
                    searchImpressionShare: row.metrics?.search_impression_share ?? null,
                    searchLostISRank: null,
                    searchLostISBudget: null,
                };
            });
        };

        const allPerformances = [
            ...processRows(adGroupResults, 'adgroup'),
            ...processRows(campaignResults, 'campaign')
        ];

        // Unique audiences by name and ID to avoid duplicates from different levels if they exist
        // But usually, they are distinct. Let's just sort.
        return allPerformances.sort((a, b) => b.cost - a.cost || b.impressions - a.impressions);

    } catch (error: unknown) {
        logApiError("getAudiencePerformance", error);
        return [];
    }
}

export async function runAdsRawQuery(refreshToken: string, customerId: string, query: string): Promise<any[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    try {
        return await customer.query(query);
    } catch (error) {
        logApiError("Raw API query", error);
        throw error;
    }
}

export async function getAccountAuctionInsights(
    refreshToken: string,
    customerId: string,
    dateRange: { start: string; end: string },
    campaignIds?: string[]
) {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);

    // Cache key
    const cacheKey = `account_auction_insights:${customerId}:${dateRange.start}:${dateRange.end}:${campaignIds ? campaignIds.join(',') : 'all'} `;
    const cached = apiCache.get(cacheKey);
    // @ts-ignore
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    try {
        // Construct query
        let query = `
SELECT
segments.auction_insight_domain,
    metrics.auction_insight_search_impression_share,
    metrics.auction_insight_search_overlap_rate,
    metrics.auction_insight_search_outranking_share,
    metrics.auction_insight_search_position_above_rate,
    metrics.auction_insight_search_absolute_top_impression_percentage,
    metrics.auction_insight_search_top_impression_percentage
      FROM auction_insight_domain_view
      WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
    `;

        if (campaignIds && campaignIds.length > 0) {
            query += ` AND campaign.id IN(${campaignIds.join(',')})`;
        }

        // Execute query
        const result = await customer.query(query);

        // Aggregate data by domain
        const domainStats = new Map<string, {
            domain: string;
            impressionShare: number;
            overlapRate: number;
            outrankingShare: number;
            positionAboveRate: number;
            absTopRate: number;
            topRate: number;
            count: number;
        }>();

        for (const row of result) {
            const domain = row.segments?.auction_insight_domain || 'Unknown';

            const stats = domainStats.get(domain) || {
                domain,
                impressionShare: 0,
                overlapRate: 0,
                outrankingShare: 0,
                positionAboveRate: 0,
                absTopRate: 0,
                topRate: 0,
                count: 0
            };

            // Helper to safely parse metrics
            const parseMetric = (val: any) => typeof val === 'number' ? val : 0;

            stats.impressionShare += parseMetric(row.metrics?.auction_insight_search_impression_share);
            stats.overlapRate += parseMetric(row.metrics?.auction_insight_search_overlap_rate);
            stats.outrankingShare += parseMetric(row.metrics?.auction_insight_search_outranking_share);
            stats.positionAboveRate += parseMetric(row.metrics?.auction_insight_search_position_above_rate);
            stats.absTopRate += parseMetric(row.metrics?.auction_insight_search_absolute_top_impression_percentage);
            stats.topRate += parseMetric(row.metrics?.auction_insight_search_top_impression_percentage);
            stats.count++;

            domainStats.set(domain, stats);
        }

        // Average out the stats
        const processedData = Array.from(domainStats.values()).map(stat => ({
            domain: stat.domain,
            impressionShare: stat.count > 0 ? stat.impressionShare / stat.count : 0,
            overlapRate: stat.count > 0 ? stat.overlapRate / stat.count : 0,
            outrankingShare: stat.count > 0 ? stat.outrankingShare / stat.count : 0,
            positionAboveRate: stat.count > 0 ? stat.positionAboveRate / stat.count : 0,
            absTopRate: stat.count > 0 ? stat.absTopRate / stat.count : 0,
            topRate: stat.count > 0 ? stat.topRate / stat.count : 0
        })).sort((a, b) => b.impressionShare - a.impressionShare);

        // Update cache
        apiCache.set(cacheKey, { data: processedData, expiresAt: Date.now() + CACHE_TTL.default });

        return processedData;

    } catch (error) {
        console.error("Error fetching Auction Insights:", error);
        throw error;
    }
}

// ============================================
// PRIORITY 5: Asset Performance (Sitelinks, Callouts, etc.)
// ============================================

export async function getAssetPerformance(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange,
    campaignIds?: string[]
): Promise<AssetPerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);
    const campaignFilter = campaignIds?.length
        ? `AND campaign.id IN(${campaignIds.join(',')})` : '';

    try {
        // Query for asset_group_asset (PMax) and ad_group_ad_asset_view (Search/Display)
        // For simplicity, we'll focus on ad_group_ad_asset_view first as it covers extensions
        const query = `
SELECT
    asset.id,
    asset.name,
    asset.type,
    asset.youtube_video_asset.youtube_video_id,
    asset.text_asset.text,
    asset.final_urls,
    ad_group_ad_asset_view.field_type,
    ad_group_ad_asset_view.performance_label,
    ad_group_ad_asset_view.enabled,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.ctr,
    metrics.conversions,
    metrics.conversions_value
            FROM ad_group_ad_asset_view
            WHERE ad_group_ad_asset_view.enabled = TRUE
            ${dateFilter} ${campaignFilter}
            AND metrics.impressions > 0
            ORDER BY metrics.impressions DESC
            LIMIT 1000
    `;

        const result = await customer.query(query);

        return result.map((row) => ({
            id: row.asset?.id?.toString() || "",
            type: String(row.asset?.type || 'UNKNOWN'),
            assetType: String(row.asset?.type || 'UNKNOWN'),
            fieldType: String(row.ad_group_ad_asset_view?.field_type || ''),
            name: row.asset?.name || "",
            imageUrl: (row.asset?.image_asset?.full_size as any)?.url || "",
            youtubeVideoId: row.asset?.youtube_video_asset?.youtube_video_id || "",
            text: row.asset?.text_asset?.text || "",
            finalUrls: row.asset?.final_urls || [],
            performanceLabel: String(row.ad_group_ad_asset_view?.performance_label || 'UNKNOWN'),
            approvalStatus: 'ENABLED',
            policySummary: [],
            impressions: Number(row.metrics?.impressions) || 0,
            clicks: Number(row.metrics?.clicks) || 0,
            cost: Number(row.metrics?.cost_micros) / 1_000_000 || 0,
            ctr: Number(row.metrics?.ctr) || 0,
            conversions: Number(row.metrics?.conversions) || 0,
            conversionValue: Number(row.metrics?.conversions_value) || 0,
        }));
    } catch (error: unknown) {
        logApiError("getAssetPerformance", error);
        return [];
    }
}

// ============================================
// PRIORITY 6: Change History
// ============================================

export async function getChangeHistory(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange,
    limit: number = 1000
): Promise<ChangeEvent[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);

    // If no date range provided, default to last 28 days to stay safely within 30-day limit
    const range = dateRange || {
        start: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    };

    // Enforce 30-day limit for change_event resource
    const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const startDate = new Date(range.start);
    const finalStart = startDate < thirtyDaysAgo ? thirtyDaysAgo.toISOString().split('T')[0] : range.start;

    const dateQuery = `WHERE change_event.change_date_time >= '${finalStart}' AND change_event.change_date_time <= '${range.end}'`;

    try {
        const query = `
SELECT
    change_event.change_date_time,
    change_event.change_resource_type,
    change_event.change_resource_name,
    change_event.client_type,
    change_event.user_email,
    change_event.old_resource,
    change_event.new_resource,
    change_event.campaign,
    change_event.ad_group
FROM change_event
${dateQuery}
ORDER BY change_event.change_date_time DESC
LIMIT ${limit}
    `;

        const result = await customer.query(query);

        return result.map((row) => {
            const resourceType = String(row.change_event?.change_resource_type || "UNKNOWN");
            let resourceName = row.change_event?.campaign || row.change_event?.ad_group || "Account Level";

            // If it's a specific resource type and we have the resource name, use its last part
            if (resourceName === "Account Level" && row.change_event?.change_resource_name) {
                const parts = row.change_event.change_resource_name.split('/');
                resourceName = `${resourceType}: ${parts[parts.length - 1]}`;
            }

            return {
                id: row.change_event?.change_resource_name || "",
                changeDateTime: row.change_event?.change_date_time || "",
                changeResourceType: resourceType,
                changeResourceName: row.change_event?.change_resource_name || "",
                clientType: String(row.change_event?.client_type || "UNKNOWN"),
                userEmail: row.change_event?.user_email || "",
                oldResource: row.change_event?.old_resource ? JSON.stringify(row.change_event.old_resource) : undefined,
                newResource: row.change_event?.new_resource ? JSON.stringify(row.change_event.new_resource) : undefined,
                resourceName,
            };
        });
    } catch (error: unknown) {
        logApiError("getChangeHistory", error);
        return [];
    }
}


// ============================================
// PRIORITY 7: Conversion Actions Diagnostics
// ============================================

export async function getConversionActionsList(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange
): Promise<ConversionActionBreakdown[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    try {
        const query = `
SELECT
    campaign.id,
    campaign.name,
    segments.conversion_action,
    segments.conversion_action_name,
    segments.conversion_action_category,
    metrics.all_conversions,
    metrics.view_through_conversions,
    metrics.all_conversions_value
FROM campaign
WHERE campaign.status != 'REMOVED'
${dateFilter}
AND metrics.all_conversions > 0
`;

        const result = await customer.query(query);

        return result.map((row) => ({
            campaignId: row.campaign?.id?.toString() || "",
            campaignName: row.campaign?.name || "",
            conversionAction: row.segments?.conversion_action_name || row.segments?.conversion_action || "Unknown",
            conversionCategory: mapConversionCategory(row.segments?.conversion_action_category),
            conversions: Number(row.metrics?.all_conversions) || 0,
            conversionValue: Number(row.metrics?.all_conversions_value) || 0,
            allConversions: Number(row.metrics?.all_conversions) || 0,
            allConversionValue: Number(row.metrics?.all_conversions_value) || 0,
        }));
    } catch (error: unknown) {
        logApiError("getConversionActionsList", error);
        return [];
    }
}

export async function getConversionActionsAccount(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange
): Promise<ConversionAction[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    try {
        const query = `
SELECT
    conversion_action.id,
    conversion_action.name,
    conversion_action.status,
    conversion_action.type,
    conversion_action.category,
    conversion_action.owner_customer,
    conversion_action.include_in_conversions_metric,
    metrics.all_conversions,
    metrics.all_conversions_value
FROM conversion_action
WHERE conversion_action.status != 'REMOVED'
${dateFilter}
        `;

        const result = await customer.query(query);

        return result.map((row) => ({
            id: row.conversion_action?.id?.toString() || "",
            name: row.conversion_action?.name || "",
            status: mapStatus(row.conversion_action?.status as any),
            type: String(row.conversion_action?.type || ""),
            conversionCategory: mapConversionCategory(row.conversion_action?.category),
            ownerCustomer: row.conversion_action?.owner_customer || "",
            includeInConversionsMetric: !!row.conversion_action?.include_in_conversions_metric,
            allConversions: Number(row.metrics?.all_conversions) || 0,
            viewThroughConversions: 0, // Not available at account level query without segmentation
            value: Number(row.metrics?.all_conversions_value) || 0,
        }));

    } catch (error: unknown) {
        logApiError("getConversionActionsAccount", error);
        return [];
    }
}


// ============================================
// PRIORITY 8: Shopping/PMax Product Performance
// ============================================




export async function getPMaxProductPerformance(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange
): Promise<PMaxProductPerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    try {
        const query = `
SELECT
    segments.product_merchant_id,
    segments.product_channel,
    segments.product_feed_label,
    segments.product_item_id,
    segments.product_title,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions,
    metrics.conversions_value
            FROM shopping_product_view
            WHERE metrics.impressions > 0
            ${dateFilter}
            ORDER BY metrics.cost_micros DESC
            LIMIT 500
    `;

        const result = await customer.query(query);

        return result.map((row: any) => {
            const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            const conversions = Number(row.metrics?.conversions) || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;

            return {
                id: row.shopping_product_view?.resource_name || "",
                merchantCenterId: Number(row.segments?.product_merchant_id) || 0,
                channel: String(row.segments?.product_channel || "UNKNOWN"),
                languageCode: row.segments?.product_language_code || "",
                feedLabel: row.segments?.product_feed_label || "",
                itemId: row.segments?.product_item_id || "",
                title: row.segments?.product_title || "",
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost,
                conversions,
                conversionValue,
                roas: cost > 0 ? conversionValue / cost : null,
            };
        });
    } catch (error: unknown) {
        logApiError("getPMaxProductPerformance", error);
        return [];
    }
}

export async function getNetworkPerformance(
    refreshToken: string,
    customerId?: string,
    dateRange?: DateRange,
    campaignIds?: string[],
    userId?: string
): Promise<NetworkPerformance[]> {
    if (userId) logActivity(userId, 'API_CALL', { category: 'network_performance', customerId });
    return withCache('default', [customerId, dateRange, campaignIds, 'network'], async () => {
        const customer = getGoogleAdsCustomer(refreshToken, customerId);
        const dateFilter = getDateFilter(dateRange);

        let campaignFilter = '';
        if (campaignIds && campaignIds.length > 0) {
            const ids = campaignIds.map(id => `'${id}'`).join(',');
            campaignFilter = `AND campaign.id IN (${ids})`;
        }

        try {
            const query = `
                SELECT
                    campaign.id,
                    campaign.name,
                    segments.ad_network_type,
                    metrics.impressions,
                    metrics.clicks,
                    metrics.cost_micros,
                    metrics.conversions,
                    metrics.conversions_value
                FROM campaign
                WHERE campaign.status != 'REMOVED'
                ${dateFilter} ${campaignFilter}
                AND metrics.impressions > 0
                ORDER BY metrics.cost_micros DESC
            `;

            const result = await customer.query(query);

            return result.map((row) => {
                const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
                const conversions = Number(row.metrics?.conversions) || 0;
                const conversionValue = Number(row.metrics?.conversions_value) || 0;

                return {
                    campaignId: row.campaign?.id?.toString() || "",
                    campaignName: row.campaign?.name || "",
                    adNetworkType: String(row.segments?.ad_network_type || 'UNKNOWN'),
                    impressions: Number(row.metrics?.impressions) || 0,
                    clicks: Number(row.metrics?.clicks) || 0,
                    cost,
                    conversions,
                    conversionValue,
                };
            });
        } catch (error: unknown) {
            logApiError("getNetworkPerformance", error);
            // Return empty array on error to safely degrade
            return [];
        }
    });
}

// Placements Performance (for DG/Display)
export async function getPlacementsPerformance(
    refreshToken: string,
    customerId: string,
    dateRange?: DateRange,
    campaignId?: string,
    adGroupId?: string
): Promise<PlacementPerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);
    let filter = dateFilter;
    if (campaignId) filter += ` AND campaign.id = ${campaignId}`;
    if (adGroupId) filter += ` AND ad_group.id = ${adGroupId}`;

    try {
        const query = `
            SELECT
                detail_placement_view.placement,
                detail_placement_view.display_name,
                detail_placement_view.placement_type,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value,
                metrics.ctr,
                metrics.view_through_conversions
            FROM detail_placement_view
            WHERE detail_placement_view.placement IS NOT NULL
            ${filter}
            AND metrics.impressions > 0
            ORDER BY metrics.cost_micros DESC
            LIMIT 1000
        `;

        const result = await customer.query(query);

        return result.map((row: any) => ({
            placement: row.detail_placement_view?.placement || "",
            description: row.detail_placement_view?.display_name || "",
            type: String(row.detail_placement_view?.placement_type || 'UNKNOWN'),
            impressions: Number(row.metrics?.impressions) || 0,
            clicks: Number(row.metrics?.clicks) || 0,
            cost: Number(row.metrics?.cost_micros) / 1_000_000 || 0,
            conversions: Number(row.metrics?.conversions) || 0,
            conversionValue: Number(row.metrics?.conversions_value) || 0,
            ctr: Number(row.metrics?.ctr) || 0,
            viewThroughConversions: Number(row.metrics?.view_through_conversions) || 0,
        }));
    } catch (error: unknown) {
        logApiError("getPlacementsPerformance", error);
        return [];
    }
}

// Demographics Performance
export async function getDemographicsPerformance(
    refreshToken: string,
    customerId: string,
    dateRange?: DateRange,
    campaignId?: string,
    adGroupId?: string
): Promise<DemographicPerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);
    let filter = dateFilter;
    if (campaignId) filter += ` AND campaign.id = ${campaignId}`;
    if (adGroupId) filter += ` AND ad_group.id = ${adGroupId}`;

    try {
        const [ageResult, genderResult, parentalResult, incomeResult] = await Promise.allSettled([
            customer.query(`
                SELECT age_range_view.resource_name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.ctr, metrics.view_through_conversions
                FROM age_range_view WHERE metrics.impressions > 0 ${filter}
            `),
            customer.query(`
                SELECT gender_view.resource_name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.ctr, metrics.view_through_conversions
                FROM gender_view WHERE metrics.impressions > 0 ${filter}
            `),
            customer.query(`
                SELECT parental_status_view.resource_name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.ctr, metrics.view_through_conversions
                FROM parental_status_view WHERE metrics.impressions > 0 ${filter}
            `),
            customer.query(`
                SELECT income_range_view.resource_name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.ctr, metrics.view_through_conversions
                FROM income_range_view WHERE metrics.impressions > 0 ${filter}
            `)
        ]);

        const ageRows = ageResult.status === 'fulfilled' ? ageResult.value : [];
        const genderRows = genderResult.status === 'fulfilled' ? genderResult.value : [];
        const parentalRows = parentalResult.status === 'fulfilled' ? parentalResult.value : [];
        const incomeRows = incomeResult.status === 'fulfilled' ? incomeResult.value : [];
        if (ageResult.status === 'rejected') logApiError('getDemographicsPerformance:age', ageResult.reason);
        if (genderResult.status === 'rejected') logApiError('getDemographicsPerformance:gender', genderResult.reason);
        if (parentalResult.status === 'rejected') logApiError('getDemographicsPerformance:parental', parentalResult.reason);
        if (incomeResult.status === 'rejected') logApiError('getDemographicsPerformance:income', incomeResult.reason);

        const processRow = (row: any, type: 'AGE' | 'GENDER' | 'PARENTAL_STATUS' | 'INCOME'): DemographicPerformance => {
            const resourceName =
                row.age_range_view?.resource_name ||
                row.gender_view?.resource_name ||
                row.parental_status_view?.resource_name ||
                row.income_range_view?.resource_name || "";
            const rawId = resourceName.split('~').pop() || "";

            let dimension = "Unknown";
            if (type === 'AGE') {
                const AGE_MAP: Record<string, string> = {
                    "503001": "18-24", "503002": "25-34", "503003": "35-44",
                    "503004": "45-54", "503005": "55-64", "503006": "65+", "503000": "Unknown",
                    "503999": "Undetermined"
                };
                dimension = AGE_MAP[rawId] || rawId;
            } else if (type === 'GENDER') {
                const GENDER_MAP: Record<string, string> = {
                    "10": "Male", "11": "Female", "20": "Unknown"
                };
                dimension = GENDER_MAP[rawId] || rawId;
            } else if (type === 'PARENTAL_STATUS') {
                const PARENTAL_MAP: Record<string, string> = {
                    "300": "Parent", "301": "Not a parent", "302": "Unknown"
                };
                dimension = PARENTAL_MAP[rawId] || rawId;
            } else if (type === 'INCOME') {
                const INCOME_MAP: Record<string, string> = {
                    "510001": "Top 10%", "510002": "11-20%", "510003": "21-30%",
                    "510004": "31-40%", "510005": "41-50%", "510006": "Lower 50%",
                    "510000": "Unknown"
                };
                dimension = INCOME_MAP[rawId] || rawId;
            }

            const metrics = row.metrics || {};
            const cost = (Number(metrics.cost_micros) || 0) / 1_000_000;
            const convVal = Number(metrics.conversions_value || metrics.conversionsValue) || 0;

            return {
                type,
                dimension: dimension || "Unknown",
                impressions: Number(metrics.impressions) || 0,
                clicks: Number(metrics.clicks) || 0,
                cost,
                conversions: Number(metrics.conversions) || 0,
                conversionValue: convVal,
                ctr: Number(metrics.ctr) || 0,
                viewThroughConversions: Number(metrics.view_through_conversions || metrics.viewThroughConversions) || 0,
            };
        };

        return [
            ...ageRows.map(r => processRow(r, 'AGE')),
            ...genderRows.map(r => processRow(r, 'GENDER')),
            ...parentalRows.map(r => processRow(r, 'PARENTAL_STATUS')),
            ...incomeRows.map(r => processRow(r, 'INCOME'))
        ].sort((a, b) => b.cost - a.cost);
    } catch (error) {
        logApiError("getDemographicsPerformance", error);
        return [];
    }
}

// Time Analysis Performance
export async function getTimeAnalysisPerformance(
    refreshToken: string,
    customerId: string,
    dateRange?: DateRange,
    campaignId?: string,
    adGroupId?: string
): Promise<TimeAnalysisPerformance[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);
    let filter = dateFilter;
    if (campaignId) filter += ` AND campaign.id = ${campaignId}`;
    if (adGroupId) filter += ` AND ad_group.id = ${adGroupId}`;

    try {
        const query = `
            SELECT
                segments.day_of_week,
                segments.hour_of_day,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value
            FROM ad_group
            WHERE metrics.impressions > 0
            ${filter}
        `;

        const result = await customer.query(query);

        return result.map((row: any) => {
            const cost = Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            const conversionValue = Number(row.metrics?.conversions_value) || 0;
            return {
                period: `${row.segments?.day_of_week || 'Unknown'} ${row.segments?.hour_of_day || '0'}:00`,
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost,
                conversions: Number(row.metrics?.conversions) || 0,
                conversionValue,
                roas: cost > 0 ? conversionValue / cost : null,
            };
        }).sort((a, b) => b.cost - a.cost);
    } catch (error) {
        logApiError("getTimeAnalysisPerformance", error);
        return [];
    }
}

// ============================================
// PMax Listing Groups (product coverage per asset group)
// ============================================

export interface PMaxListingGroupItem {
    id: string;
    type: string;          // SUBDIVISION | UNIT
    dimension: string;     // 'brand' | 'category' | 'product_type' | 'condition' | 'all'
    value: string;         // e.g. "Samsung", "Electronics", "All products"
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    roas: number | null;
    cpa: number | null;
}

export async function getPMaxListingGroups(
    refreshToken: string,
    customerId: string,
    assetGroupId: string,
    dateRange?: DateRange
): Promise<PMaxListingGroupItem[]> {
    try {
        const customer = getGoogleAdsCustomer(refreshToken, customerId);
        const dateFilter = getDateFilter(dateRange);

        const query = `
            SELECT
                asset_group_listing_group_filter.id,
                asset_group_listing_group_filter.type,
                asset_group_listing_group_filter.case_value.product_brand.value,
                asset_group_listing_group_filter.case_value.product_type.value,
                asset_group_listing_group_filter.case_value.product_condition.condition,
                asset_group_listing_group_filter.case_value.product_item_id.value,
                asset_group_listing_group_filter.case_value.product_channel.channel,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value
            FROM asset_group_listing_group_filter
            WHERE asset_group.id = ${assetGroupId}
            ${dateFilter}
            ORDER BY metrics.cost_micros DESC
            LIMIT 500
        `;

        const rows = await customer.query(query);

        return rows.map((row: any): PMaxListingGroupItem => {
            const filter = row.asset_group_listing_group_filter || {};
            const caseValue = filter.case_value || {};
            const cost = Number(row.metrics?.cost_micros || 0) / 1_000_000;
            const conversionValue = Number(row.metrics?.conversions_value || 0);
            const conversions = Number(row.metrics?.conversions || 0);

            // Determine dimension and value from whichever case_value is set
            let dimension = 'all';
            let value = 'All products';
            if (caseValue.product_brand?.value) {
                dimension = 'brand';
                value = caseValue.product_brand.value;
            } else if (caseValue.product_type?.value) {
                dimension = 'product_type';
                value = caseValue.product_type.value;
            } else if (caseValue.product_condition?.condition != null) {
                dimension = 'condition';
                const condMap: Record<string, string> = { '1': 'New', '2': 'Refurbished', '3': 'Used', '4': 'Unknown' };
                value = condMap[String(caseValue.product_condition.condition)] || String(caseValue.product_condition.condition);
            } else if (caseValue.product_item_id?.value) {
                dimension = 'item_id';
                value = caseValue.product_item_id.value;
            }

            const typeRaw = filter.type;
            const TYPE_MAP: Record<string, string> = { '2': 'SUBDIVISION', 'SUBDIVISION': 'SUBDIVISION', '3': 'UNIT', 'UNIT': 'UNIT' };

            return {
                id: String(filter.id || ''),
                type: TYPE_MAP[String(typeRaw)] || String(typeRaw || 'UNIT'),
                dimension,
                value,
                impressions: Number(row.metrics?.impressions || 0),
                clicks: Number(row.metrics?.clicks || 0),
                cost,
                conversions,
                conversionValue,
                roas: cost > 0 ? conversionValue / cost : null,
                cpa: conversions > 0 ? cost / conversions : null,
            };
        });
    } catch (error) {
        logApiError('getPMaxListingGroups', error);
        return [];
    }
}

// Display Ad Assets (Responsive Display Ads)
export async function getDisplayAdAssets(
    refreshToken: string,
    customerId: string,
    adGroupId: string,
    dateRange?: DateRange
): Promise<any[]> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);
    const dateFilter = getDateFilter(dateRange);

    try {
        const query = `
            SELECT
                ad_group_ad_asset_view.field_type,
                ad_group_ad_asset_view.performance_label,
                ad_group_ad_asset_view.enabled,
                asset.id,
                asset.name,
                asset.type,
                asset.text_asset.text,
                asset.image_asset.full_size.url,
                asset.youtube_video_asset.youtube_video_id
            FROM ad_group_ad_asset_view
            WHERE ad_group.id = ${adGroupId}
            AND ad_group_ad_asset_view.enabled = TRUE
            ${dateFilter}
            LIMIT 200
        `;

        const result = await customer.query(query);

        return result.map((row: any) => ({
            id: String(row.asset?.id || ''),
            fieldType: String(row.ad_group_ad_asset_view?.field_type || 'UNKNOWN'),
            performanceLabel: String(row.ad_group_ad_asset_view?.performance_label || 'UNRATED'),
            name: row.asset?.name || '',
            type: String(row.asset?.type || ''),
            text: row.asset?.text_asset?.text || '',
            imageUrl: row.asset?.image_asset?.full_size?.url || '',
            youtubeVideoId: row.asset?.youtube_video_asset?.youtube_video_id || '',
        }));
    } catch (error: unknown) {
        logApiError('getDisplayAdAssets', error);
        return [];
    }
}

// ============================================
// PMax Asset Counts
// ============================================

export interface PMaxAssetCounts {
    headlines: number;
    descriptions: number;
    images: number;
    videos: number;
}

export async function getPMaxAssetCounts(
    refreshToken: string,
    campaignId: string,
    customerId?: string
): Promise<PMaxAssetCounts> {
    const customer = getGoogleAdsCustomer(refreshToken, customerId);

    const counts: PMaxAssetCounts = {
        headlines: 0,
        descriptions: 0,
        images: 0,
        videos: 0
    };

    try {
        const query = `
            SELECT
                asset_group_asset.field_type,
                asset.type
            FROM asset_group_asset
            WHERE asset_group.campaign = 'customers/${customerId}/campaigns/${campaignId}'
        `;

        const result = await customer.query(query);

        for (const row of result) {
            const fieldType = row.asset_group_asset?.field_type;
            const assetType = row.asset?.type;

            if (fieldType === 'HEADLINE') counts.headlines++;
            if (fieldType === 'DESCRIPTION') counts.descriptions++;
            if (assetType === 'IMAGE') counts.images++;
            if (assetType === 'YOUTUBE_VIDEO') counts.videos++;
        }

        return counts;
    } catch (error: unknown) {
        logApiError("getPMaxAssetCounts", error);
        return counts;
    }
}



