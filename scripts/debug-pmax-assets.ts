
import { GoogleAdsApi } from "google-ads-api";
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    const client_id = process.env.GOOGLE_CLIENT_ID;
    const client_secret = process.env.GOOGLE_CLIENT_SECRET;
    const developer_token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refresh_token = process.env.GOOGLE_ADS_REFRESH_TOKEN;

    // Login ID from env or fallback
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, "") : undefined;
    const envCustomerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, "");

    if (!client_id || !client_secret || !developer_token || !refresh_token || !envCustomerId) {
        console.error("Missing env vars (CLIENT_ID, SECRET, TOKENS, CUSTOMER_ID)");
        return;
    }

    const client = new GoogleAdsApi({
        client_id,
        client_secret,
        developer_token,
    });

    const customer = client.Customer({
        customer_id: envCustomerId,
        refresh_token,
        login_customer_id: loginCustomerId,
    });

    console.log(`Using Customer ID: ${envCustomerId}`);

    // 1. Fetch PMax Asset Groups
    console.log("Fetching PMax Asset Groups...");
    const assetGroups = await customer.query(`
        SELECT asset_group.id, asset_group.name, asset_group.status
        FROM asset_group
        WHERE asset_group.status = 'ENABLED'
        LIMIT 5
    `);

    if (assetGroups.length === 0) {
        console.log("No enabled asset groups found.");
        return;
    }

    const targetGroup = assetGroups[0];
    console.log(`Checking Asset Group: ${targetGroup.asset_group.name} (${targetGroup.asset_group.id})`);

    // 2. Fetch Assets for this group
    console.log("Fetching Assets raw response...");
    try {
        const assets = await customer.query(`
            SELECT
                asset_group_asset.resource_name,
                asset_group_asset.field_type,
                asset_group_asset.status,
                asset_group_asset.primary_status
            FROM asset_group_asset
            WHERE asset_group.id = ${targetGroup.asset_group.id}
            LIMIT 5
        `);

        console.log("Assets Found:", assets.length);
        if (assets.length > 0) {
            console.log("First Asset:", JSON.stringify(assets[0], null, 2));
        }
    } catch (e) {
        console.error("Asset Query Error:", e);
    }
}

main().catch(console.error);
