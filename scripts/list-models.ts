import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function listModels() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('❌ ANTHROPIC_API_KEY not found');
        return;
    }

    const anthropic = new Anthropic({ apiKey });

    try {
        console.log("Listing models...");
        const response = await (anthropic as any).models.list();
        console.log(JSON.stringify(response, null, 2));
    } catch (e: any) {
        console.error("Failed to list models:", e.message);

        // Fallback: search for common IDs if list fails
        const commonIds = [
            'claude-3-7-sonnet-20250219',
            'claude-3-7-sonnet-latest',
            'claude-3-5-sonnet-latest',
            'claude-3-5-sonnet-20241022'
        ];
        console.log("\nAttempting to verify common model IDs directly...");
        for (const id of commonIds) {
            try {
                await anthropic.messages.create({
                    model: id,
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'hi' }]
                });
                console.log(`✅ ${id} is AVAILABLE`);
            } catch (err: any) {
                console.log(`❌ ${id} is NOT available (${err.status})`);
            }
        }
    }
}

listModels();
