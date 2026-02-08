import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getGeographicPerformance, getRegionalPerformance } from "@/lib/google-ads";

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId') || undefined;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const dateRange = (startDate && endDate) ? { start: startDate, end: endDate } : undefined;

    // Access control
    const allowedIds = session.user.allowedCustomerIds || [];
    if (session.user.role !== 'admin' && customerId && !allowedIds.includes('*') && !allowedIds.includes(customerId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        if (!refreshToken) {
            return NextResponse.json({ error: "Missing Refresh Token" }, { status: 500 });
        }
        const [geoResult, regionalResult] = await Promise.allSettled([
            getGeographicPerformance(refreshToken, customerId, dateRange),
            getRegionalPerformance(refreshToken, customerId, dateRange)
        ]);
        const geographic = geoResult.status === 'fulfilled' ? geoResult.value : [];
        const regional = regionalResult.status === 'fulfilled' ? regionalResult.value : [];
        let regionalError: string | undefined;
        if (regionalResult.status === 'rejected') {
            const err = regionalResult.reason;
            try {
                regionalError = err?.message || err?.errors?.[0]?.message || JSON.stringify(err, null, 2);
            } catch {
                regionalError = String(err);
            }
            console.error("[Geographic] Regional query failed:", JSON.stringify(err, Object.getOwnPropertyNames(err || {}), 2));
        }
        return NextResponse.json({ geographic, regional, regionalError });
    } catch (error) {
        console.error("Error fetching geographic performance:", error);
        return NextResponse.json({ error: "Failed to fetch geographic performance" }, { status: 500 });
    }
}
