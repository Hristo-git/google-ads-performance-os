import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getGoogleAdsCustomer, getDateFilter } from "@/lib/google-ads";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const customerId = searchParams.get("customerId");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");

        if (!customerId) {
            return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
        }

        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        if (!refreshToken) {
            return NextResponse.json({ error: "Configuration Error - Missing Refresh Token" }, { status: 500 });
        }

        const dateRange = startDate && endDate ? { start: startDate, end: endDate } : undefined;
        let dateFilter = getDateFilter(dateRange);
        if (!dateFilter) {
            dateFilter = " AND segments.date DURING LAST_30_DAYS";
        }

        const customer = getGoogleAdsCustomer(refreshToken, customerId);

        const results: any = {};

        // Helper to run query and catch error safely
        const runTest = async (name: string, query: string) => {
            try {
                const rows = await customer.query(query);
                results[name] = { status: "Success", count: rows.length, sample: rows.slice(0, 1) };
            } catch (e: any) {
                // Try to extract readable error
                let errorMsg = e.message || "Unknown error";
                let errorDetails = e.errors || e;
                results[name] = {
                    status: "Error",
                    message: errorMsg,
                    details: JSON.stringify(errorDetails, null, 2)
                };
            }
        };

        // 1. Control Query (Simple Campaign Fetch)
        await runTest("1_Control_Campaigns", `
            SELECT campaign.id, campaign.name 
            FROM campaign 
            WHERE campaign.status != 'REMOVED' 
            LIMIT 5
        `);

        // 2. Segment Only (Is the segment field valid?)
        await runTest("2_Segment_Domain", `
            SELECT campaign.id, segments.auction_insight_domain 
            FROM campaign 
            WHERE campaign.status != 'REMOVED' ${dateFilter} 
            LIMIT 5
        `);

        // 3. One Metric (Is the metric field valid?)
        await runTest("3_Metric_ImpressionShare", `
            SELECT campaign.id, metrics.auction_insight_search_impression_share
            FROM campaign 
            WHERE campaign.status != 'REMOVED' ${dateFilter} 
            LIMIT 5
        `);

        // 4. Search Metrics (Failed previously)
        await runTest("4_Search_Metrics", `
            SELECT
                campaign.id,
                segments.auction_insight_domain,
                metrics.auction_insight_search_impression_share
            FROM campaign
            WHERE campaign.status != 'REMOVED' ${dateFilter}
            LIMIT 5
        `);

        // 5. Shopping Metrics (Testing alternative)
        await runTest("5_Shopping_Metrics", `
            SELECT
                campaign.id,
                segments.auction_insight_domain,
                metrics.auction_insight_shopping_impression_share,
                metrics.auction_insight_shopping_overlap_rate,
                metrics.auction_insight_shopping_outranking_share
            FROM campaign
            WHERE campaign.status != 'REMOVED' ${dateFilter}
            LIMIT 5
        `);

        return NextResponse.json({
            customerId,
            dateRange: dateRange || "DEFAULT (LAST_30_DAYS)",
            tests: results
        });

    } catch (error: any) {
        return NextResponse.json({
            error: "Endpoint crashed",
            message: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
