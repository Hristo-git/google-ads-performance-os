import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getConversionActions } from "@/lib/google-ads";

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let customerId = searchParams.get('customerId') || undefined;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const dateRange = (startDate && endDate) ? { start: startDate, end: endDate } : undefined;

    // Access control
    const allowedIds = session.user.allowedCustomerIds || [];
    if (session.user.role !== 'admin') {
        if (!customerId && allowedIds.length > 0) customerId = allowedIds[0];
        if (customerId && !allowedIds.includes('*') && !allowedIds.includes(customerId)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
    }

    try {
        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        if (!refreshToken) {
            return NextResponse.json({ error: "Missing Refresh Token" }, { status: 500 });
        }
        const data = await getConversionActions(refreshToken, customerId, dateRange);
        return NextResponse.json({ conversionActions: data });
    } catch (error) {
        console.error("Error fetching conversion actions:", error);
        return NextResponse.json({ error: "Failed to fetch conversion actions" }, { status: 500 });
    }
}
