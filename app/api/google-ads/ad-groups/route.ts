import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getAdGroups } from "@/lib/google-ads";

// Mock data for demonstration
const mockAdGroups = [
    // Brand Awareness Campaign (id: 1)
    {
        id: "101",
        campaignId: "1",
        name: "Brand Terms - Exact Match",
        status: "ENABLED",
        impressions: 45000,
        clicks: 2250,
        cost: 900.00,
        conversions: 112,
        ctr: 0.05,
        cpc: 0.40,
        avgQualityScore: 9.2,
        keywordsWithLowQS: 0,
        adsCount: 3,
        poorAdsCount: 0,
    },
    {
        id: "102",
        campaignId: "1",
        name: "Brand Terms - Broad Match",
        status: "ENABLED",
        impressions: 80000,
        clicks: 1500,
        cost: 1600.00,
        conversions: 75,
        ctr: 0.019,
        cpc: 1.07,
        avgQualityScore: 6.5,
        keywordsWithLowQS: 3,
        adsCount: 2,
        poorAdsCount: 1,  // One ad with poor strength
    },
    // Product Launch Campaign (id: 2)
    {
        id: "201",
        campaignId: "2",
        name: "New Product - Features",
        status: "ENABLED",
        impressions: 34000,
        clicks: 1700,
        cost: 1200.00,
        conversions: 119,
        ctr: 0.05,
        cpc: 0.71,
        avgQualityScore: 7.8,
        keywordsWithLowQS: 1,
        adsCount: 2,
        poorAdsCount: 0,
    },
    {
        id: "202",
        campaignId: "2",
        name: "New Product - Benefits",
        status: "ENABLED",
        impressions: 28000,
        clicks: 1400,
        cost: 1000.00,
        conversions: 98,
        ctr: 0.05,
        cpc: 0.71,
        avgQualityScore: 8.1,
        keywordsWithLowQS: 0,
        adsCount: 2,
        poorAdsCount: 0,
    },
    {
        id: "203",
        campaignId: "2",
        name: "New Product - Comparisons",
        status: "PAUSED",
        impressions: 27000,
        clicks: 1350,
        cost: 1000.00,
        conversions: 95,
        ctr: 0.05,
        cpc: 0.74,
        avgQualityScore: 5.2,  // Low QS!
        keywordsWithLowQS: 4,
        adsCount: 1,
        poorAdsCount: 1,
    },
    // Retargeting Campaign (id: 3)
    {
        id: "301",
        campaignId: "3",
        name: "Cart Abandoners - 24h",
        status: "ENABLED",
        impressions: 20000,
        clicks: 1200,
        cost: 960.00,
        conversions: 144,
        ctr: 0.06,
        cpc: 0.80,
        avgQualityScore: null,  // Display/Retargeting, no QS
        keywordsWithLowQS: 0,
        adsCount: 4,
        poorAdsCount: 0,
    },
    {
        id: "302",
        campaignId: "3",
        name: "Cart Abandoners - 7d",
        status: "ENABLED",
        impressions: 25000,
        clicks: 1050,
        cost: 840.00,
        conversions: 81,
        ctr: 0.042,
        cpc: 0.80,
        avgQualityScore: null,
        keywordsWithLowQS: 0,
        adsCount: 3,
        poorAdsCount: 0,
    },
    // Search Campaign (id: 4) - This one has issues!
    {
        id: "401",
        campaignId: "4",
        name: "High Intent - Buy Now",
        status: "ENABLED",
        impressions: 25000,
        clicks: 2500,
        cost: 2000.00,
        conversions: 225,
        ctr: 0.10,
        cpc: 0.80,
        avgQualityScore: 4.8,  // Poor QS hurting rank!
        keywordsWithLowQS: 5,
        adsCount: 2,
        poorAdsCount: 2,  // Both ads are poor!
    },
    {
        id: "402",
        campaignId: "4",
        name: "High Intent - Best Price",
        status: "ENABLED",
        impressions: 22000,
        clicks: 1760,
        cost: 1400.00,
        conversions: 132,
        ctr: 0.08,
        cpc: 0.80,
        avgQualityScore: 6.2,
        keywordsWithLowQS: 2,
        adsCount: 2,
        poorAdsCount: 1,
    },
    {
        id: "403",
        campaignId: "4",
        name: "High Intent - Reviews",
        status: "ENABLED",
        impressions: 20000,
        clicks: 1100,
        cost: 800.00,
        conversions: 71,
        ctr: 0.055,
        cpc: 0.73,
        avgQualityScore: 7.5,
        keywordsWithLowQS: 1,
        adsCount: 1,
        poorAdsCount: 0,
    },
    // Display Campaign (id: 5)
    {
        id: "501",
        campaignId: "5",
        name: "Competitor Audience - Site A",
        status: "PAUSED",
        impressions: 120000,
        clicks: 960,
        cost: 480.00,
        conversions: 24,
        ctr: 0.008,
        cpc: 0.50,
        avgQualityScore: null,
        keywordsWithLowQS: 0,
        adsCount: 2,
        poorAdsCount: 0,
    },
    {
        id: "502",
        campaignId: "5",
        name: "Competitor Audience - Site B",
        status: "PAUSED",
        impressions: 110000,
        clicks: 880,
        cost: 440.00,
        conversions: 22,
        ctr: 0.008,
        cpc: 0.50,
        avgQualityScore: null,
        keywordsWithLowQS: 0,
        adsCount: 2,
        poorAdsCount: 0,
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
        const campaignId = searchParams.get("campaignId");

        try {
            const adGroups = await getAdGroups(session.refreshToken, campaignId || undefined);
            return NextResponse.json({ adGroups });
        } catch (apiError) {
            console.error("Google Ads API error, using mock data:", apiError);
            // Filter mock data by campaignId if provided
            const filteredAdGroups = campaignId
                ? mockAdGroups.filter(ag => ag.campaignId === campaignId)
                : mockAdGroups;
            return NextResponse.json({
                adGroups: filteredAdGroups,
                _mock: true
            });
        }
    } catch (error) {
        console.error("Error fetching ad groups:", error);
        return NextResponse.json(
            { error: "Failed to fetch ad groups" },
            { status: 500 }
        );
    }
}
