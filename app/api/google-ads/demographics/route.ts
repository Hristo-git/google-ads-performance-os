import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getDemographicsPerformance, resolveCustomerAccountId } from "@/lib/google-ads";

export const maxDuration = 60;

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized - Please sign in" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        let customerId = searchParams.get("customerId") || undefined;
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const campaignId = searchParams.get("campaignId") || undefined;
        const adGroupId = searchParams.get("adGroupId") || undefined;
        const dateRange = (startDate && endDate) ? { start: startDate, end: endDate } : undefined;

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

            const demographics = await getDemographicsPerformance(refreshToken, customerId, dateRange, campaignId, adGroupId);
            return NextResponse.json({ demographics });

        } catch (apiError: any) {
            console.error("Google Ads API error fetching demographics:", apiError);
            return NextResponse.json({
                error: "Failed to fetch demographics from Google Ads",
                details: apiError?.message || String(apiError)
            }, { status: 500 });
        }
    } catch (error) {
        console.error("Error fetching demographics:", error);
        return NextResponse.json({ error: "Failed to fetch demographics" }, { status: 500 });
    }
}
