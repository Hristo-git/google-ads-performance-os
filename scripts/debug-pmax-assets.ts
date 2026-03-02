
import { GoogleAdsApi } from "google-ads-api";
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    const client_id = process.env.GOOGLE_CLIENT_ID;
    const client_secret = process.env.GOOGLE_CLIENT_SECRET;
    const developer_token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refresh_token = process.env.GOOGLE_ADS_REFRESH_TOKEN;

    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, "") : undefined;
    const envCustomerId = "5334827744";

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
    const results = await customer.query(`
        SELECT 
            campaign.name, 
            asset_group.id, 
            asset_group.name, 
            asset_group.status
        FROM asset_group
    `);

    if (results.length === 0) {
        console.log("No asset groups found.");
        return;
    }

    console.log(`Found ${results.length} asset groups.`);
    for (const row of results) {
        console.log(`- Campaign: ${row.campaign.name} | Asset Group: ${row.asset_group.name} (${row.asset_group.id}) [${row.asset_group.status}]`);
    }

    // Search specifically for "Кухни AON"
    const targetGroup = results.find(r => r.asset_group.name.includes("Кухни AON")) || results[0];
    console.log(`\nInspecting Asset Group: ${targetGroup.asset_group.name} (${targetGroup.asset_group.id})`);

    const FIELD_TYPE_MAP: Record<string, string> = {
        '2': 'HEADLINE',
        '3': 'DESCRIPTION',
        '18': 'LONG_HEADLINE',
        '25': 'SITELINK',
        '19': 'SQUARE_MARKETING_IMAGE',
        '20': 'PORTRAIT_MARKETING_IMAGE',
        '5': 'MARKETING_IMAGE',
        '21': 'LOGO',
        '22': 'LANDSCAPE_LOGO'
    };

    const assetGroupId = targetGroup.asset_group.id;
    const assetGroupName = targetGroup.asset_group.name;

    // 2. Fetch Assets for this group
    console.log("Fetching Assets with raw field_type...");
    try {
        const assets = await customer.query(`
            SELECT
                asset_group.id,
                asset_group.name,
                asset_group.ad_strength,
                asset_group_asset.asset,
                asset_group_asset.field_type,
                asset_group_asset.status,
                asset.id,
                asset.type,
                asset.name,
                asset.text_asset.text,
                asset.image_asset.full_size.url,
                asset.youtube_video_asset.youtube_video_id
            FROM asset_group_asset
            WHERE asset_group.id = ${assetGroupId}
        `);

        console.log(`\n--- Assets for Asset Group: ${assetGroupName} (ID: ${assetGroupId}) ---`);

        if (assets.length > 0) {
            const adStrength = assets[0].asset_group?.ad_strength;
            console.log(`Ad Strength: ${adStrength}`);
        }

        console.log(`Assets Found: ${assets.length}\n`);
        for (const a of assets) {
            const rawFieldType = a.asset_group_asset.field_type;
            const mappedFieldType = FIELD_TYPE_MAP[String(rawFieldType)] || rawFieldType;

            let content = "";
            if (a.asset.text_asset?.text) content = `Text: "${a.asset.text_asset.text}"`;
            else if (a.asset.youtube_video_asset?.youtube_video_id) content = `Video ID: ${a.asset.youtube_video_asset.youtube_video_id}`;

            console.log(`ID: ${a.asset.id} | Type: ${a.asset.type} | FieldType: ${mappedFieldType} (Raw: ${rawFieldType}) | Content: ${content}`);
        }
    } catch (e) {
        console.error("Asset Query Error:", e);
    }
}

main().catch(console.error);
