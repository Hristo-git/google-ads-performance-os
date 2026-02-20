import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getKeywordsWithQS, resolveCustomerAccountId } from "@/lib/google-ads";

// GAQL keyword_view query can be slow on large accounts
export const maxDuration = 60;

// ... (skipping mockKeywords as they are not used in GET)

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
        const dateRange = (startDate && endDate) ? { start: startDate, end: endDate } : undefined;

        const status = searchParams.get('status');
        const onlyEnabled = status === 'ENABLED';

        // Quality Score filtering
        const minQS = searchParams.get('minQualityScore') ? Number(searchParams.get('minQualityScore')) : undefined;
        const maxQS = searchParams.get('maxQualityScore') ? Number(searchParams.get('maxQualityScore')) : undefined;

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

            const keywords = await getKeywordsWithQS(refreshToken, adGroupId || undefined, customerId || undefined, dateRange, undefined, minQS, maxQS, onlyEnabled);
            return NextResponse.json({ keywords });
        } catch (apiError: any) {
            console.error("Google Ads API error fetching keywords:", apiError);
            return NextResponse.json({
                error: "Failed to fetch keywords from Google Ads",
                details: apiError?.message || String(apiError)
            }, { status: 500 });
        }
    } catch (error) {
        console.error("Error fetching keywords:", error);
        return NextResponse.json(
            { error: "Failed to fetch keywords" },
            { status: 500 }
        );
    }
}
