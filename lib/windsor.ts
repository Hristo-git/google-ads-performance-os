/**
 * Windsor.ai API Client
 * Fetches Google Ads data from Windsor.ai connector
 */

export interface WindsorCampaignData {
    campaign: string;
    campaign_id?: string;
    date: string;
    clicks: number;
    impressions: number;
    cost: number;
    conversions?: number;
    revenue?: number;
    currency?: string;
    data_source: string;
    // Impression Share metrics from Google Ads via Windsor
    search_impression_share?: number;
    search_rank_lost_impression_share?: number;
    search_budget_lost_impression_share?: number;
}

export interface WindsorResponse {
    data: WindsorCampaignData[];
}

export interface WindsorRequestParams {
    api_key: string;
    connector: string; // e.g., "google_ads"
    date_preset?: string; // e.g., "last_30d", "last_7d", "today"
    date_from?: string; // YYYY-MM-DD
    date_to?: string; // YYYY-MM-DD
    fields?: string; // comma-separated fields
}

/**
 * Fetch data from Windsor.ai connector
 */
export async function fetchWindsorData(params: WindsorRequestParams): Promise<WindsorCampaignData[]> {
    const {
        api_key,
        connector,
        date_preset = "last_30d",
        date_from,
        date_to,
        fields = "campaign,date,clicks,impressions,cost,conversions,search_impression_share,search_rank_lost_impression_share,search_budget_lost_impression_share"
    } = params;

    // Build query parameters
    const queryParams = new URLSearchParams({
        api_key,
        fields,
    });

    // Add date parameters
    if (date_from && date_to) {
        queryParams.append("date_from", date_from);
        queryParams.append("date_to", date_to);
    } else {
        queryParams.append("date_preset", date_preset);
    }

    const url = `https://connectors.windsor.ai/google_ads?${queryParams.toString()}`;

    console.log("Fetching Windsor.ai data from:", url.replace(api_key, "***"));

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Windsor.ai API error: ${response.status} - ${errorText}`);
        }

        const result: WindsorResponse = await response.json();
        console.log(`Windsor.ai returned ${result.data?.length || 0} records`);

        return result.data || [];
    } catch (error) {
        console.error("Error fetching Windsor.ai data:", error);
        throw error;
    }
}

/**
 * Get Windsor.ai data for Google Ads
 */
export async function getGoogleAdsDataFromWindsor(
    apiKey: string,
    datePreset: string = "last_30d"
): Promise<WindsorCampaignData[]> {
    return fetchWindsorData({
        api_key: apiKey,
        connector: "google_ads",
        date_preset: datePreset,
    });
}

/**
 * Get Windsor.ai data for a specific date range
 */
export async function getGoogleAdsDataByDateRange(
    apiKey: string,
    dateFrom: string,
    dateTo: string
): Promise<WindsorCampaignData[]> {
    return fetchWindsorData({
        api_key: apiKey,
        connector: "google_ads",
        date_from: dateFrom,
        date_to: dateTo,
    });
}
