import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getAuctionInsights } from "@/lib/google-ads";

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId') || undefined;
    const campaignId = searchParams.get('campaignId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const dateRange = (startDate && endDate) ? { start: startDate, end: endDate } : undefined;

    if (!campaignId) {
        return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }

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
        const data = await getAuctionInsights(refreshToken, campaignId, customerId, dateRange);
        return NextResponse.json({ auctionInsights: data });
    } catch (error) {
        console.error("Error fetching auction insights:", error);
        return NextResponse.json({ error: "Failed to fetch auction insights" }, { status: 500 });
    }
}
