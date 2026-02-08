import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Use require to ensure dotenv is loaded first
const anthropic = require("../lib/anthropic").default;

async function debugAnalyze() {
    console.log("🚀 Starting Debug Analysis...");
    console.log("Model: claude-sonnet-4-5-20250929");

    const prompt = `You are an expert Google Ads strategist. Analyze this account.
IMPORTANT: Your entire response MUST be in Bulgarian language.
(Dummy data for testing connectivity)
Total Spend: $1000
Total Conversions: 50
ROAS: 2.0x
`;

    try {
        console.log("Sending request to Anthropic...");
        const response = await anthropic.messages.create({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 1000,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
        });

        console.log("✅ Analysis Success!");
        console.log("Response Preview:", response.content[0].type === 'text' ? response.content[0].text.substring(0, 100) : "No text");

    } catch (error: any) {
        console.error("❌ Analysis Failed!");
        console.error("Error Name:", error.name);
        console.error("Error Message:", error.message);
        console.error("Error Status:", error.status);
        console.error("Full Error Object:", JSON.stringify(error, null, 2));
    }
}

debugAnalyze();
