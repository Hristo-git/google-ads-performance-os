import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
console.log(`Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

async function verifyFix() {
    console.log("Starting verification of resolveCustomerAccountId...");

    try {
        const gAds = await import("../lib/google-ads");
        const { resolveCustomerAccountId } = gAds;

        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        if (!refreshToken) throw new Error("Missing Refresh Token");

        // Test 1: Auto-resolution (No ID provided)
        console.log("\n--- Test 1: Auto-resolution (No ID provided) ---");
        const resolvedId = await resolveCustomerAccountId(refreshToken);
        console.log(`Resolved ID: ${resolvedId}`);

        if (resolvedId && resolvedId !== process.env.GOOGLE_ADS_CUSTOMER_ID) {
            console.log("SUCCESS: Resolved to a different ID than the env var (which was MCC).");
        } else if (resolvedId) {
            console.log(`INFO: Resolved ID matches env var (${resolvedId}). Check if env var is actually a client account.`);
        } else {
            console.error("FAILURE: Returned empty ID.");
        }

        // Test 2: Explicit ID provided
        console.log("\n--- Test 2: Explicit ID provided ---");
        const explicitId = "1234567890";
        const resolvedExplicit = await resolveCustomerAccountId(refreshToken, explicitId);
        if (resolvedExplicit === explicitId) {
            console.log("SUCCESS: Correctly returned explicit ID.");
        } else {
            console.error(`FAILURE: Returned ${resolvedExplicit} instead of ${explicitId}`);
        }

    } catch (error) {
        console.error("CRITICAL FAILURE:", error);
    }
}

verifyFix();
