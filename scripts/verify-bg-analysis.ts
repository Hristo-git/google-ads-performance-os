import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import path from 'path';

// Force load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function verifyBgAnalysis() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('❌ ERROR: ANTHROPIC_API_KEY not found in .env.local');
        process.exit(1);
    }

    const anthropic = new Anthropic({ apiKey });

    console.log('--- Testing Sonnet 4.5 with Bulgarian Prompt ---');

    const mockData = {
        level: 'account',
        campaigns: [
            { name: 'Brand_Search', cost: 1000, conversions: 50, conversionValue: 5000, clicks: 500, impressions: 5000, category: 'brand' },
            { name: 'Generic_PMax', cost: 2000, conversions: 40, conversionValue: 6000, clicks: 1000, impressions: 20000, category: 'pmax' }
        ]
    };

    // This mimics the buildPrompt logic from route.ts partially to test the core instruction
    const prompt = `You are an expert Google Ads strategist. Analyze this account and provide strategic insights.

IMPORTANT: Your entire response MUST be in Bulgarian language.

=== ACCOUNT TOTALS ===
- Total Spend: $3000
- Total Conversions: 90
- Total Conversion Value: $11000
- Account ROAS: 3.67x

=== ANALYSIS FRAMEWORK ===
Provide insights in this structure:

## 1. Резюме на представянето (Performance Summary)
## 2. Стратегическа оценка (Strategic Assessment)
## 3. Анализ на дела на импресиите (Impression Share Analysis)
## 4. Топ 3 препоръки за оптимизация (Top 3 Optimization Recommendations)
## 5. Флагове за риск (Risk Flags)

IMPORTANT: All analysis and recommendations MUST be in Bulgarian.`;

    try {
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

        const analysis = response.content[0].type === 'text' ? response.content[0].text : 'No text output';

        console.log('\n--- AI Response Start ---');
        console.log(analysis);
        console.log('--- AI Response End ---\n');

        // Basic check for Bulgarian characters or keywords
        const bgKeywords = ['изпълнение', 'кампания', 'анализ', 'препоръки', 'риск'];
        const hasBg = bgKeywords.some(word => analysis.toLowerCase().includes(word));

        if (hasBg) {
            console.log('✅ SUCCESS: Response contains Bulgarian keywords.');
        } else {
            console.warn('⚠️ WARNING: Response might not be in Bulgarian. Please review manually.');
        }

    } catch (error: any) {
        console.error('❌ ERROR:', error.message || error);
    }
}

verifyBgAnalysis();
