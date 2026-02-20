
import { GoogleAdsApi } from 'google-ads-api';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
const envPath = resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

async function listCustomers() {
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || process.env.GOOGLE_ADS_CUSTOMER_ID;

    if (!refreshToken || !clientId || !clientSecret || !developerToken || !loginCustomerId) {
        console.error("Missing Google Ads configuration in .env.local");
        return;
    }

    console.log(`\n--- Listing Customers for Login Customer ID: ${loginCustomerId} ---`);

    try {
        const client = new GoogleAdsApi({
            client_id: clientId,
            client_secret: clientSecret,
            developer_token: developerToken,
        });

        // Try querying customer_client to see hierarchy
        const customer = client.Customer({
            customer_id: loginCustomerId.replace(/-/g, ""), // Use login customer ID to query hierarchy
            login_customer_id: loginCustomerId.replace(/-/g, ""),
            refresh_token: refreshToken,
        });

        try {
            const query = `
                SELECT
                    customer_client.client_customer,
                    customer_client.level,
                    customer_client.manager,
                    customer_client.descriptive_name,
                    customer_client.currency_code,
                    customer_client.time_zone,
                    customer_client.id
                FROM customer_client
                WHERE customer_client.level <= 5
            `;

            const results = await customer.query(query);
            console.log(`\nFound ${results.length} client customers under this manager (Level <= 5):`);

            // Sort by level then ID to see hierarchy
            const sorted = results.sort((a, b) => {
                if (a.customer_client.level !== b.customer_client.level) {
                    return a.customer_client.level - b.customer_client.level;
                }
                return a.customer_client.id - b.customer_client.id;
            });

            sorted.forEach((row: any) => {
                const indent = "  ".repeat(Math.max(0, row.customer_client.level));
                console.log(`${indent}- ${row.customer_client.descriptive_name} (ID: ${row.customer_client.id}, Lvl: ${row.customer_client.level})`);
            });

        } catch (e: any) {
            console.error("Failed to query customer_client:", JSON.stringify(e, null, 2));
        }

    } catch (error: any) {
        console.error("Fatal error:", error);
    }
}

listCustomers();
