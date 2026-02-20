
import { GoogleAdsApi } from 'google-ads-api';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
const envPath = resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

async function debugBrandTerm() {
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || process.env.GOOGLE_ADS_CUSTOMER_ID;

    // Videnov.BG - EURO
    const customerId = "5334827744";

    if (!refreshToken || !clientId || !clientSecret || !developerToken) {
        console.error("Missing env vars");
        return;
    }

    const client = new GoogleAdsApi({
        client_id: clientId,
        client_secret: clientSecret,
        developer_token: developerToken,
    });

    const customer = client.Customer({
        customer_id: customerId,
        login_customer_id: loginCustomerId?.replace(/-/g, ""),
        refresh_token: refreshToken,
    });

    const searchTerm = "диван виденов";
    // Check last 30 days to ensure we capture data
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`\n--- Debugging Term: '${searchTerm}' (${startDate} to ${endDate}) ---`);

    try {
        // 1. Check Standard Search Campaigns
        console.log("\n=== 1. Standard Search Campaigns ===");
        try {
            const searchResults = await customer.query(`
                SELECT
                    campaign.name,
                    search_term_view.search_term,
                    metrics.impressions,
                    metrics.clicks,
                    metrics.cost_micros,
                    metrics.conversions,
                    metrics.conversions_value
                FROM search_term_view
                WHERE search_term_view.search_term LIKE '%${searchTerm}%'
                AND segments.date BETWEEN '${startDate}' AND '${endDate}'
            `);

            if (searchResults.length > 0) {
                searchResults.forEach((row: any) => {
                    const cost = row.metrics.cost_micros / 1000000;
                    console.log(`[${row.campaign.name}] Term: "${row.search_term_view.search_term}" | Clicks: ${row.metrics.clicks} | Conv: ${row.metrics.conversions} | Cost: ${cost.toFixed(2)}`);
                });
            } else {
                console.log("No hits in Standard Search.");
            }
        } catch (e: any) {
            console.error("Standard Search Query Failed:", e.message);
        }

        // 2. Check PMax/Search Insights (campaign_search_term_insight)
        console.log("\n=== 2. PMax/Search Insights (campaign_search_term_insight) ===");

        // Query campaigns first to iterate
        const campaigns = await customer.query(`
            SELECT campaign.id, campaign.name, campaign.advertising_channel_type
            FROM campaign 
            WHERE campaign.status != 'REMOVED'
        `);

        let foundPMaxInsights = false;

        for (const camp of campaigns) {
            // Only check PMAX or SEARCH campaigns
            if (camp.campaign.advertising_channel_type !== 'PERFORMANCE_MAX' && camp.campaign.advertising_channel_type !== 'SEARCH') {
                continue;
            }

            try {
                const insightResults = await customer.query(`
                    SELECT
                        campaign_search_term_insight.category_label,
                        campaign_search_term_insight.id,
                        metrics.clicks,
                        metrics.impressions,
                        metrics.conversions,
                        metrics.conversions_value
                    FROM campaign_search_term_insight
                    WHERE campaign_search_term_insight.campaign_id = ${camp.campaign.id}
                    AND segments.date BETWEEN '${startDate}' AND '${endDate}'
                `);

                const matchedInsights = insightResults.filter((row: any) => {
                    const label = row.campaign_search_term_insight?.category_label?.toLowerCase() || "";
                    // Be broader with matching
                    return label.includes("диван") || label.includes("виденов");
                });

                if (matchedInsights.length > 0) {
                    foundPMaxInsights = true;
                    matchedInsights.forEach((row: any) => {
                        console.log(`[${camp.campaign.name}] Category: "${row.campaign_search_term_insight.category_label}" | Clicks: ${row.metrics.clicks} | Conv: ${row.metrics.conversions}`);
                    });
                }
            } catch (e: any) {
                // Ignore errors for campaigns that don't support insights or have no data
            }
        }

        if (!foundPMaxInsights) {
            console.log("No matched categories in PMax insights.");
        }

    } catch (e: any) {
        console.error("Fatal Script Error:", JSON.stringify(e?.errors || e.message, null, 2));
    }
}

debugBrandTerm();
