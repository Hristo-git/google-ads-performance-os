import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getAssetGroups, resolveCustomerAccountId } from "@/lib/google-ads";

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
        const campaignId = searchParams.get("campaignId");
        let customerId = searchParams.get('customerId');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
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

            const assetGroups = await getAssetGroups(refreshToken, campaignId || undefined, customerId || undefined, dateRange);
            return NextResponse.json({ assetGroups });
        } catch (apiError) {
            console.error("Google Ads API error (Asset Groups):", apiError);
            return NextResponse.json(
                { error: "Failed to fetch asset groups from API" },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error("Error fetching asset groups:", error);
        return NextResponse.json(
            { error: "Failed to fetch asset groups" },
            { status: 500 }
        );
    }
}
