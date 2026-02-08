
import * as dotenv from "dotenv";
import { OAuth2Client } from "google-auth-library";
import * as path from "path";

// Load .env.local
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "https://developers.google.com/oauthplayground"; // Standard redirect for manual token generation

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env.local");
    process.exit(1);
}

const oauth2Client = new OAuth2Client(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
);

// Generate the url that will be used for the consent dialog.
const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: 'https://www.googleapis.com/auth/adwords',
    prompt: 'consent' // Force refresh token generation
});

console.log("\n=== Google Ads OAuth Setup ===\n");
console.log("Please visit the following URL to authorize the app:");
console.log("\n" + authorizeUrl + "\n");
console.log("1. Login with: hristo.yankov@videnov.bg");
console.log("2. Copy the 'Authorization code' from the page.");
console.log("3. Provide this code to the next step.");
