import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getCampaigns } from "@/lib/google-ads";

// Mock data for demonstration when API is not available
const mockCampaigns = [
    {
        id: "1",
        name: "Brand Awareness Campaign",
        status: "ENABLED",
        impressions: 125000,
        clicks: 3750,
        cost: 2500.00,
        conversions: 187,
        ctr: 0.03,
        cpc: 0.67,
        searchImpressionShare: 0.72,
        searchLostISRank: 0.18,
        searchLostISBudget: 0.10,
    },
    {
        id: "2",
        name: "Product Launch - Summer 2024",
        status: "ENABLED",
        impressions: 89000,
        clicks: 4450,
        cost: 3200.00,
        conversions: 312,
        ctr: 0.05,
        cpc: 0.72,
        searchImpressionShare: 0.85,
        searchLostISRank: 0.12,
        searchLostISBudget: 0.03,
    },
    {
        id: "3",
        name: "Retargeting - Cart Abandonment",
        status: "ENABLED",
        impressions: 45000,
        clicks: 2250,
        cost: 1800.00,
        conversions: 225,
        ctr: 0.05,
        cpc: 0.80,
        searchImpressionShare: 0.91,
        searchLostISRank: 0.05,
        searchLostISBudget: 0.04,
    },
    {
        id: "4",
        name: "Search - High Intent Keywords",
        status: "ENABLED",
        impressions: 67000,
        clicks: 5360,
        cost: 4200.00,
        conversions: 428,
        ctr: 0.08,
        cpc: 0.78,
        searchImpressionShare: 0.68,
        searchLostISRank: 0.32,  // Losing significant IS due to rank!
        searchLostISBudget: 0.00,
    },
    {
        id: "5",
        name: "Display - Competitor Targeting",
        status: "PAUSED",
        impressions: 230000,
        clicks: 1840,
        cost: 920.00,
        conversions: 46,
        ctr: 0.008,
        cpc: 0.50,
        searchImpressionShare: null,  // Display campaign, no search IS
        searchLostISRank: null,
        searchLostISBudget: null,
    },
];

export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.refreshToken) {
            return NextResponse.json(
                { error: "Unauthorized - Please sign in" },
                { status: 401 }
            );
        }

        try {
            const campaigns = await getCampaigns(session.refreshToken);
            return NextResponse.json({ campaigns });
        } catch (apiError) {
            console.error("Google Ads API error, using mock data:", apiError);
            // Return mock data when API fails
            return NextResponse.json({
                campaigns: mockCampaigns,
                _mock: true
            });
        }
    } catch (error) {
        console.error("Error fetching campaigns:", error);
        return NextResponse.json(
            { error: "Failed to fetch campaigns" },
            { status: 500 }
        );
    }
}
