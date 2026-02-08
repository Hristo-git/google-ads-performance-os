
import * as http from 'http';
import * as url from 'url';
import * as dotenv from "dotenv";
import { OAuth2Client } from "google-auth-library";
import * as path from "path";
import * as fs from "fs";

// Load .env.local
const envPath = path.join(process.cwd(), ".env.local");
dotenv.config({ path: envPath });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:4000/api/auth/callback/google";
const PORT = 4000;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    process.exit(1);
}

const oauth2Client = new OAuth2Client(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
);

// Generate auth URL
const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: 'https://www.googleapis.com/auth/adwords',
    prompt: 'consent'
});

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url || '', true);

    // Only handle the callback URL
    if (parsedUrl.pathname === '/api/auth/callback/google') {
        const code = parsedUrl.query.code as string;

        if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication Successful!</h1><p>Received code. exchanging for token... check your terminal.</p><script>window.close()</script>');

            console.log("\n✅ RECEIVED AUTH CODE!");
            console.log("Exchanging for Refresh Token...");

            try {
                const { tokens } = await oauth2Client.getToken(code);

                if (tokens.refresh_token) {
                    console.log("\n🎉 SUCCESS! REFRESH TOKEN GENERATED:");
                    console.log("----------------------------------------");
                    console.log(tokens.refresh_token);
                    console.log("----------------------------------------");

                    // Update .env.local automatically
                    let currentEnv = fs.readFileSync(envPath, 'utf-8');
                    const refreshTokenKey = "GOOGLE_ADS_REFRESH_TOKEN";

                    if (currentEnv.includes(refreshTokenKey)) {
                        // Replace existing
                        currentEnv = currentEnv.replace(
                            new RegExp(`${refreshTokenKey}=.*`),
                            `${refreshTokenKey}=${tokens.refresh_token}`
                        );
                    } else {
                        // Append new
                        currentEnv += `\n${refreshTokenKey}=${tokens.refresh_token}\n`;
                    }

                    fs.writeFileSync(envPath, currentEnv);
                    console.log("✅ Updated .env.local with new Refresh Token.");
                    console.log("You can now restart your main app.");

                    process.exit(0);
                } else {
                    console.error("❌ No refresh token returned. (Did you already authorize silently?)");
                    console.log("Try revoking access for this app in your Google Account settings and trying again.");
                    process.exit(1);
                }

            } catch (error: any) {
                console.error("❌ Error exchanging token:", error.message);
                process.exit(1);
            }
        } else {
            console.log("Callback received but no code found.");
            res.end("No code found.");
        }
    } else {
        // Fallback for other requests (e.g. favicon)
        res.writeHead(404);
        res.end();
    }
});

server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
        console.error("❌ Port 4000 is still in use! Please stop the main app and try again.");
        process.exit(1);
    }
});

server.listen(PORT, () => {
    console.log(`\n🚀 Temporary Auth Server running on port ${PORT}`);
    console.log("Waiting for callback...");
    console.log("\n👉 CLICK THIS LINK TO AUTHENTICATE:");
    console.log(authorizeUrl);
    console.log("\n(If you see a 'Warning' screen, click Advanced -> Go to ... (unsafe))");
});
