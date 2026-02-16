import anthropic from './lib/anthropic';

async function verifySonnet() {
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
