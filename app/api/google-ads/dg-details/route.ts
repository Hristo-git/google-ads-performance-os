import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import {
    getPlacementsPerformance,
    getDemographicsPerformance,
    getTimeAnalysisPerformance,
    getAdGroups,
    getAssetPerformance,
    getAudiencePerformance
} from "@/lib/google-ads";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const campaignId = searchParams.get("campaignId");
        const customerId = searchParams.get("customerId");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const adGroupId = searchParams.get("adGroupId");

        if (!campaignId || !customerId) {
            return NextResponse.json({ error: "Missing required parameters: campaignId and customerId" }, { status: 400 });
        }

        // Verify that the user has access to this customer ID
        const userAllowedIds = (session.user as any).allowedCustomerIds || [];
        const userRole = (session.user as any).role;

        if (userRole !== "admin" && !userAllowedIds.includes("*") && !userAllowedIds.includes(customerId)) {
            return NextResponse.json({ error: "Access denied to this customer ID" }, { status: 403 });
        }

        const compareStartDate = searchParams.get('compareStartDate');
        const compareEndDate = searchParams.get('compareEndDate');
        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN!;
        const dateRange = startDate && endDate ? { start: startDate, end: endDate } : undefined;
        const compareDateRange = compareStartDate && compareEndDate ? { start: compareStartDate, end: compareEndDate } : undefined;

        // Fetch all reporting data in parallel (Current)
        const [placements, demographics, timeAnalysis, adGroups, assets, audiences] = await Promise.all([
            getPlacementsPerformance(refreshToken, customerId, dateRange, campaignId, adGroupId || undefined),
            getDemographicsPerformance(refreshToken, customerId, dateRange, campaignId, adGroupId || undefined),
            getTimeAnalysisPerformance(refreshToken, customerId, dateRange, campaignId, adGroupId || undefined),
            getAdGroups(refreshToken, campaignId, customerId, dateRange),
            getAssetPerformance(refreshToken, customerId, dateRange, [campaignId]),
            getAudiencePerformance(refreshToken, customerId, dateRange, [campaignId])
        ]);

        // Fetch previous demographics for delta calculation if comparing
        let previousDemographics = null;
        if (compareDateRange) {
            previousDemographics = await getDemographicsPerformance(refreshToken, customerId, compareDateRange, campaignId, adGroupId || undefined);
        }

        return NextResponse.json({
            placements,
            demographics,
            previousDemographics,
            timeAnalysis,
            adGroups,
            assets,
            audiences,
            campaignId
        });
    } catch (error: unknown) {
        console.error("Error fetching Demand Gen details:", error);
        return NextResponse.json(
            {
                error: "Failed to fetch Demand Gen details",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}
