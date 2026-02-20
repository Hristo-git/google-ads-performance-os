
import { GoogleAdsApi } from 'google-ads-api';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
const envPath = resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

async function debugDisplayNameSelection() {
    console.log("Starting Display Name Selection Debug...");

    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || process.env.GOOGLE_ADS_CUSTOMER_ID;

    // Videnov.BG - EURO (Active Account)
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

    const PERIOD = "LAST_30_DAYS";

    try {
        console.log(`\n=== Testing ad_group_criterion.display_name in ad_group_audience_view ===`);
        const adGroupResults = await customer.query(`
                SELECT
                    ad_group_criterion.criterion_id,
                    ad_group_criterion.type,
                    ad_group_criterion.display_name, 
                    metrics.impressions
                FROM ad_group_audience_view
                WHERE segments.date DURING ${PERIOD}
                LIMIT 5
        `);
        console.log(`Results: ${adGroupResults.length}`);
        if (adGroupResults.length > 0) {
            console.log("Sample Row:", JSON.stringify(adGroupResults[0], null, 2));
        }

    } catch (e: any) {
        console.error("Query Failed:", e.message || e);
        if (e.errors) console.error(JSON.stringify(e.errors, null, 2));
    }
}

debugDisplayNameSelection();
