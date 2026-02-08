import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getLandingPagePerformance } from "@/lib/google-ads";

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId') || undefined;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const campaignIds = searchParams.get('campaignIds')?.split(',').filter(id => id.length > 0);
    const dateRange = (startDate && endDate) ? { start: startDate, end: endDate } : undefined;

    console.log(`[API/LandingPages] Request:
      - customerId: ${customerId}
      - dateRange: ${JSON.stringify(dateRange)}
      - campaignIds: ${campaignIds?.join(', ') || 'NONE'}
    `);

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
        const data = await getLandingPagePerformance(refreshToken, customerId, dateRange, campaignIds);
        return NextResponse.json({ landingPages: data });
    } catch (error) {
        console.error("Error fetching landing page performance:", error);
        return NextResponse.json({ error: "Failed to fetch landing page performance" }, { status: 500 });
    }
}
