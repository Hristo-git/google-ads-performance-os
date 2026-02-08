import Anthropic from '@anthropic-ai/sdk';
import { authOptions } from "@/lib/auth-options";

// Hardcoded for testing script
const apiKey = process.env.ANTHROPIC_API_KEY || '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';

const anthropic = new Anthropic({ apiKey });

const models = [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-latest',
    'claude-3-opus-20240229',
    'claude-sonnet-4-5-20250929', // FAILED/Non-existent
];

async function checkModels() {
    console.log("Checking Anthropic Models Availability...");
    console.log("-----------------------------------------");

    for (const model of models) {
        process.stdout.write(`Testing: ${model.padEnd(30)} ... `);
        try {
            const msg = await anthropic.messages.create({
                model: model,
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hello' }],
            });
            console.log("✅ AVAILABLE");
        } catch (error: any) {
            if (error.status === 404) {
                console.log("❌ NOT FOUND (Invalid ID)");
            } else if (error.status === 401) {
                console.log("❌ UNAUTHORIZED (Check Key)");
            } else if (error.status === 400 && error.message.includes('model')) {
                console.log("❌ INVALID MODEL");
            } else {
                console.log(`❌ ERROR: ${error.status} - ${error.message}`);
            }
        }
    }
    console.log("-----------------------------------------");
}

checkModels();
