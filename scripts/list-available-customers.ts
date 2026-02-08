
import { GoogleAdsApi } from "google-ads-api";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function listCustomers() {
    console.log(" Authenticating with Google Ads API...");

    const client = new GoogleAdsApi({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    });

    // Use the MCC ID for login
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN!;

    console.log(` Using Manager Account (Login): ${loginCustomerId}`);

    const customer = client.Customer({
        customer_id: loginCustomerId!,
        login_customer_id: loginCustomerId!,
        refresh_token: refreshToken,
    });

    try {
        console.log(" Fetching accessible customers...");

        // Detailed query to see status and hierarchy
        const result = await customer.query(`
            SELECT
                customer_client.id,
                customer_client.descriptive_name,
                customer_client.manager,
                customer_client.status,
                customer_client.currency_code,
                customer_client.time_zone
            FROM customer_client
        `);

        console.log("\n=== ACCESSIBLE ACCOUNTS ===");
        result.forEach(row => {
            const c = row.customer_client;
            console.log(`\nID: ${c?.id}`);
            console.log(`Name: ${c?.descriptive_name}`);
            console.log(`Manager: ${c?.manager}`);
            console.log(`Status: ${c?.status}`); // ENABLED, CANCELED, SUSPENDED, etc.
            console.log(`Currency: ${c?.currency_code}`);
        });
        console.log("\n===========================");

    } catch (error) {
        console.error("Error listing customers:", error);
    }
}

listCustomers();
