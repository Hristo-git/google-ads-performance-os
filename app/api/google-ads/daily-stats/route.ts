import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getGoogleAdsCustomer } from "@/lib/google-ads";

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId") || undefined;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
        return NextResponse.json({ error: "Missing startDate or endDate" }, { status: 400 });
    }

    // Access control
    const allowedIds = session.user.allowedCustomerIds || [];
    if (session.user.role !== "admin" && customerId && !allowedIds.includes("*") && !allowedIds.includes(customerId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        if (!refreshToken) {
            return NextResponse.json({ error: "Missing Refresh Token" }, { status: 500 });
        }

        const customer = getGoogleAdsCustomer(refreshToken, customerId);

        const result = await customer.query(`
            SELECT
                segments.date,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value,
                metrics.clicks,
                metrics.impressions
            FROM campaign
            WHERE campaign.status != 'REMOVED'
                AND segments.date BETWEEN '${startDate}' AND '${endDate}'
        `);

        // Aggregate by date across all campaigns
        const byDate: Record<string, { date: string; cost: number; conversions: number; conversionValue: number; clicks: number; impressions: number }> = {};

        for (const row of result) {
            const date = row.segments?.date as string;
            if (!date) continue;
            if (!byDate[date]) {
                byDate[date] = { date, cost: 0, conversions: 0, conversionValue: 0, clicks: 0, impressions: 0 };
            }
            byDate[date].cost += Number(row.metrics?.cost_micros) / 1_000_000 || 0;
            byDate[date].conversions += Number(row.metrics?.conversions) || 0;
            byDate[date].conversionValue += Number(row.metrics?.conversions_value) || 0;
            byDate[date].clicks += Number(row.metrics?.clicks) || 0;
            byDate[date].impressions += Number(row.metrics?.impressions) || 0;
        }

        const dailyStats = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

        return NextResponse.json({ dailyStats });
    } catch (error: any) {
        console.error("Error fetching daily stats:", error);
        return NextResponse.json({ error: "Failed to fetch daily stats", details: error.message }, { status: 500 });
    }
}
