import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getAdsWithStrength, resolveCustomerAccountId } from "@/lib/google-ads";

// Heavy GAQL query with date segmentation — needs extended timeout
export const maxDuration = 60;

// ... (skipping mockAds as they are not used in GET)

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
        let customerId = searchParams.get('customerId');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const status = searchParams.get('status');
        const onlyEnabled = status === 'ENABLED';
        const dateRange = (startDate && endDate) ? { start: startDate, end: endDate } : undefined;

        try {
            const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
            if (!refreshToken) {
                return NextResponse.json(
                    { error: "Configuration Error - Missing Refresh Token" },
                    { status: 500 }
                );
            }

            // Resolve to a valid client account (not MCC) if not already set
            try {
                customerId = await resolveCustomerAccountId(refreshToken, customerId || undefined);
            } catch (e: any) {
                return NextResponse.json({ error: e.message }, { status: 400 });
            }

            // Access Control
            const allowedIds = session.user.allowedCustomerIds || [];
            if (session.user.role !== 'admin') {
                if (customerId && !allowedIds.includes('*') && !allowedIds.includes(customerId)) {
                    return NextResponse.json(
                        { error: "Forbidden - Access to this account is denied" },
                        { status: 403 }
                    );
                }
            }

            // Note: getAdsWithStrength expects adGroupIds as the 4th argument, so we pass undefined there
            const ads = await getAdsWithStrength(refreshToken, adGroupId || undefined, customerId || undefined, undefined, dateRange, onlyEnabled);
            return NextResponse.json({ ads });
        } catch (apiError: any) {
            console.error("Google Ads API error fetching ads:", apiError);
            return NextResponse.json({
                error: "Failed to fetch ads from Google Ads",
                details: apiError?.message || String(apiError)
            }, { status: 500 });
        }
    } catch (error) {
        console.error("Error fetching ads:", error);
        return NextResponse.json(
            { error: "Failed to fetch ads" },
            { status: 500 }
        );
    }
}
