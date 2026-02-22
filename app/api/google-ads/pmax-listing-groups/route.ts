import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getPMaxListingGroups, resolveCustomerAccountId } from "@/lib/google-ads";

export const maxDuration = 60;

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const assetGroupId = searchParams.get("assetGroupId");
        let customerId = searchParams.get("customerId") || undefined;
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const dateRange = (startDate && endDate) ? { start: startDate, end: endDate } : undefined;

        if (!assetGroupId) {
            return NextResponse.json({ error: "assetGroupId is required" }, { status: 400 });
        }

        // Access control
        const allowedIds = session.user.allowedCustomerIds || [];
        if (session.user.role !== "admin") {
            if (!customerId && allowedIds.length > 0) customerId = allowedIds[0];
            if (customerId && !allowedIds.includes("*") && !allowedIds.includes(customerId)) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }

        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        if (!refreshToken) {
            return NextResponse.json({ error: "Missing GOOGLE_ADS_REFRESH_TOKEN" }, { status: 500 });
        }

        try {
            customerId = await resolveCustomerAccountId(refreshToken, customerId);
        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 400 });
        }

        const listingGroups = await getPMaxListingGroups(refreshToken, customerId!, assetGroupId, dateRange);
        return NextResponse.json({ listingGroups });

    } catch (error: any) {
        console.error("Error fetching PMax listing groups:", error);
        return NextResponse.json(
            { error: "Failed to fetch PMax listing groups", details: error?.message || String(error) },
            { status: 500 }
        );
    }
}
