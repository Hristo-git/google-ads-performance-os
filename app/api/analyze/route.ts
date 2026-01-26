import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import anthropic from "@/lib/anthropic";

function buildPrompt(data: any): string {
    const { level } = data;

    if (level === 'account') {
        return `You are an expert Google Ads analyst. Analyze the following campaign performance data and provide:
1. A summary of overall performance across all campaigns.
2. Impression Share analysis - identify campaigns losing significant IS due to rank or budget.
3. Top 3 optimization recommendations.
4. Identification of underperforming campaigns.

Campaigns Data:
${JSON.stringify(data.campaigns, null, 2)}

Be concise and actionable. Focus on the most impactful insights.`;
    }

    if (level === 'campaign') {
        return `You are an expert Google Ads analyst. Analyze the following ad groups within a campaign and provide:
1. Quality Score analysis - identify ad groups with low average QS and what might be causing it.
2. Ad Strength assessment - highlight ad groups with poor ads that need attention.
3. Top 3 optimization recommendations for this campaign.
4. Performance bottlenecks and opportunities.

Campaign: ${data.campaign?.name || 'Unknown'}
Ad Groups Data:
${JSON.stringify(data.adGroups, null, 2)}

Be concise and actionable. Focus on QS and Ad Strength improvements.`;
    }

    if (level === 'adgroup') {
        return `You are an expert Google Ads analyst. Analyze the following ad group details and provide:
1. Keyword Quality Score breakdown - identify keywords with low QS and explain the contributing factors (Expected CTR, Ad Relevance, Landing Page Experience).
2. Ad copy recommendations - based on ad strength and headline count, suggest improvements.
3. Negative keyword suggestions - based on the keywords, suggest potential negative keywords to add.
4. Top 3 immediate actions to improve performance.

Ad Group: ${data.adGroup?.name || 'Unknown'}

Keywords Data:
${JSON.stringify(data.keywords, null, 2)}

Ads Data:
${JSON.stringify(data.ads, null, 2)}

Current Negative Keywords:
${JSON.stringify(data.negativeKeywords, null, 2)}

Be specific and actionable. Prioritize quick wins.`;
    }

    return `Analyze this Google Ads data and provide optimization recommendations:\n${JSON.stringify(data, null, 2)}`;
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const data = await request.json();

        // Validate that we have some data to analyze based on level
        const hasData =
            (data.level === 'account' && data.campaigns?.length > 0) ||
            (data.level === 'campaign' && data.adGroups?.length > 0) ||
            (data.level === 'adgroup' && data.adGroup);

        if (!hasData) {
            return NextResponse.json(
                { error: "No data available to analyze" },
                { status: 400 }
            );
        }

        const prompt = buildPrompt(data);

        // Using the verified model: claude-sonnet-4-5-20250929
        const response = await anthropic.messages.create({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 2000,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
        });

        const analysis = response.content[0].type === 'text' ? response.content[0].text : 'No text output';

        return NextResponse.json({ analysis });
    } catch (error: any) {
        console.error("Analysis error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to analyze data" },
            { status: 500 }
        );
    }
}
