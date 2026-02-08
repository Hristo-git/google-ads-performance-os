import { NextResponse } from 'next/server';
import { getGoogleAdsCustomer } from "@/lib/google-ads";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";

const DEVICE_MAPPING: Record<number, string> = {
    2: 'MOBILE',
    3: 'TABLET',
    4: 'DESKTOP',
    6: 'CONNECTED_TV'
};

function getDeviceName(device: any): string {
    if (typeof device === 'string') return device;
    return DEVICE_MAPPING[device] || 'UNKNOWN';
}

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!customerId || !startDate || !endDate) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    try {
        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        if (!refreshToken) {
            return NextResponse.json({ error: 'Configuration Error - Missing Refresh Token' }, { status: 500 });
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

        const customer = getGoogleAdsCustomer(refreshToken, customerId || undefined);

        // Query campaign device breakdown
        const query = `
            SELECT 
                campaign.id,
                campaign.name,
                segments.device,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value,
                metrics.clicks,
                metrics.impressions,
                metrics.cross_device_conversions,
                metrics.view_through_conversions
            FROM 
                campaign 
            WHERE 
                segments.date BETWEEN '${startDate}' AND '${endDate}'
                AND metrics.impressions > 0
            ORDER BY 
                campaign.id, segments.device
        `;

        const deviceBreakdown = await customer.query(query);

        const formattedData = deviceBreakdown.map((row: any) => ({
            campaignId: row.campaign?.id?.toString() || '',
            campaignName: row.campaign?.name || '',
            device: getDeviceName(row.segments?.device),
            cost: Number(row.metrics?.cost_micros) / 1000000 || 0,
            conversions: Number(row.metrics?.conversions) || 0,
            conversionValue: Number(row.metrics?.conversions_value) || 0,
            clicks: Number(row.metrics?.clicks) || 0,
            impressions: Number(row.metrics?.impressions) || 0,
            crossDeviceConversions: Number(row.metrics?.cross_device_conversions) || 0,
            viewThroughConversions: Number(row.metrics?.view_through_conversions) || 0,
        }));

        return NextResponse.json({ deviceBreakdown: formattedData });

    } catch (error: any) {
        console.error('Error fetching device breakdown:', error);
        return NextResponse.json({
            error: 'Failed to fetch device breakdown',
            details: error.message
        }, { status: 500 });
    }
}
