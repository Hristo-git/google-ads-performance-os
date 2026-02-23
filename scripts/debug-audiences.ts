
import { GoogleAdsApi, enums } from "google-ads-api";
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkAccount(client: GoogleAdsApi, refresh_token: string, customer_id: string, name: string) {
    console.log(`\n🔍 Checking account: ${name} (${customer_id})...`);
    const customer = client.Customer({
        customer_id, refresh_token,
        login_customer_id: "3151945525"
    });

    try {
        console.log("  Checking ad_group_audience_view...");
        const results = await customer.query(`
            SELECT
                ad_group_criterion.display_name,
                metrics.impressions
            FROM ad_group_audience_view
            WHERE segments.date DURING LAST_30_DAYS
            AND metrics.impressions > 0
            LIMIT 5
        `);
        console.log(`  ✅ Ad Group Audiences: ${results.length}`);

        console.log("  Checking campaign_audience_view...");
        const campaignResults = await customer.query(`
            SELECT
                campaign_criterion.display_name,
                metrics.impressions
            FROM campaign_audience_view
            WHERE segments.date DURING LAST_30_DAYS
            AND metrics.impressions > 0
            LIMIT 5
        `);
        console.log(`  ✅ Campaign Audiences: ${campaignResults.length}`);

        if (results.length === 0 && campaignResults.length === 0) {
            console.log("  Checking raw ad_group_criterion (no metrics filter)...");
            const raw = await customer.query(`
                SELECT ad_group_criterion.id, ad_group_criterion.type 
                FROM ad_group_criterion 
                WHERE ad_group_criterion.type IN ('USER_LIST', 'USER_INTEREST', 'CUSTOM_AUDIENCE', 'COMBINED_AUDIENCE')
                LIMIT 5
            `);
            console.log(`  Found ${raw.length} audience-type criteria totals.`);
        }
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

    await checkAccount(client, refresh_token, "5334827744", "Videnov.BG - EURO");
    await checkAccount(client, refresh_token, "8749402256", "Videnov.BG");
}

main();
