
import { GoogleAdsApi } from "google-ads-api";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function checkCampaigns() {
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const customerId = '8277239615'; // Romania

    if (!refreshToken) {
        console.error("Missing refresh token");
        return;
    }

    const client = new GoogleAdsApi({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
    });

    const customer = client.Customer({
        customer_id: customerId,
        refresh_token: refreshToken,
    });

    console.log("--- Campaign Types ---");
    try {
        const result = await customer.query(`
            SELECT
                campaign.id,
                campaign.name,
                campaign.advertising_channel_type
            FROM campaign
            WHERE campaign.status != 'REMOVED'
            LIMIT 50
        `);
        result.forEach(r => console.log(`${r.campaign?.name}: ${r.campaign?.advertising_channel_type}`));
    } catch (e: any) {
        console.error("Query failed:", e.message);
    }
}

checkCampaigns();
