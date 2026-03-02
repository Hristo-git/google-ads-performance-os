
import { GoogleAdsApi } from "google-ads-api";
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    const client_id = process.env.GOOGLE_CLIENT_ID;
    const client_secret = process.env.GOOGLE_CLIENT_SECRET;
    const developer_token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refresh_token = process.env.GOOGLE_ADS_REFRESH_TOKEN;

    if (!client_id || !client_secret || !developer_token || !refresh_token) {
        console.error("Missing env vars");
        return;
    }

    const client = new GoogleAdsApi({
        client_id,
        client_secret,
        developer_token,
    });

    const targetMcc = "5293169619"; // Bulgaria (Videnov.BG) MCC

    try {
        console.log(`📡 Listing children for MCC: ${targetMcc}...`);
        const customer = client.Customer({
            customer_id: targetMcc,
            refresh_token,
            login_customer_id: "3151945525"
        });

        const children = await customer.query(`
            SELECT 
                customer_client.client_customer,
                customer_client.descriptive_name,
                customer_client.manager,
                customer_client.level
            FROM customer_client
            WHERE customer_client.level <= 1
        `);

        console.log(`✅ Found ${children.length} accounts under ${targetMcc}:`);
        children.forEach((child: any) => {
            const cc = child.customer_client;
            if (cc) {
                console.log(`- ${cc.descriptive_name || 'Unnamed'} (${cc.client_customer || 'No ID'}) | Manager: ${cc.manager}`);
            }
        });

    } catch (e) {
        console.error("Failed to list children:", e);
    }
}

main();
