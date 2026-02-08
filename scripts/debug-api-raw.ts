
import { GoogleAdsApi } from "google-ads-api";
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    const client_id = process.env.GOOGLE_CLIENT_ID;
    const client_secret = process.env.GOOGLE_CLIENT_SECRET;
    const developer_token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refresh_token = process.env.GOOGLE_ADS_REFRESH_TOKEN;

    console.log("CLIENT_ID:", !!client_id);
    console.log("CLIENT_SECRET:", !!client_secret);
    console.log("DEVELOPER_TOKEN:", !!developer_token);
    console.log("REFRESH_TOKEN:", !!refresh_token);

    if (!client_id || !client_secret || !developer_token || !refresh_token) {
        console.error("Missing env vars");
        return;
    }

    const client = new GoogleAdsApi({
        client_id,
        client_secret,
        developer_token,
    });

    // 1. Use configurable customer ID
    // Remove dashes if present
    const envCustomerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, "");

    if (!envCustomerId) {
        console.error("GOOGLE_ADS_CUSTOMER_ID missing");
        return;
    }

    const customerId = envCustomerId;
    console.log(`Using Customer ID: ${customerId}`);

    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, "") : undefined;

    console.log(`Login Customer ID: ${loginCustomerId || "NONE"}`);

    const customer = client.Customer({
        customer_id: customerId,
        refresh_token,
        login_customer_id: loginCustomerId,
    });

    // 2. Fetch a few Ad Groups to find one with negative keywords
    console.log("Fetching Ad Groups...");
    const adGroups = await customer.query(`
        SELECT ad_group.id, ad_group.name 
        FROM ad_group 
        WHERE ad_group.status = 'ENABLED' 
        LIMIT 5
    `);

    if (adGroups.length === 0) {
        console.log("No enabled ad groups found.");
        return;
    }

    const adGroupId = adGroups[0].ad_group.id;
    console.log(`Checking Ad Group: ${adGroups[0].ad_group.name} (${adGroupId})`);

    // 3. Fetch Negative Keywords
    console.log("Fetching Negative Keywords raw response...");
    const result = await customer.query(`
        SELECT
            ad_group_criterion.criterion_id,
            ad_group.id,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group_criterion.type
        FROM ad_group_criterion
        WHERE ad_group_criterion.negative = TRUE
        LIMIT 5
    `);

    // Map using the logic from lib/google-ads.ts
    const mapped = result.map((row: any) => ({
        id: row.ad_group_criterion?.criterion_id?.toString() || "",
        adGroupId: row.ad_group?.id?.toString() || "",
        text: row.ad_group_criterion?.keyword?.text || "",
        matchType: String(row.ad_group_criterion?.keyword?.match_type) || "", // The problematic line
        _rawMatchType: row.ad_group_criterion?.keyword?.match_type
    }));

    console.log("Mapped Result:", JSON.stringify(mapped[0], null, 2));

    // 4. Fetch Ads - valid query
    console.log("\nFetching Ads types...");
    try {
        const adsResult = await customer.query(`
            SELECT
                ad_group_ad.ad.id,
                ad_group_ad.ad.type,
                ad_group_ad.ad.responsive_search_ad.headlines,
                ad_group_ad.ad.responsive_display_ad.headlines
            FROM ad_group_ad
            WHERE ad_group_ad.status = 'ENABLED'
            LIMIT 10
        `);
        console.log("Ad Types found:", adsResult.map((r: any) => r.ad_group_ad.ad.type));
        console.log("First Ad:", JSON.stringify(adsResult[0], null, 2));
    } catch (e) {
        console.error("Ads Query Error:", e);
    }
}

main().catch(console.error);
