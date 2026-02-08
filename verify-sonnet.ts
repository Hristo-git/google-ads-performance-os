import Anthropic from '@anthropic-ai/sdk';

async function verifySonnet() {
    const apiKey = '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';

    const anthropic = new Anthropic({ apiKey });

    console.log("Model: claude-sonnet-4-5-20250929");
    try {
        const response = await anthropic.messages.create({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 20,
            messages: [{ role: 'user', content: 'Confirm that this model is working.' }],
        });
        if ('text' in response.content[0]) {
            console.log('✅ SUCCESS:', response.content[0].text);
        }
    } catch (error: any) {
        console.error('❌ ERROR:', error.message || error);
        if (error.status === 429) {
            console.log('ℹ️ Reason: Still hitting Rate Limits. You might need to wait a few more minutes for the Tier update to propagate.');
        }
    }
}

verifySonnet();
