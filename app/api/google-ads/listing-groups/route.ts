import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getListingGroups, resolveCustomerAccountId } from "@/lib/google-ads";

export const maxDuration = 60;

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized - Please sign in" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const adGroupId = searchParams.get("adGroupId");
        let customerId = searchParams.get("customerId") || undefined;
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const dateRange = (startDate && endDate) ? { start: startDate, end: endDate } : undefined;

        if (!adGroupId) {
            return NextResponse.json({ error: "adGroupId is required" }, { status: 400 });
        }

        // Access Control
        const allowedIds = session.user.allowedCustomerIds || [];
        if (session.user.role !== "admin") {
            if (!customerId && allowedIds.length > 0) customerId = allowedIds[0];
            if (customerId && !allowedIds.includes("*") && !allowedIds.includes(customerId)) {
                return NextResponse.json({ error: "Forbidden - Access denied" }, { status: 403 });
            }
        }

        try {
            const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
            if (!refreshToken) {
                return NextResponse.json({ error: "Configuration Error - Missing Refresh Token" }, { status: 500 });
            }

            try {
                customerId = await resolveCustomerAccountId(refreshToken, customerId);
            } catch (e: any) {
                return NextResponse.json({ error: e.message }, { status: 400 });
            }

            const listingGroups = await getListingGroups(refreshToken, adGroupId, customerId, dateRange);
            return NextResponse.json({ listingGroups });

        } catch (apiError: any) {
            console.error("Google Ads API error fetching listing groups:", apiError);
            return NextResponse.json({
                error: "Failed to fetch listing groups from Google Ads",
                details: apiError?.message || String(apiError)
            }, { status: 500 });
        }
    } catch (error) {
        console.error("Error fetching listing groups:", error);
        return NextResponse.json({ error: "Failed to fetch listing groups" }, { status: 500 });
    }
}
