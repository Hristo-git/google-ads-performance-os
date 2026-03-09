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

        const rows = await customer.query(`
            SELECT
                campaign.id,
                campaign.name,
                ad_group_criterion.keyword.text,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value,
                metrics.all_conversions,
                metrics.all_conversions_value,
                metrics.clicks,
                metrics.impressions
            FROM keyword_view
            WHERE
                ad_group_criterion.status != 'REMOVED'
                AND ad_group_criterion.negative = FALSE
                AND segments.date BETWEEN '${startDate}' AND '${endDate}'
                AND metrics.impressions > 0
            ORDER BY metrics.all_conversions_value DESC
            LIMIT 5000
        `);

        const keywords = rows.map((row: any) => ({
            campaignId: row.campaign?.id?.toString() || "",
            campaignName: row.campaign?.name || "",
            keywordText: row.ad_group_criterion?.keyword?.text || "",
            cost: Number(row.metrics?.cost_micros) / 1_000_000 || 0,
            conversions: Number(row.metrics?.conversions) || 0,
            conversionValue: Number(row.metrics?.conversions_value) || 0,
            allConversions: Number(row.metrics?.all_conversions) || 0,
            allConversionValue: Number(row.metrics?.all_conversions_value) || 0,
            clicks: Number(row.metrics?.clicks) || 0,
            impressions: Number(row.metrics?.impressions) || 0,
        }));

        return NextResponse.json({ keywords });
    } catch (error: any) {
        console.error("Error fetching keyword DDA data:", error);
        return NextResponse.json({ error: "Failed to fetch keyword DDA data", details: error.message }, { status: 500 });
    }
}
