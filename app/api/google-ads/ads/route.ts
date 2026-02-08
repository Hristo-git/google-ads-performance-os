import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getAdsWithStrength } from "@/lib/google-ads";

// Mock ads with Ad Strength data
const mockAds = [
    // High Intent - Buy Now (id: 401) - Poor ads
    {
        id: "ad4011",
        adGroupId: "401",
        type: "RESPONSIVE_SEARCH_AD",
        adStrength: "POOR",
        headlinesCount: 6,  // Only 6 of 15 headlines!
        descriptionsCount: 2,  // Only 2 of 4 descriptions!
        finalUrls: ["https://example.com/buy"],
        headlines: [
            "Buy Now",
            "Best Product",
            "Order Today",
            "Fast Shipping",
            "Quality Guaranteed",
            "Shop Now"
        ],
    },
    {
        id: "ad4012",
        adGroupId: "401",
        type: "RESPONSIVE_SEARCH_AD",
        adStrength: "POOR",
        headlinesCount: 5,
        descriptionsCount: 2,
        finalUrls: ["https://example.com/shop"],
        headlines: [
            "Shop Online",
            "Great Deals",
            "Buy Direct",
            "Save Money",
            "Limited Offer"
        ],
    },
    // High Intent - Best Price (id: 402)
    {
        id: "ad4021",
        adGroupId: "402",
        type: "RESPONSIVE_SEARCH_AD",
        adStrength: "AVERAGE",
        headlinesCount: 10,
        descriptionsCount: 3,
        finalUrls: ["https://example.com/deals"],
        headlines: [
            "Best Prices Guaranteed",
            "Lowest Price Online",
            "Save Up To 50%",
            "Unbeatable Deals",
            "Price Match Promise",
            "Discount Available",
            "Special Offer Today",
            "Flash Sale Now",
            "Budget Friendly",
            "Value For Money"
        ],
    },
    {
        id: "ad4022",
        adGroupId: "402",
        type: "RESPONSIVE_SEARCH_AD",
        adStrength: "POOR",
        headlinesCount: 7,
        descriptionsCount: 2,
        finalUrls: ["https://example.com/discount"],
        headlines: [
            "Cheap Prices",
            "Discount Deals",
            "Low Cost Option",
            "Affordable Choice",
            "Budget Option",
            "Money Saver",
            "Economic Choice"
        ],
    },
    // Brand Terms - Exact Match (id: 101) - Excellent ads
    {
        id: "ad1011",
        adGroupId: "101",
        type: "RESPONSIVE_SEARCH_AD",
        adStrength: "EXCELLENT",
        headlinesCount: 15,
        descriptionsCount: 4,
        finalUrls: ["https://example.com/brand"],
        headlines: [
            "Official Brand Store",
            "Authentic Products Only",
            "Brand Name Quality",
            "Trusted Since 2010",
            "Award Winning Service",
            "Customer Favorite",
            "5 Star Rated",
            "Premium Selection",
            "Exclusive Offers",
            "Free Shipping Available",
            "Easy Returns",
            "24/7 Support",
            "Money Back Guarantee",
            "Best in Class",
            "Industry Leader"
        ],
    },
    {
        id: "ad1012",
        adGroupId: "101",
        type: "RESPONSIVE_SEARCH_AD",
        adStrength: "GOOD",
        headlinesCount: 12,
        descriptionsCount: 4,
        finalUrls: ["https://example.com/official"],
        headlines: [
            "Official Website",
            "Genuine Products",
            "Brand Authorized",
            "Quality Assured",
            "Trusted Retailer",
            "Premium Quality",
            "Best Service",
            "Great Reviews",
            "Top Rated",
            "Customer Choice",
            "Reliable Delivery",
            "Secure Shopping"
        ],
    },
    {
        id: "ad1013",
        adGroupId: "101",
        type: "RESPONSIVE_SEARCH_AD",
        adStrength: "GOOD",
        headlinesCount: 11,
        descriptionsCount: 3,
        finalUrls: ["https://example.com/store"],
        headlines: [
            "Brand Store",
            "Shop Official",
            "Original Products",
            "Verified Seller",
            "Trusted Brand",
            "Quality First",
            "Best Value",
            "Top Service",
            "Free Returns",
            "Fast Delivery",
            "Secure Checkout"
        ],
    },
    // New Product - Comparisons (id: 203) - Poor ad
    {
        id: "ad2031",
        adGroupId: "203",
        type: "RESPONSIVE_SEARCH_AD",
        adStrength: "POOR",
        headlinesCount: 4,  // Very few headlines!
        descriptionsCount: 1,  // Only 1 description!
        finalUrls: ["https://example.com/compare"],
        headlines: [
            "Compare Products",
            "Best Comparison",
            "See Differences",
            "Compare Now"
        ],
    },
    // Brand Terms - Broad Match (id: 102)
    {
        id: "ad1021",
        adGroupId: "102",
        type: "RESPONSIVE_SEARCH_AD",
        adStrength: "AVERAGE",
        headlinesCount: 9,
        descriptionsCount: 3,
        finalUrls: ["https://example.com/products"],
        headlines: [
            "Brand Products",
            "Quality Items",
            "Shop Collection",
            "Browse Selection",
            "Find Your Style",
            "Explore Range",
            "Discover More",
            "New Arrivals",
            "Best Sellers"
        ],
    },
    {
        id: "ad1022",
        adGroupId: "102",
        type: "RESPONSIVE_SEARCH_AD",
        adStrength: "POOR",
        headlinesCount: 5,
        descriptionsCount: 2,
        finalUrls: ["https://example.com/all"],
        headlines: [
            "All Products",
            "Full Range",
            "Everything",
            "Complete Collection",
            "All Items"
        ],
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

        const { searchParams } = new URL(request.url);
        const adGroupId = searchParams.get("adGroupId");
        let customerId = searchParams.get('customerId') || undefined;
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const status = searchParams.get('status');
        const onlyEnabled = status === 'ENABLED';
        const dateRange = (startDate && endDate) ? { start: startDate, end: endDate } : undefined;

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
            // Note: getAdsWithStrength expects adGroupIds as the 4th argument, so we pass undefined there
            const ads = await getAdsWithStrength(refreshToken, adGroupId || undefined, customerId, undefined, dateRange, onlyEnabled);
            return NextResponse.json({ ads });
        } catch (apiError) {
            console.error("Google Ads API error, using mock data:", apiError);
            const filteredAds = adGroupId
                ? mockAds.filter(ad => ad.adGroupId === adGroupId)
                : mockAds;
            return NextResponse.json({
                ads: filteredAds,
                _mock: true
            });
        }
    } catch (error) {
        console.error("Error fetching ads:", error);
        return NextResponse.json(
            { error: "Failed to fetch ads" },
            { status: 500 }
        );
    }
}
