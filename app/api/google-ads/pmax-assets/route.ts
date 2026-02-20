import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getAssetGroupAssets, resolveCustomerAccountId } from "@/lib/google-ads";

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
        const assetGroupId = searchParams.get('assetGroupId');
        let customerId = searchParams.get('customerId');

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

            if (!assetGroupId) {
                return NextResponse.json(
                    { error: "Asset Group ID is required" },
                    { status: 400 }
                );
            }

            const assets = await getAssetGroupAssets(refreshToken, assetGroupId, customerId || undefined);
            return NextResponse.json({ assets });
        } catch (apiError) {
            console.error("Google Ads API error:", apiError);
            return NextResponse.json(
                { error: "Failed to fetch assets" },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error("Error fetching asset group assets:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
