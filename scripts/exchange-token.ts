
import * as dotenv from "dotenv";
import { OAuth2Client } from "google-auth-library";
import * as path from "path";

// Load .env.local
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "https://developers.google.com/oauthplayground"; // Match the user's generated code redirect URI

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    process.exit(1);
}

const code = process.argv[2];

if (!code) {
    console.error("❌ Please provide the authorization code as an argument.");
    console.error("Usage: npx tsx scripts/exchange-token.ts <CODE>");
    process.exit(1);
}

async function exchange() {
    const oauth2Client = new OAuth2Client(
        CLIENT_ID,
        CLIENT_SECRET,
        REDIRECT_URI
    );

    try {
        console.log("Exchanging code for tokens...");
        const { tokens } = await oauth2Client.getToken(code);

        console.log("\n✅ Authorization Successful!");
        console.log("----------------------------------------");
        console.log("Refresh Token:", tokens.refresh_token);
        console.log("----------------------------------------");

        if (tokens.refresh_token) {
            const envPath = path.join(process.cwd(), ".env.local");
            let currentEnv = fs.readFileSync(envPath, 'utf-8');
            const refreshTokenKey = "GOOGLE_ADS_REFRESH_TOKEN";

            if (currentEnv.includes(refreshTokenKey)) {
                currentEnv = currentEnv.replace(
                    new RegExp(`${refreshTokenKey}=.*`),
                    `${refreshTokenKey}=${tokens.refresh_token}`
                );
            } else {
                currentEnv += `\n${refreshTokenKey}=${tokens.refresh_token}\n`;
            }

            fs.writeFileSync(envPath, currentEnv);
            console.log("✅ Updated .env.local with new Refresh Token.");
        } else {
            console.warn("⚠️ No refresh token returned. This might happen if you've already authorized the app.");
        }

    } catch (error: any) {
        console.error("❌ Error exchanging Code:", error.message);
    }
}

import * as fs from "fs";
exchange();
