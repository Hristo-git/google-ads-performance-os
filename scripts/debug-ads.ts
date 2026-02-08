import { GoogleAdsApi, enums } from 'google-ads-api';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function debugAds() {
    const client = new GoogleAdsApi({
        client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
        developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    });

    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN!;
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!;

    const customer = client.Customer({
        customer_id: customerId,
        refresh_token: refreshToken,
    });

    console.log("Fetching ads to check raw ad_strength values...");

    try {
        const ads = await customer.query(`
            SELECT
                ad_group_ad.ad.id,
                ad_group.name,
                ad_group_ad.ad_strength
            FROM ad_group_ad
            WHERE ad_group_ad.status != 'REMOVED'
            LIMIT 20
        `);

        console.log("\nRaw API Response Samples:");
        ads.forEach(row => {
            console.log(`- Ad ID: ${row.ad_group_ad.ad.id}`);
            console.log(`  Ad Group: ${row.ad_group.name}`);
            console.log(`  Raw Ad Strength: ${row.ad_group_ad.ad_strength} (Type: ${typeof row.ad_group_ad.ad_strength})`);
            console.log(`  Stringified: ${String(row.ad_group_ad.ad_strength)}`);
            console.log('---');
        });

    } catch (error) {
        console.error("Error fetching ads:", error);
    }
}

debugAds();
