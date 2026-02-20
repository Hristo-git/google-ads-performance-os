import { NextResponse } from 'next/server';
import { getGoogleAdsCustomer, getAudiencePerformance, resolveCustomerAccountId } from "@/lib/google-ads";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let customerId = searchParams.get('customerId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    try {
        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        if (!refreshToken) {
            return NextResponse.json({ error: 'Configuration Error - Missing Refresh Token' }, { status: 500 });
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

        const dateRange = { start: startDate, end: endDate };

        // Pass userId for API tracking
        const audiences = await getAudiencePerformance(
            refreshToken,
            customerId,
            dateRange,
            undefined,
            session.user.id
        );

        return NextResponse.json({ audiences });

    } catch (error: any) {
        console.error('Error fetching audiences:', error);
        return NextResponse.json({
            error: 'Failed to fetch audiences',
            details: error.message
        }, { status: 500 });
    }
}
