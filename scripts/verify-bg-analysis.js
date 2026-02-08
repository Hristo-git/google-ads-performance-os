const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

// Basic .env parser
function loadEnv(file) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
        const [key, ...value] = line.split('=');
        if (key && value.length > 0) {
            process.env[key.trim()] = value.join('=').trim();
        }
    }
}

try {
    loadEnv(path.resolve(process.cwd(), '.env.local'));
} catch (e) {
    console.error('Failed to load .env.local', e);
}

async function verifyBgAnalysis() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('❌ ERROR: ANTHROPIC_API_KEY not found');
        return;
    }

    const anthropic = new Anthropic({ apiKey });

    console.log('--- Testing Sonnet 4.5 Bulgarian (Raw JS) ---');
    
    const prompt = `You are an expert Google Ads strategist. Analyze this account and provide strategic insights.
IMPORTANT: Your entire response MUST be in Bulgarian language.
=== ACCOUNT TOTALS ===
- Total Spend: $3000
- Total Conversions: 90
- Account ROAS: 3.67x
IMPORTANT: All analysis and recommendations MUST be in Bulgarian.`;

    try {
        const response = await anthropic.messages.create({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 500,
            messages: [{ role: "user", content: prompt }],
        });

        const analysis = response.content[0].type === 'text' ? response.content[0].text : 'No text';
        console.log('\n' + analysis + '\n');
        
        if (analysis.includes('анализ') || analysis.includes('препоръки')) {
            console.log('✅ SUCCESS: Bulgarian detected.');
        } else {
            console.log('❓ Review needed.');
        }
    } catch (error) {
        console.error('❌ ERROR:', error.message);
    }
}

verifyBgAnalysis();
