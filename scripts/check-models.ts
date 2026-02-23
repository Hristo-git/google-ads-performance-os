import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
    console.error('❌ ERROR: ANTHROPIC_API_KEY not found in .env.local');
    process.exit(1);
}

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
