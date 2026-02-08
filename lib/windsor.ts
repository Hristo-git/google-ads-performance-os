// Next.js has built-in fetch support

// Interfaces matching Windsor.ai API response structure
export interface WindsorCampaignData {
    campaign: string;
    clicks: number;
    impressions: number;
    cost: number;
    conversions: number;
    conversion_value: number;
    bidding_strategy_type?: string;
    advertising_channel_type?: string;
    advertising_channel_sub_type?: string;
    target_cpa?: number;
    target_roas?: number;
    search_impression_share?: number;
    search_rank_lost_impression_share?: number;
    search_budget_lost_impression_share?: number;
    search_top_impression_share?: number;
    search_absolute_top_impression_share?: number;
    search_rank_lost_top_impression_share?: number;
    search_budget_lost_top_impression_share?: number;
    roas?: number;
    asset_group?: string;
    date?: string; // Optional for daily data
}

export interface WindsorAdGroupData extends WindsorCampaignData {
    ad_group_name: string;
    ad_group_id?: string;
}

export interface WindsorKeywordData extends WindsorAdGroupData {
    keyword_text: string;
    match_type: string;
    quality_score: number | null;
}

export interface WindsorAdData extends WindsorCampaignData {
    ad_group_name: string;
    ad_name: string;
    description1?: string;
    description2?: string;
    ad_strength: string;
}

export interface WindsorGranularQSData {
    ad_group_name: string;
    keyword_text: string;
    search_predicted_ctr: string;
    creative_quality_score: string;
    post_click_quality_score: string;
}

export interface WindsorNegativeKeywordData {
    campaign: string;
    ad_group_name?: string;
    negative_keyword_text: string;
    match_type?: string;
}

interface WindsorResponse<T> {
    data: T[];
}

/**
 * Generic fetch function for Windsor.ai
 */
async function fetchWindsorData({
    api_key,
    connector,
    date_preset,
    fields,
}: {
    api_key: string;
    connector: string;
    date_preset?: string;
    fields: string;
}): Promise<any[]> {
    const params = new URLSearchParams({
        api_key,
        fields,
    });

    if (date_preset) {
        params.append("date_preset", date_preset);
    }

    const url = `https://connectors.windsor.ai/${connector}?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Windsor.ai API error: ${response.status} - ${await response.text()}`);
        }
        const json = (await response.json()) as WindsorResponse<any>;
        return json.data || [];
    } catch (error) {
        console.error("Error fetching data from Windsor.ai:", error);
        throw error;
    }
}

/**
 * Get Windsor.ai Campaign data
 * Split into two queries because Google Ads cannot combine
 * impression share metrics with bidding strategy fields in one request.
 */
export async function getCampaignDataFromWindsor(
    apiKey: string,
    datePreset: string = "last_30d"
): Promise<WindsorCampaignData[]> {
    // Query 1: Core performance metrics + strategy fields
    const metricsPromise = fetchWindsorData({
        api_key: apiKey,
        connector: "google_ads",
        date_preset: datePreset,
        fields: "campaign,clicks,impressions,cost,conversions,conversion_value,bidding_strategy_type,advertising_channel_type,advertising_channel_sub_type,target_cpa,target_roas,roas,asset_group",
    });

    // Query 2: Impression share metrics (separate due to Google Ads API limitation)
    const impressionSharePromise = fetchWindsorData({
        api_key: apiKey,
        connector: "google_ads",
        date_preset: datePreset,
        fields: "campaign,search_impression_share,search_rank_lost_impression_share,search_budget_lost_impression_share,search_top_impression_share,search_absolute_top_impression_share,search_rank_lost_top_impression_share,search_budget_lost_top_impression_share",
    }).catch(err => {
        console.warn("Windsor impression share query failed (non-critical):", err.message);
        return [] as any[];
    });

    const [metricsData, isData] = await Promise.all([metricsPromise, impressionSharePromise]);

    // Build impression share lookup by campaign name
    const isMap = new Map<string, Record<string, number>>();
    for (const row of isData) {
        const name = row.campaign;
        if (!name) continue;
        const existing = isMap.get(name);
        if (!existing) {
            isMap.set(name, { ...row });
        }
    }

    // Merge impression share data into metrics data
    const merged = metricsData.map((row: any) => {
        const is = isMap.get(row.campaign);
        if (is) {
            return {
                ...row,
                search_impression_share: is.search_impression_share ?? row.search_impression_share,
                search_rank_lost_impression_share: is.search_rank_lost_impression_share ?? row.search_rank_lost_impression_share,
                search_budget_lost_impression_share: is.search_budget_lost_impression_share ?? row.search_budget_lost_impression_share,
                search_top_impression_share: is.search_top_impression_share ?? row.search_top_impression_share,
                search_absolute_top_impression_share: is.search_absolute_top_impression_share ?? row.search_absolute_top_impression_share,
                search_rank_lost_top_impression_share: is.search_rank_lost_top_impression_share ?? row.search_rank_lost_top_impression_share,
                search_budget_lost_top_impression_share: is.search_budget_lost_top_impression_share ?? row.search_budget_lost_top_impression_share,
            };
        }
        return row;
    });

    return merged as any as WindsorCampaignData[];
}

