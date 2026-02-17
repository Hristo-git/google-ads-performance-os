import { GoogleAdsApi } from "google-ads-api";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
const envPath = resolve(process.cwd(), ".env.local");
dotenv.config({ path: envPath });

async function debugBrandConversions() {
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || process.env.GOOGLE_ADS_CUSTOMER_ID;
    const customerId = "8277239615"; // Romania (Vellea Home)

    if (!refreshToken || !clientId || !clientSecret || !developerToken || !loginCustomerId) {
        console.error("Missing Google Ads configuration in .env.local");
        return;
    }

    console.log(`\n--- Debugging Brand Conversions for ${customerId} ---`);
    console.log(`Login Customer ID: ${loginCustomerId}`);

    try {
        const client = new GoogleAdsApi({
            client_id: clientId,
            client_secret: clientSecret,
            developer_token: developerToken,
        });

        const customer = client.Customer({
            customer_id: customerId.replace(/-/g, ""),
            login_customer_id: loginCustomerId.replace(/-/g, ""),
            refresh_token: refreshToken,
        });

        // Define a generous date range (last 30 days)
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        console.log(`Period: ${startDate} to ${endDate}\n`);

        // Query 1: Raw search term rows for "velea home"
        console.log("Querying search_term_view for 'velea home'...");
        const query1 = `
            SELECT
                campaign.id,
                campaign.name,
                ad_group.id,
                ad_group.name,
                search_term_view.search_term,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value
            FROM
                search_term_view
            WHERE
                segments.date BETWEEN '${startDate}' AND '${endDate}'
                AND search_term_view.search_term LIKE '%velea home%'
            LIMIT 100
        `;

        const rows = await customer.query(query1);
        console.log(`Found ${rows.length} rows in search_term_view.\n`);

        if (rows.length > 0) {
            console.log("Search Term | Campaign | Clicks | Conv. | Conv. Value");
            console.log("------------------------------------------------------------------");
            rows.forEach((row: any) => {
                console.log(
                    `${row.search_term_view.search_term} | ${row.campaign.name} | ${row.metrics.clicks} | ${row.metrics.conversions} | ${row.metrics.conversions_value}`
                );
            });
        }

        // Query 2: PMax Search Insight categories for "velea home"
        console.log("\nQuerying campaign_search_term_insight for 'velea home'...");
        const query2 = `
            SELECT 
                campaign_search_term_insight.category_label,
                metrics.impressions,
                metrics.clicks,
                metrics.conversions,
                metrics.conversions_value
            FROM 
                campaign_search_term_insight
            WHERE 
                segments.date BETWEEN '${startDate}' AND '${endDate}'
                AND campaign_search_term_insight.category_label LIKE '%velea home%'
        `;

        try {
            const pmaxRows = await customer.query(query2);
            console.log(`Found ${pmaxRows.length} PMax categories.\n`);
            if (pmaxRows.length > 0) {
                console.log("Category | Clicks | Conv. | Conv. Value");
                console.log("-----------------------------------------");
                pmaxRows.forEach((row: any) => {
                    console.log(
                        `${row.campaign_search_term_insight.category_label} | ${row.metrics.clicks} | ${row.metrics.conversions} | ${row.metrics.conversions_value}`
                    );
                });
            }
        } catch (e: any) {
            console.log("\nPMax Insight Query failed.");
            if (e.errors) {
                console.log("API Errors:", JSON.stringify(e.errors, null, 2));
            } else {
                console.log("Error:", e.message || e);
            }
        }

        // Summary Aggregation
        console.log("\n--- AGGREGATED BRAND PERFORMANCE (Terms containing 'velea home') ---");
        const brandSummary = rows.reduce((acc: any, row: any) => {
            acc.clicks += Number(row.metrics.clicks);
            acc.conversions += Number(row.metrics.conversions);
            acc.value += Number(row.metrics.conversions_value);
            return acc;
        }, { clicks: 0, conversions: 0, value: 0 });

        console.log(`Total Branded Clicks: ${brandSummary.clicks}`);
        console.log(`Total Branded Conv.:  ${brandSummary.conversions}`);
        console.log(`Total Branded Value: &euro;${brandSummary.value.toFixed(2)}`);

        // Check for ANY terms with conversions to compare
        console.log("\n--- TOP CONVERTING SEARCH TERMS (Any term) ---");
        const queryTop = `
            SELECT
                search_term_view.search_term,
                metrics.clicks,
                metrics.conversions,
                metrics.conversions_value
            FROM
                search_term_view
            WHERE
                segments.date BETWEEN '${startDate}' AND '${endDate}'
                AND metrics.conversions > 0
            ORDER BY metrics.conversions DESC
            LIMIT 10
        `;
        const topRows = await customer.query(queryTop);
        topRows.forEach((r: any) => {
            console.log(`${r.search_term_view.search_term} | Clicks: ${r.metrics.clicks} | Conv: ${r.metrics.conversions}`);
        });

        // Query 4: List all campaigns and their types
        console.log("\n--- CAMPAIGN TYPES ---");
        const queryTypes = `
            SELECT
                campaign.id,
                campaign.name,
                campaign.advertising_channel_type
            FROM
                campaign
            WHERE
                campaign.status != 'REMOVED'
        `;
        const campTypes = await customer.query(queryTypes);
        campTypes.forEach((r: any) => {
            console.log(`${r.campaign.name} (${r.campaign.id}) | Type: ${r.campaign.advertising_channel_type}`);
        });

    } catch (error) {
        console.error("Error during debug:", error);
    }
}

debugBrandConversions();
