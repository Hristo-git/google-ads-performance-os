import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import {
    getAssetGroups,
    getAssetGroupSignals,
    getAssetGroupListingGroups,
    getPMaxSearchInsights
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
        const status = searchParams.get("status"); // 'ENABLED' or 'ALL'

        if (!campaignId || !customerId) {
            return NextResponse.json({ error: "Missing required parameters: campaignId and customerId" }, { status: 400 });
        }

        // Verify that the user has access to this customer ID
        const userAllowedIds = (session.user as any).allowedCustomerIds || [];
        const userRole = (session.user as any).role;

        if (userRole !== "admin" && !userAllowedIds.includes("*") && !userAllowedIds.includes(customerId)) {
            return NextResponse.json({ error: "Access denied to this customer ID" }, { status: 403 });
        }

        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN!;

        const dateRange = startDate && endDate ? { start: startDate, end: endDate } : undefined;
        const onlyEnabled = status === 'ENABLED';

        // 1. Fetch all Asset Groups for this PMax campaign
        const assetGroups = await getAssetGroups(refreshToken, campaignId, customerId, dateRange, onlyEnabled);

        // 2. Fetch Search Insights for the campaign
        // Note: We might want to add dateRange support to getPMaxSearchInsights in the future
        const searchInsights = await getPMaxSearchInsights(refreshToken, campaignId, customerId);

        // 3. For each Asset Group, fetch Signals and Listing Groups
        const enrichedAssetGroups = await Promise.all(
            assetGroups.map(async (ag) => {
                const [signals, listingGroups] = await Promise.all([
                    getAssetGroupSignals(refreshToken, ag.id, customerId),
                    getAssetGroupListingGroups(refreshToken, ag.id, customerId)
                ]);

                return {
                    ...ag,
                    signals,
                    listingGroups
                };
            })
        );

        return NextResponse.json({
            assetGroups: enrichedAssetGroups,
            searchInsights,
            campaignId
        });
    } catch (error: unknown) {
        console.error("Error fetching detailed PMax data:", error);
        return NextResponse.json(
            {
                error: "Failed to fetch detailed PMax data",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}
