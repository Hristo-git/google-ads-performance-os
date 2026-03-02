
import { GoogleAdsApi } from "google-ads-api";
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkEvitni(client: GoogleAdsApi, refresh_token: string, customer_id: string) {
    console.log(`\n🔍 Searching for "евтини" in account: ${customer_id}...`);
    const customer = client.Customer({
        customer_id, refresh_token,
        login_customer_id: "3151945525"
    });

    try {
        const query = `
            SELECT
                campaign.name,
                search_term_view.search_term,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value
            FROM search_term_view
            WHERE segments.date DURING LAST_7_DAYS
            AND search_term_view.search_term LIKE '%евтини%'
            AND metrics.cost_micros > 0
        `;
        const results = await customer.query(query);

        console.log(`\nFound ${results.length} search terms containing "евтини":`);

        const campaignAggregation: Record<string, { cost: number, conv: number, terms: number }> = {};

        results.forEach((row: any) => {
            const campaignName = row.campaign.name;
            const cost = (row.metrics.cost_micros || 0) / 1000000;
            const conv = row.metrics.conversions || 0;

            if (!campaignAggregation[campaignName]) {
                campaignAggregation[campaignName] = { cost: 0, conv: 0, terms: 0 };
            }
            campaignAggregation[campaignName].cost += cost;
            campaignAggregation[campaignName].conv += conv;
            campaignAggregation[campaignName].terms += 1;
        });

        console.log("\nCampaign Distribution:");
        Object.entries(campaignAggregation)
            .sort((a, b) => b[1].cost - a[1].cost)
            .forEach(([name, stats]) => {
                console.log(`- ${name}: €${stats.cost.toFixed(2)} (${stats.terms} terms, ${stats.conv.toFixed(1)} conv)`);
            });

        console.log("\nTop 10 Terms:");
        results.sort((a: any, b: any) => b.metrics.cost_micros - a.metrics.cost_micros).slice(0, 10).forEach((row: any) => {
            console.log(`- ${row.search_term_view.search_term}: €${(row.metrics.cost_micros / 1000000).toFixed(2)} (${row.campaign.name})`);
        });

    } catch (e: any) {
        console.error(`  ❌ Failed: ${e.message}`);
    }
}

async function main() {
    const client_id = process.env.GOOGLE_CLIENT_ID;
    const client_secret = process.env.GOOGLE_CLIENT_SECRET;
    const developer_token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refresh_token = process.env.GOOGLE_ADS_REFRESH_TOKEN;

    if (!client_id || !client_secret || !developer_token || !refresh_token) {
        console.error("Missing env vars");
        return;
    }

    const client = new GoogleAdsApi({ client_id, client_secret, developer_token });

    // Try both IDs if unsure, but 5334827744 is the one in config
    await checkEvitni(client, refresh_token, "5334827744");
}

main();
