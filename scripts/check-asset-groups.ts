
import { GoogleAdsApi } from "google-ads-api";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function checkAssetGroups() {
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const customerId = '8277239615'; // Romania

    if (!refreshToken) return;

    const client = new GoogleAdsApi({
        client_id: process.env.GOOGLE_ADS_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || "",
        developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
    });

    const customer = client.Customer({
        customer_id: customerId,
        refresh_token: refreshToken,
    });

    console.log("--- Asset Groups ---");
    try {
        const result = await customer.query(`
            SELECT
                asset_group.id,
                asset_group.name,
                campaign.id,
                campaign.name
            FROM asset_group
            LIMIT 10
        `);
        result.forEach(r => console.log(`${r.asset_group?.name} (Campaign: ${r.campaign?.name})`));
    } catch (e: any) {
        console.error("Asset group query failed:", e.message);
    }
}

checkAssetGroups();
