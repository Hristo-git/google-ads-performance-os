
import { GoogleAdsApi, enums } from "google-ads-api";
import { config } from "dotenv";

// Load environment variables
config({ path: ".env.local" });

async function main() {
    const customerIdRaw = process.env.GOOGLE_ADS_CUSTOMER_ID;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

    if (!customerIdRaw || !clientId || !clientSecret || !developerToken || !refreshToken) {
        console.error("Missing environment variables");
        process.exit(1);
    }

    const defaultCustomerId = customerIdRaw.replace(/-/g, "");

    const client = new GoogleAdsApi({
        client_id: clientId,
        client_secret: clientSecret,
        developer_token: developerToken,
    });

    // Use VelleaHome.RO - EURO (8277239615) as established in previous debug
    const targetId = "8277239615";
    console.log(`\nUsing Account: VelleaHome.RO - EURO (${targetId})`);

    const targetCustomer = client.Customer({
        customer_id: targetId,
        refresh_token: refreshToken,
        login_customer_id: defaultCustomerId
    });

    const campaignName = "WD_Shopping_Performance [Kids_Room]";
    console.log(`Searching for Campaign '${campaignName}'...`);

    // 1. Find the Campaign and its Type
    const campaigns = await targetCustomer.query(`
        SELECT campaign.id, campaign.name, campaign.advertising_channel_type
        FROM campaign
        WHERE campaign.name = '${campaignName}'
        AND campaign.status != 'REMOVED'
    `);

    if (campaigns.length === 0) {
        console.log("Campaign not found.");
        return;
    }

    const campaign = campaigns[0].campaign;
    console.log(`Found Campaign: ${campaign.name} (ID: ${campaign.id})`);

    // Resolve Enum for Channel Type
    const channelTypeEnum = (enums as any).AdvertisingChannelType?.[campaign.advertising_channel_type] || campaign.advertising_channel_type;
    console.log(`Advertising Channel Type: ${channelTypeEnum}`);

    // 2. Check for Ad Groups
    console.log("\nChecking for Ad Groups...");
    const adGroups = await targetCustomer.query(`
        SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type
        FROM ad_group
        WHERE campaign.id = ${campaign.id}
        AND ad_group.status != 'REMOVED'
    `);

    console.log(`Found ${adGroups.length} Ad Groups.`);
    adGroups.forEach(ag => {
        const typeEnum = (enums as any).AdGroupType?.[ag.ad_group.type] || ag.ad_group.type;
        console.log(`- ${ag.ad_group.name} (${ag.ad_group.id}) [${typeEnum}]`);
    });

    // 3. Check for Asset Groups (if PMax)
    if (channelTypeEnum === 'PERFORMANCE_MAX') {
        console.log("\nChecking for Asset Groups (PMax)...");
        const assetGroups = await targetCustomer.query(`
            SELECT asset_group.id, asset_group.name, asset_group.status
            FROM asset_group
            WHERE campaign.id = ${campaign.id}
            AND asset_group.status != 'REMOVED'
        `);
        console.log(`Found ${assetGroups.length} Asset Groups.`);
        assetGroups.forEach(ag => {
            console.log(`- ${ag.asset_group.name} (${ag.asset_group.id})`);
        });
    }
}

main().catch(console.error);
