
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

    // 1. List Accessible Customers to find the right one
    const customer = client.Customer({
        customer_id: defaultCustomerId,
        refresh_token: refreshToken,
    });

    console.log("Listing Accessible Customers...");
    const customers = await customer.query(`
        SELECT customer_client.id, customer_client.descriptive_name
        FROM customer_client
        WHERE customer_client.status = 'ENABLED'
    `);

    console.log("Available Accounts:");
    customers.forEach(c => {
        console.log(`- ${c.customer_client?.descriptive_name} (${c.customer_client?.id})`);
    });

    // Use VelleaHome.RO - EURO (8277239615)
    // const targetAccount = customers.find(c => c.customer_client?.descriptive_name?.includes("RO"));
    // const foundId = targetAccount?.customer_client?.id;
    // const targetId = foundId ? String(foundId) : defaultCustomerId;
    const targetId = "8277239615";

    console.log(`\nUsing Account: VelleaHome.RO - EURO (${targetId})`);

    const targetCustomer = client.Customer({
        customer_id: targetId,
        refresh_token: refreshToken,
        login_customer_id: defaultCustomerId // Important for MCC
    });

    // 2. Search for Ad Group
    // 2. Search for Ad Group
    console.log("Using Ad Group ID: 190864359578 (Brand)");
    const adGroupId = "190864359578";
    const adGroups = [{ ad_group: { id: adGroupId, name: "Brand" } }];

    // Skip the search
    /*
    const adGroups = await targetCustomer.query(`
        SELECT ad_group.id, ad_group.name, campaign.name, ad_group.type
        FROM ad_group
        WHERE ad_group.name LIKE '%Profitabl%'
        AND ad_group.status != 'REMOVED'
    `);
    */

    if (adGroups.length === 0) {
        console.log("Ad Group NOT found. Listing first 10 ad groups:");
        const allGroups = await targetCustomer.query(`
            SELECT ad_group.id, ad_group.name FROM ad_group LIMIT 10
        `);
        allGroups.forEach(g => console.log(`- ${g.ad_group?.name} (${g.ad_group?.id})`));
        return;
    }

    // const adGroupId = adGroups[0].ad_group.id;
    console.log(`Found Ad Group: ${adGroups[0].ad_group.name} (ID: ${adGroupId})`);

    // 3. Query Ads
    console.log("\nQuerying Ads...");
    const ads = await targetCustomer.query(`
    SELECT
        ad_group_ad.ad.id,
        ad_group_ad.ad.type,
        ad_group_ad.ad.name,
        ad_group_ad.ad.demand_gen_multi_asset_ad.headlines,
        ad_group_ad.ad.demand_gen_multi_asset_ad.descriptions,
        ad_group_ad.ad.demand_gen_carousel_ad.headline,
        ad_group_ad.ad.demand_gen_carousel_ad.description
    FROM ad_group_ad
    WHERE ad_group.id = ${adGroupId}
    AND ad_group_ad.status != 'REMOVED'
  `);

    console.log(`Found ${ads.length} ads.`);

    if (ads.length > 0) {
        ads.forEach((row, i) => {
            console.log(`\n--- Ad ${i + 1} ---`);
            const ad = row.ad_group_ad?.ad;
            console.log(`ID: ${ad?.id}`);
            // Force cast to any to avoid type issues with enum lookup
            const typeEnum = (enums as any).AdType?.[ad?.type as any] || "Unknown";
            console.log(`Type: ${ad?.type} (${typeEnum})`);

            const typeId = ad?.type;
            if (typeId === 10) console.log("Type 10 often corresponds to VIDEO_AD or similar in some versions. Checking...");
            console.log(`Name: ${ad?.name}`);
        });
    } else {
        console.log("No ads returned from API.");
    }
}

main().catch(console.error);
