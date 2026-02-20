import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
console.log(`Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

async function debugFindClient() {
    console.log("Starting client discovery...");

    try {
        const gAds = await import("../lib/google-ads");
        const { getAccessibleCustomers, getCampaigns, getClient } = gAds;

        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        if (!refreshToken) throw new Error("Missing Refresh Token");

        console.log("Fetching accessible customers...");
        const customers = await getAccessibleCustomers(refreshToken);

        console.log(`Found ${customers.length} accessible customers.`);

        // Find a client account (usually not a manager, but the list might not explicitly say 'isManager' based on the return type I saw earlier, let's check)
        // actually getAccessibleCustomers returns { id, resourceName } usually.
        // My previous grep showed: Promise<{ id: string, name: string, isManager: boolean }[]>

        const clientAccounts = customers.filter(c => !c.isManager);
        console.log(`Found ${clientAccounts.length} client accounts.`);

        if (clientAccounts.length > 0) {
            const targetClient = clientAccounts[0];
            console.log(`Testing with Client Account: ${targetClient.name} (${targetClient.id})`);

            try {
                const campaigns = await getCampaigns(refreshToken, targetClient.id);
                console.log(`SUCCESS: Fetched ${campaigns.length} campaigns for client ${targetClient.id}.`);
            } catch (err: any) {
                console.error(`FAILED to fetch campaigns for client ${targetClient.id}:`, err.message);
            }
        } else {
            console.log("No client accounts found. Listing all:");
            customers.forEach(c => console.log(`- ${c.name} (${c.id}) IsManager: ${c.isManager}`));
        }

    } catch (error) {
        console.error("CRITICAL FAILURE:", error);
    }
}

debugFindClient();
