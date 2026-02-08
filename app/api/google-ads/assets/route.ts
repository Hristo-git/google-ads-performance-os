import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getCustomerAssets } from "@/lib/google-ads";
import { DateRange } from "@/lib/google-ads";

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let customerId = searchParams.get("customerId") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    const dateRange: DateRange | undefined = (startDate && endDate)
        ? { start: startDate, end: endDate }
        : undefined;

    // Access Control
    const allowedIds = session.user.allowedCustomerIds || [];
    if (session.user.role !== 'admin') {
        if (!customerId && allowedIds.length > 0) {
            customerId = allowedIds[0];
        }
        if (customerId && !allowedIds.includes('*') && !allowedIds.includes(customerId)) {
            return NextResponse.json(
                { error: "Forbidden - Access to this account is denied" },
                { status: 403 }
            );
        }
    }

    try {
        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        if (!refreshToken) {
            return NextResponse.json(
                { error: "Configuration Error - Missing Refresh Token" },
                { status: 500 }
            );
        }
        const assets = await getCustomerAssets(
            refreshToken,
            customerId,
            dateRange
        );

        return NextResponse.json({ assets });
    } catch (error: any) {
        console.error("Error in /api/google-ads/assets:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch assets" },
            { status: 500 }
        );
    }
}
