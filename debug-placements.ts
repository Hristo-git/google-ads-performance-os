
import { GoogleAdsApi } from "google-ads-api";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
});

async function runDebug() {
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN!;
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "") || process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, "");

    console.log("Login Customer ID:", loginCustomerId);

    // 1. List accessible customers
    const managerCustomer = client.Customer({
        customer_id: loginCustomerId!,
        refresh_token: refreshToken,
    });

    console.log("Fetching accessible customers...");
    const customers = await managerCustomer.query(`
        SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager
        FROM customer_client
        WHERE customer_client.status = 'ENABLED'
    `);

    console.log("Accessible Customers:", JSON.stringify(customers.map(c => ({
        id: c.customer_client.id,
        name: c.customer_client.descriptive_name,
        manager: c.customer_client.manager
    })), null, 2));

    const clientAccount = customers.find(c => !c.customer_client.manager);
    if (!clientAccount) {
        console.error("No client account found!");
        return;
    }

    const targetId = "5334827744"; // Known client account from server logs
    console.log(`Targeting Client Account ID: ${targetId}`);

    const customer = client.Customer({
        customer_id: targetId,
        login_customer_id: loginCustomerId,
        refresh_token: refreshToken,
    });

    // 2. Find campaigns
    console.log("Listing top campaigns...");
    const campaigns = await customer.query(`
        SELECT campaign.id, campaign.name, campaign.advertising_channel_type
        FROM campaign 
        WHERE campaign.status = 'ENABLED'
        LIMIT 5
    `);

    if (campaigns.length === 0) {
        console.log("No enabled campaigns found in this account.");
        return;
    }

    console.log("Found Campaigns:", JSON.stringify(campaigns.map(c => ({ id: c.campaign.id, name: c.campaign.name })), null, 2));

    const pmaxCampaign = campaigns.find(c => c.campaign.name.toLowerCase().includes("pmax")) || campaigns[0];
    const campaignId = pmaxCampaign.campaign.id.toString();
    const campaignName = pmaxCampaign.campaign.name;
    console.log(`\nTesting Placements for Campaign: ${campaignName} (${campaignId})`);

    console.log("\n--- TESTING detail_placement_view ---");
    try {
        const detailResult = await customer.query(`
            SELECT
                detail_placement_view.placement,
                detail_placement_view.display_name,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros
            FROM detail_placement_view
            WHERE campaign.id = ${campaignId}
            LIMIT 10
        `);
        console.log("detail_placement_view Count:", detailResult.length);
        if (detailResult.length > 0) {
            console.log("Sample:", JSON.stringify(detailResult.slice(0, 2), null, 2));
        }
    } catch (e) {
        console.error("detail_placement_view Error:", e);
    }

    console.log("\n--- TESTING group_placement_view ---");
    try {
        const groupResult = await customer.query(`
            SELECT
                group_placement_view.placement,
                group_placement_view.display_name,
                metrics.impressions
            FROM group_placement_view
            WHERE campaign.id = ${campaignId}
            LIMIT 10
        `);
        console.log("group_placement_view Count:", groupResult.length);
        if (groupResult.length > 0) {
            console.log("Sample:", JSON.stringify(groupResult.slice(0, 2), null, 2));
        }
    } catch (e) {
        console.error("group_placement_view Error:", e);
    }
}

runDebug().catch(console.error);
