import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
console.log(`Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

async function debugFlow() {
    console.log("Starting full flow debug...");

    try {
        console.log("Importing lib/google-ads...");
        const gAds = await import("../lib/google-ads");
        const { getCampaigns, getAdGroups, getAssetGroups, getClient } = gAds;

        console.log("Initializing Client...");
        const client = getClient();
        console.log("Client initialized.");

        // Hardcode a customer ID from env or a known one for testing if available
        // From .env.local view previously: GOOGLE_ADS_CUSTOMER_ID="315-194-5525"
        const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

        if (!customerId || !refreshToken) {
            throw new Error("Missing Customer ID or Refresh Token in env");
        }

        console.log(`Fetching Campaigns for Customer ${customerId}...`);
        try {
            const campaigns = await getCampaigns(refreshToken, customerId);
            console.log(`Successfully fetched ${campaigns.length} campaigns.`);

            if (campaigns.length > 0) {
                const campaignId = campaigns[0].id.toString();
                console.log(`Fetching AdGroups for Campaign ${campaignId}...`);
                const adGroups = await getAdGroups(refreshToken, campaignId, customerId);
                console.log(`Successfully fetched ${adGroups.length} ad groups.`);
            }
        } catch (innerError) {
            console.error("Error during API calls:", innerError);
            throw innerError;
        }

    } catch (error) {
        console.error("CRITICAL FAILURE:", error);
    }
}

debugFlow();
