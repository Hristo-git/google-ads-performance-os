import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getKeywordsWithQS } from "@/lib/google-ads";

// Mock keywords with Quality Score data
const mockKeywords = [
    // High Intent - Buy Now (id: 401) - Poor QS ad group
    {
        id: "k4011",
        adGroupId: "401",
        text: "buy product online",
        matchType: "EXACT",
        qualityScore: 4,
        expectedCtr: "BELOW_AVERAGE",
        landingPageExperience: "AVERAGE",
        adRelevance: "BELOW_AVERAGE",
        impressions: 8000,
        clicks: 800,
        cost: 640.00,
    },
    {
        id: "k4012",
        adGroupId: "401",
        text: "purchase now",
        matchType: "PHRASE",
        qualityScore: 3,
        expectedCtr: "BELOW_AVERAGE",
        landingPageExperience: "BELOW_AVERAGE",
        adRelevance: "BELOW_AVERAGE",
        impressions: 5000,
        clicks: 450,
        cost: 360.00,
    },
    {
        id: "k4013",
        adGroupId: "401",
        text: "order today",
        matchType: "BROAD",
        qualityScore: 5,
        expectedCtr: "AVERAGE",
        landingPageExperience: "BELOW_AVERAGE",
        adRelevance: "AVERAGE",
        impressions: 6000,
        clicks: 600,
        cost: 480.00,
    },
    {
        id: "k4014",
        adGroupId: "401",
        text: "best deals",
        matchType: "PHRASE",
        qualityScore: 6,
        expectedCtr: "AVERAGE",
        landingPageExperience: "AVERAGE",
        adRelevance: "AVERAGE",
        impressions: 4000,
        clicks: 400,
        cost: 320.00,
    },
    {
        id: "k4015",
        adGroupId: "401",
        text: "instant buy",
        matchType: "EXACT",
        qualityScore: 5,
        expectedCtr: "BELOW_AVERAGE",
        landingPageExperience: "AVERAGE",
        adRelevance: "AVERAGE",
        impressions: 2000,
        clicks: 250,
        cost: 200.00,
    },
    // Brand Terms - Exact Match (id: 101) - High QS
    {
        id: "k1011",
        adGroupId: "101",
        text: "[brand name]",
        matchType: "EXACT",
        qualityScore: 10,
        expectedCtr: "ABOVE_AVERAGE",
        landingPageExperience: "ABOVE_AVERAGE",
        adRelevance: "ABOVE_AVERAGE",
        impressions: 25000,
        clicks: 1500,
        cost: 450.00,
    },
    {
        id: "k1012",
        adGroupId: "101",
        text: "[brand product]",
        matchType: "EXACT",
        qualityScore: 9,
        expectedCtr: "ABOVE_AVERAGE",
        landingPageExperience: "ABOVE_AVERAGE",
        adRelevance: "AVERAGE",
        impressions: 15000,
        clicks: 600,
        cost: 300.00,
    },
    {
        id: "k1013",
        adGroupId: "101",
        text: "[official brand]",
        matchType: "EXACT",
        qualityScore: 9,
        expectedCtr: "ABOVE_AVERAGE",
        landingPageExperience: "AVERAGE",
        adRelevance: "ABOVE_AVERAGE",
        impressions: 5000,
        clicks: 150,
        cost: 150.00,
    },
    // High Intent - Best Price (id: 402)
    {
        id: "k4021",
        adGroupId: "402",
        text: "best price product",
        matchType: "PHRASE",
        qualityScore: 7,
        expectedCtr: "AVERAGE",
        landingPageExperience: "AVERAGE",
        adRelevance: "ABOVE_AVERAGE",
        impressions: 10000,
        clicks: 800,
        cost: 640.00,
    },
    {
        id: "k4022",
        adGroupId: "402",
        text: "cheapest deals",
        matchType: "BROAD",
        qualityScore: 5,
        expectedCtr: "BELOW_AVERAGE",
        landingPageExperience: "AVERAGE",
        adRelevance: "AVERAGE",
        impressions: 8000,
        clicks: 600,
        cost: 480.00,
    },
    {
        id: "k4023",
        adGroupId: "402",
        text: "discount product",
        matchType: "PHRASE",
        qualityScore: 6,
        expectedCtr: "AVERAGE",
        landingPageExperience: "BELOW_AVERAGE",
        adRelevance: "AVERAGE",
        impressions: 4000,
        clicks: 360,
        cost: 280.00,
    },
];

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.refreshToken) {
            return NextResponse.json(
                { error: "Unauthorized - Please sign in" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const adGroupId = searchParams.get("adGroupId");

        try {
            const keywords = await getKeywordsWithQS(session.refreshToken, adGroupId || undefined);
            return NextResponse.json({ keywords });
        } catch (apiError) {
            console.error("Google Ads API error, using mock data:", apiError);
            const filteredKeywords = adGroupId
                ? mockKeywords.filter(kw => kw.adGroupId === adGroupId)
                : mockKeywords;
            return NextResponse.json({
                keywords: filteredKeywords,
                _mock: true
            });
        }
    } catch (error) {
        console.error("Error fetching keywords:", error);
        return NextResponse.json(
            { error: "Failed to fetch keywords" },
            { status: 500 }
        );
    }
}
