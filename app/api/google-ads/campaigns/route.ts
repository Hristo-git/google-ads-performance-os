import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getCampaigns, getCampaignTrends, extractApiErrorInfo } from "@/lib/google-ads";


// Mock data for demonstration when API is not available
const mockCampaigns = [
    {
        id: "1",
        name: "Brand Awareness Campaign",
        status: "ENABLED",
        impressions: 125000,
        clicks: 3750,
        cost: 2500.00,
        conversions: 187,
        ctr: 0.03,
        cpc: 0.67,
        searchImpressionShare: 0.72,
        searchTopImpressionShare: 0.45,
        searchLostISRank: 0.18,
        searchLostISBudget: 0.10,
        biddingStrategy: 'TARGET_ROAS',
    },
    {
        id: "2",
        name: "Product Launch - Summer 2024",
        status: "ENABLED",
        impressions: 89000,
        clicks: 4450,
        cost: 3200.00,
        conversions: 312,
        ctr: 0.05,
        cpc: 0.72,
        searchImpressionShare: 0.85,
        searchTopImpressionShare: 0.60,
        searchLostISRank: 0.12,
        searchLostISBudget: 0.03,
        biddingStrategy: 'MAXIMIZE_CONVERSIONS',
    },
    {
        id: "3",
        name: "Retargeting - Cart Abandonment",
        status: "ENABLED",
        impressions: 45000,
        clicks: 2250,
        cost: 1800.00,
        conversions: 225,
        ctr: 0.05,
        cpc: 0.80,
        searchImpressionShare: 0.91,
        searchTopImpressionShare: 0.80,
        searchLostISRank: 0.05,
        searchLostISBudget: 0.04,
        biddingStrategy: 'MANUAL_CPC',
    },
    {
        id: "4",
        name: "Search - High Intent Keywords",
        status: "ENABLED",
        impressions: 67000,
        clicks: 5360,
        cost: 4200.00,
        conversions: 428,
        ctr: 0.08,
        cpc: 0.78,
        searchImpressionShare: 0.68,
        searchTopImpressionShare: 0.30,
        searchLostISRank: 0.32,  // Losing significant IS due to rank!
        searchLostISBudget: 0.00,
        biddingStrategy: 'TARGET_CPA',
    },
    {
        id: "5",
        name: "Display - Competitor Targeting",
        status: "PAUSED",
        impressions: 230000,
        clicks: 1840,
        cost: 920.00,
        conversions: 46,
        ctr: 0.008,
        cpc: 0.50,
        searchImpressionShare: null,  // Display campaign, no search IS
        searchTopImpressionShare: null,
        searchLostISRank: null,
        searchLostISBudget: null,
        biddingStrategy: 'TARGET_ROAS',
    },
];

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json(
                { error: "Unauthorized - Please sign in" },
                { status: 401 }
            );
        }

        try {
            // Strictly use the environment variable for Google Ads access
            const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
            if (!refreshToken) {
                return NextResponse.json(
                    { error: "Configuration Error - Missing Refresh Token" },
                    { status: 500 }
                );
            }

            const { searchParams } = new URL(request.url);
            let customerId = searchParams.get('customerId') || undefined;
            const startDate = searchParams.get('startDate');
            const endDate = searchParams.get('endDate');

            // Access Control: Validate customerId
            const allowedIds = session.user.allowedCustomerIds || [];
            if (session.user.role !== 'admin') {
                if (!customerId && allowedIds.length === 0) {
                    return NextResponse.json(
                        { error: "Forbidden - No accounts assigned" },
                        { status: 403 }
                    );
                }

                // If no specific customer requested, default to the first allowed one (or handle appropriately)
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
            const compareStartDate = searchParams.get('compareStartDate');
            const compareEndDate = searchParams.get('compareEndDate');
            const includeTrends = searchParams.get('includeTrends') === 'true';

            // Fix mismatch: DateRange expects start/end, not startDate/endDate
            const dateRange = (startDate && endDate) ? { start: startDate, end: endDate } : undefined;
            const compareDateRange = (compareStartDate && compareEndDate) ? { start: compareStartDate, end: compareEndDate } : undefined;

            // Fetch data in parallel
            const promises: Promise<any>[] = [
                getCampaigns(refreshToken, customerId, dateRange)
            ];

            if (compareDateRange) {
                promises.push(getCampaigns(refreshToken, customerId, compareDateRange));
            } else {
                promises.push(Promise.resolve(null));
            }

            if (includeTrends && dateRange) {
                promises.push(getCampaignTrends(refreshToken, customerId, dateRange));
            } else {
                promises.push(Promise.resolve(null));
            }

            const [currentCampaigns, previousCampaigns, trendsData] = await Promise.all(promises);

            // Merge data
            const enrichedCampaigns = currentCampaigns.map((camp: any) => {
                const enriched = { ...camp };

                // Add comparison data if available
                if (previousCampaigns) {
                    const prev = previousCampaigns.find((p: any) => p.id === camp.id);
                    if (prev) {
                        enriched.previous = {
                            cost: prev.cost,
                            conversions: prev.conversions,
                            cpa: prev.cpa,
                            roas: prev.roas,
                            clicks: prev.clicks,
                            impressions: prev.impressions
                        };
                    }
                }

                // Add trends if available
                if (trendsData && trendsData[camp.id]) {
                    enriched.trends = trendsData[camp.id];
                }

                return enriched;
            });

            return NextResponse.json({ campaigns: enrichedCampaigns });

        } catch (apiError: any) {
            console.error("Google Ads API error fetching campaigns:", apiError);
            const errorInfo = extractApiErrorInfo(apiError);
            return NextResponse.json({
                error: errorInfo.isQuotaError ? "QUOTA_EXCEEDED" : "Failed to fetch campaigns from Google Ads",
                details: errorInfo.message,
                isQuotaError: errorInfo.isQuotaError,
                retryAfterSeconds: errorInfo.retryAfterSeconds,
            }, { status: errorInfo.isQuotaError ? 429 : 500 });
        }
    } catch (error) {
        console.error("Error fetching campaigns:", error);
        return NextResponse.json(
            { error: "Failed to fetch campaigns" },
            { status: 500 }
        );
    }
}
