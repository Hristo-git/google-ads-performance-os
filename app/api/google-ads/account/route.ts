import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getAccountInfo, extractApiErrorInfo } from "@/lib/google-ads";

// Mock account data for demonstration
const mockAccount = {
    id: "3151945525",
    name: "Demo Google Ads Account",
    currency: "USD",
    timezone: "Europe/Sofia",
};

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
            const { searchParams } = new URL(request.url);
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

            const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
            if (!refreshToken) {
                return NextResponse.json(
                    { error: "Configuration Error - Missing Refresh Token" },
                    { status: 500 }
                );
            }
            const account = await getAccountInfo(refreshToken, customerId);

            if (!account) {
                return NextResponse.json({ error: "Account not found" }, { status: 404 });
            }

            return NextResponse.json({ account });
        } catch (apiError: any) {
            console.error("Google Ads API error fetching account:", apiError);
            const errorInfo = extractApiErrorInfo(apiError);
            return NextResponse.json({
                error: errorInfo.isQuotaError ? "QUOTA_EXCEEDED" : "Failed to fetch account from Google Ads",
                details: errorInfo.message,
                isQuotaError: errorInfo.isQuotaError,
                retryAfterSeconds: errorInfo.retryAfterSeconds,
            }, { status: errorInfo.isQuotaError ? 429 : 500 });
        }
    } catch (error) {
        console.error("Error fetching account info:", error);
        return NextResponse.json(
            { error: "Failed to fetch account info" },
            { status: 500 }
        );
    }
}
