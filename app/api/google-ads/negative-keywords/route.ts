import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getNegativeKeywords } from "@/lib/google-ads";

// Mock negative keywords for demonstration
const mockNegativeKeywords = [
    // Brand Terms - Exact Match (id: 101)
    { id: "1001", adGroupId: "101", text: "free", matchType: "BROAD" },
    { id: "1002", adGroupId: "101", text: "cheap", matchType: "BROAD" },
    { id: "1003", adGroupId: "101", text: "discount code", matchType: "PHRASE" },
    // Brand Terms - Broad Match (id: 102)
    { id: "1004", adGroupId: "102", text: "reviews", matchType: "BROAD" },
    { id: "1005", adGroupId: "102", text: "complaints", matchType: "EXACT" },
    // New Product - Features (id: 201)
    { id: "2001", adGroupId: "201", text: "used", matchType: "BROAD" },
    { id: "2002", adGroupId: "201", text: "refurbished", matchType: "BROAD" },
    { id: "2003", adGroupId: "201", text: "secondhand", matchType: "BROAD" },
    // New Product - Benefits (id: 202)
    { id: "2004", adGroupId: "202", text: "problems", matchType: "BROAD" },
    { id: "2005", adGroupId: "202", text: "issues", matchType: "BROAD" },
    // High Intent - Buy Now (id: 401)
    { id: "4001", adGroupId: "401", text: "free trial", matchType: "PHRASE" },
    { id: "4002", adGroupId: "401", text: "demo", matchType: "BROAD" },
    { id: "4003", adGroupId: "401", text: "tutorial", matchType: "BROAD" },
    { id: "4004", adGroupId: "401", text: "how to", matchType: "PHRASE" },
    // High Intent - Best Price (id: 402)
    { id: "4005", adGroupId: "402", text: "coupon", matchType: "BROAD" },
    { id: "4006", adGroupId: "402", text: "promo code", matchType: "PHRASE" },
    // Competitor Audience - Site A (id: 501)
    { id: "5001", adGroupId: "501", text: "jobs", matchType: "BROAD" },
    { id: "5002", adGroupId: "501", text: "careers", matchType: "BROAD" },
    { id: "5003", adGroupId: "501", text: "salary", matchType: "BROAD" },
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

        const { searchParams } = new URL(request.url);
        const adGroupId = searchParams.get("adGroupId");
        let customerId = searchParams.get('customerId') || undefined;

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
            const negativeKeywords = await getNegativeKeywords(refreshToken, adGroupId || undefined, customerId);
            return NextResponse.json({ negativeKeywords });
        } catch (apiError) {
            console.error("Google Ads API error, using mock data:", apiError);
            // Filter mock data by adGroupId if provided
            const filteredKeywords = adGroupId
                ? mockNegativeKeywords.filter(kw => kw.adGroupId === adGroupId)
                : mockNegativeKeywords;
            return NextResponse.json({
                negativeKeywords: filteredKeywords,
                _mock: true
            });
        }
    } catch (error) {
        console.error("Error fetching negative keywords:", error);
        return NextResponse.json(
            { error: "Failed to fetch negative keywords" },
            { status: 500 }
        );
    }
}
