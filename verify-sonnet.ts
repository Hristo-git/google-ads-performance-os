import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function verifySonnet() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('❌ ERROR: ANTHROPIC_API_KEY not found in .env.local');
        return;
    }

    const anthropic = new Anthropic({ apiKey });

    console.log("Testing Anthropic Connection...");
    try {
        const response = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 20,
            messages: [{ role: 'user', content: 'Confirm that this model is working.' }],
        });
        if ('text' in response.content[0]) {
            console.log('✅ SUCCESS:', response.content[0].text);
        }
    } catch (error: any) {
        console.error('❌ ERROR:', error.message || error);
    }
}

verifySonnet();
