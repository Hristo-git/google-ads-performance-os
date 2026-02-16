import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import { GoogleAdsApi } from 'google-ads-api';
import { getCampaigns } from '../lib/google-ads';

async function verifyConsistency() {
    try {
        console.log('Starting consistency check...');

        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
        let customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;

        if (!refreshToken || !clientId || !clientSecret || !developerToken) {
            console.error('Missing environment variables.');
            return;
        }

        const client = new GoogleAdsApi({
            client_id: clientId,
            client_secret: clientSecret,
            developer_token: developerToken,
        });

        console.log('Listing accessible customers...');
        const customers = await client.listAccessibleCustomers(refreshToken);
        console.log(`Found ${customers.resource_names.length} accessible customers.`);

        let validCustomerId: string | null = null;
        const knownManagerId = customerId?.replace(/-/g, '');

        for (const resourceName of customers.resource_names) {
            const id = resourceName.split('/')[1];

            if (id === knownManagerId) {
                console.log(`Skipping known manager ID: ${id}`);
                continue;
            }

            console.log(`Trying customer ID: ${id}`);

            try {
                // Try fetching campaigns for this ID
                const campaigns = await getCampaigns(refreshToken, id);
                console.log(`Success! Customer ID ${id} is valid. Found ${campaigns.length} campaigns.`);
                if (campaigns.length > 0) {
                    validCustomerId = id;
                    break;
                } else {
                    console.log(`Customer ${id} has 0 campaigns. Trying next...`);
                }
            } catch (e: any) {
                const msg = e?.errors?.[0]?.message || e?.message || String(e);
                console.log(`Failed for ID ${id}: ${msg.substring(0, 100)}...`);
            }
        }

        if (!validCustomerId) {
            console.error("Could not find a valid client customer ID with campaigns. Aborting.");
            // If all failed, we might want to try the original ID just in case
            if (customerId && customerId !== knownManagerId) {
                validCustomerId = customerId;
            } else {
                return;
            }
        }

        console.log(`Using Customer ID: ${validCustomerId} for verification.`);

        console.log('Fetching campaigns (Run 1)...');
        const run1 = await getCampaigns(refreshToken, validCustomerId);

        console.log('Fetching campaigns (Run 2)...');
        const run2 = await getCampaigns(refreshToken, validCustomerId);

        if (run1.length !== run2.length) {
            console.error(`Length mismatch! Run 1: ${run1.length}, Run 2: ${run2.length}`);
            return;
        }

        let differences = 0;
        for (let i = 0; i < run1.length; i++) {
            const c1 = run1[i];
            const c2 = run2[i];

            if (c1.id !== c2.id) {
                console.error(`Mismatch at index ${i}:`);
                console.error(`Run 1: ${c1.name} (${c1.id}) - Impr: ${c1.impressions}`);
                console.error(`Run 2: ${c2.name} (${c2.id}) - Impr: ${c2.impressions}`);
                differences++;
            }
        }

        if (differences === 0) {
            console.log('SUCCESS: Campaign order is deterministic across runs.');
        } else {
            console.error(`FAILURE: Found ${differences} mismatches in order.`);
        }

    } catch (error) {
        console.error('Error verifying consistency:', error);
    }
}

verifyConsistency();
