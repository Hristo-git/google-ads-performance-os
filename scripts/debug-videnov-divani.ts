import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { GoogleAdsApi, enums } from 'google-ads-api';
import { ACCOUNTS } from '../config/accounts';

const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
});

const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
if (!refreshToken) {
    console.error("Missing GOOGLE_ADS_REFRESH_TOKEN in .env.local");
    process.exit(1);
}

// target term
const targetTerm = "мебели виденов дивани";

async function run() {
    try {
        console.log(`Checking specifically for the exact term or containing "${targetTerm}" in BG account...`);
        const bgAccount = ACCOUNTS.find(a => a.id === '5334827744'); // BG 
        if (!bgAccount) throw new Error("BG account not found");

        const customer = client.Customer({
            customer_id: bgAccount.id.replace(/-/g, ''),
            login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, ''),
            refresh_token: refreshToken as string,
        });

        const query = `
            SELECT 
                search_term_view.search_term,
                campaign.name,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value,
                metrics.impressions,
                metrics.clicks
            FROM search_term_view 
            WHERE 
                segments.date DURING LAST_30_DAYS
                AND search_term_view.search_term LIKE '%${targetTerm}%'
            ORDER BY metrics.cost_micros DESC
        `;

        console.log("Running GAQL query for the last 30 days...");
        const response = await customer.query(query);

        console.log(`Found ${response.length} matching search term entries across ad groups.`);

        const termSummary: Record<string, {
            cost: number,
            conversions: number,
            convValue: number,
            impressions: number,
            clicks: number,
            campaigns: Set<string>
        }> = {};

        for (const row of response) {
            const st = row.search_term_view?.search_term || '';
            const campName = row.campaign?.name || 'Unknown';
            const cost = (row.metrics?.cost_micros || 0) / 1000000;
            const conv = row.metrics?.conversions || 0;
            const val = row.metrics?.conversions_value || 0;
            const impr = row.metrics?.impressions || 0;
            const clicks = row.metrics?.clicks || 0;

            if (!termSummary[st]) {
                termSummary[st] = { cost: 0, conversions: 0, convValue: 0, impressions: 0, clicks: 0, campaigns: new Set() };
            }

            termSummary[st].cost += cost;
            termSummary[st].conversions += conv;
            termSummary[st].convValue += val;
            termSummary[st].impressions += impr;
            termSummary[st].clicks += clicks;
            termSummary[st].campaigns.add(campName);
        }

        console.log("\n--- Term Summaries ---");
        for (const [st, metrics] of Object.entries(termSummary)) {
            console.log(`\nSearch Term: "${st}"`);
            console.log(`- Cost: €${metrics.cost.toFixed(2)}`);
            console.log(`- Conversions: ${metrics.conversions.toFixed(2)}`);
            console.log(`- Conv. Value: €${metrics.convValue.toFixed(2)}`);
            console.log(`- Impressions: ${metrics.impressions}`);
            console.log(`- Clicks: ${metrics.clicks}`);
            console.log(`- Campaigns involved:`);
            Array.from(metrics.campaigns).forEach(c => console.log(`    * ${c}`));
        }

    } catch (error) {
        console.error("Error executing script:", error);
    }
}

run();
