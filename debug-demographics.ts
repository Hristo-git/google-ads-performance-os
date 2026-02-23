import { GoogleAdsApi } from "google-ads-api";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
});

async function test() {
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN!;
    const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "");

    // First find the right customer ID for Bulgaria by listing accessible accounts
    const managerCustomer = client.Customer({
        customer_id: loginCustomerId,
        login_customer_id: loginCustomerId,
        refresh_token: refreshToken,
    });

    console.log("Login customer:", loginCustomerId);
    console.log("\n--- Finding accessible customer accounts ---");
    try {
        const accounts = await managerCustomer.query(`
            SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager
            FROM customer_client
            WHERE customer_client.manager = false
            LIMIT 20
        `);
        accounts.forEach((a: any) => console.log(`  ${a.customer_client.id} - ${a.customer_client.descriptive_name}`));

        // Find Bulgaria account
        const bulgariaCust = accounts.find((a: any) =>
            String(a.customer_client.descriptive_name || '').toLowerCase().includes('videnov') ||
            String(a.customer_client.descriptive_name || '').toLowerCase().includes('bg')
        );
        if (!bulgariaCust) {
            console.log("\nCould not auto-detect Bulgaria account. Trying first account...");
            if (!accounts.length) { console.log("No accounts found"); return; }
        }

        const targetId = bulgariaCust?.customer_client?.id?.toString() || accounts[0]?.customer_client?.id?.toString();
        console.log("\nTesting with customer:", targetId);

        const customer = client.Customer({
            customer_id: targetId,
            login_customer_id: loginCustomerId,
            refresh_token: refreshToken,
        });

        // Find DG campaign
        const allCampaigns = await customer.query(`
            SELECT campaign.id, campaign.name, campaign.advertising_channel_type
            FROM campaign WHERE campaign.status != 'REMOVED' LIMIT 30
        `);
        console.log("\nAll campaigns:");
        allCampaigns.forEach((c: any) => console.log(`  [${c.campaign.advertising_channel_type}] ${c.campaign.name} (${c.campaign.id})`));

        const dgCampaign = allCampaigns.find((c: any) => String(c.campaign.name).includes('DG - Video'));
        if (!dgCampaign) { console.log("\nDG Video campaign not found in list"); return; }

        const campaignId = dgCampaign.campaign.id.toString();
        console.log("\nTesting demographics for:", dgCampaign.campaign.name, "id:", campaignId);

        const filter = `AND segments.date BETWEEN '2026-01-01' AND '2026-01-31' AND campaign.id = ${campaignId}`;

        for (const [name, q] of [
            ["age_range_view", `SELECT age_range_view.resource_name, metrics.impressions, metrics.cost_micros FROM age_range_view WHERE metrics.impressions > 0 ${filter}`],
            ["gender_view", `SELECT gender_view.resource_name, metrics.impressions, metrics.cost_micros FROM gender_view WHERE metrics.impressions > 0 ${filter}`],
            ["parental_status_view", `SELECT parental_status_view.resource_name, metrics.impressions, metrics.cost_micros FROM parental_status_view WHERE metrics.impressions > 0 ${filter}`],
            ["income_range_view", `SELECT income_range_view.resource_name, metrics.impressions, metrics.cost_micros FROM income_range_view WHERE metrics.impressions > 0 ${filter}`],
            ["age_range_view (no date, no impr)", `SELECT age_range_view.resource_name, metrics.impressions, metrics.cost_micros FROM age_range_view WHERE campaign.id = ${campaignId} LIMIT 5`],
        ] as [string, string][]) {
            console.log(`\n--- ${name} ---`);
            try {
                const r = await customer.query(q);
                console.log(`Count: ${r.length}`);
                if (r.length > 0) console.log("Sample:", JSON.stringify(r[0], null, 2));
            } catch(e: any) { console.error(`ERROR: ${e.message || JSON.stringify(e)}`); }
        }

    } catch(e: any) {
        console.error("Failed:", e.message || JSON.stringify(e));
    }
}

test().catch(console.error);