// Alias for backward compatibility since campaigns/route.ts uses this name
export const getGoogleAdsDataFromWindsor = getCampaignDataFromWindsor;

/**
 * Get Windsor.ai Ad Group data
 */
export async function getAdGroupDataFromWindsor(
    apiKey: string,
    datePreset: string = "last_30d"
): Promise<WindsorAdGroupData[]> {
    const data = await fetchWindsorData({
        api_key: apiKey,
        connector: "google_ads",
        date_preset: datePreset,
        fields: "campaign,ad_group_name,clicks,impressions,cost,conversions,conversion_value",
    });
    return data as any as WindsorAdGroupData[];
}

/**
 * Get Windsor.ai Keyword data
 */
export async function getKeywordDataFromWindsor(
    apiKey: string,
    datePreset: string = "last_30d"
): Promise<WindsorKeywordData[]> {
    const data = await fetchWindsorData({
        api_key: apiKey,
        connector: "google_ads",
        date_preset: datePreset,
        fields: "campaign,ad_group_name,keyword_text,match_type,quality_score,clicks,impressions,cost,conversions,conversion_value",
    });
    return data as any as WindsorKeywordData[];
}

/**
 * Get Windsor.ai Granular QS data (No Date to avoid segmentation error)
 */
export async function getGranularQSDataFromWindsor(
    apiKey: string,
    datePreset: string = "last_30d"
): Promise<WindsorGranularQSData[]> {
    // Fetch granular QS without date_preset to completely avoid segmentation errors
    // Windsor will default to some range or just return latest state
    const data = await fetchWindsorData({
        api_key: apiKey,
        connector: "google_ads",
        // date_preset: undefined, // Explicitly undefined
        fields: "ad_group_name,keyword_text,search_predicted_ctr,creative_quality_score,post_click_quality_score",
    });
    return data as any as WindsorGranularQSData[];
}

/**
 * Get Windsor.ai Ad data
 */
export async function getAdDataFromWindsor(
    apiKey: string,
    datePreset: string = "last_30d"
): Promise<WindsorAdData[]> {
    const data = await fetchWindsorData({
        api_key: apiKey,
        connector: "google_ads",
        date_preset: datePreset,
        fields: "campaign,ad_group_name,ad_name,description1,description2,ad_strength,clicks,impressions,cost,conversions,conversion_value",
    });
    return data as any as WindsorAdData[];
}

/**
 * Get Windsor.ai Negative Keywords
 */
export async function getNegativeKeywordData(
    apiKey: string,
    datePreset: string = "last_30d"
): Promise<WindsorNegativeKeywordData[]> {
    const data = await fetchWindsorData({
        api_key: apiKey,
        connector: "google_ads",
        date_preset: datePreset,
        fields: "campaign,ad_group_name,negative_keyword_text",
    });
    return data as any as WindsorNegativeKeywordData[];
}
