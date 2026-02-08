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
    const aggregate = searchParams.get('aggregate') === 'true'; // For NegativeKeywordMiner: no date/device segmentation

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

        // Query search terms with full metrics and campaign info
        // Aggregate mode: no date/device segmentation for higher coverage (used by NegativeKeywordMiner)
        const query = aggregate
            ? `
            SELECT
                campaign.id,
                campaign.name,
                search_term_view.search_term,
                search_term_view.status,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value
            FROM
                search_term_view
            WHERE
                segments.date BETWEEN '${startDate}' AND '${endDate}'
                AND metrics.impressions > 0
            ORDER BY
                metrics.cost_micros DESC
            LIMIT 10000
            `
            : `
            SELECT
                campaign.id,
                campaign.name,
                ad_group.id,
                ad_group.name,
                search_term_view.search_term,
                search_term_view.status,
                segments.date,
                segments.device,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value,
                metrics.ctr,
                metrics.average_cpc
            FROM
                search_term_view
            WHERE
                segments.date BETWEEN '${startDate}' AND '${endDate}'
                AND metrics.impressions > 0
            ORDER BY
                metrics.cost_micros DESC
            LIMIT 2000
            `;

        const searchTerms = await customer.query(query);
        console.log(`[SearchTermsAPI] Standard Query result count: ${searchTerms.length}`);

        // 2. Fetch PMax Search Insights
        // Simplified PMax query for category labels
        const pmaxQuery = `
            SELECT 
                campaign_search_term_insight.category_label,
                metrics.impressions,
                metrics.clicks,
                metrics.conversions,
                metrics.conversions_value
            FROM 
                campaign_search_term_insight
            WHERE 
                segments.date BETWEEN '${startDate}' AND '${endDate}'
        `;

        let pmaxInsights: any[] = [];
        try {
            console.log(`[SearchTermsAPI] Fetching PMax insights for ${customerId}...`);
            pmaxInsights = await customer.query(pmaxQuery);
            console.log(`[SearchTermsAPI] PMax Insight Query result count: ${pmaxInsights.length}`);
        } catch (e: any) {
            const errorMsg = e.errors ? e.errors.map((err: any) => err.message).join(', ') : e.message;
            console.error('[SearchTermsAPI] PMax insights query failed:', errorMsg || e);
        }

        const formattedSearchTerms = [
            ...searchTerms.map((row: any) => ({
                campaignId: row.campaign.id?.toString() || '',
                campaignName: row.campaign.name || '',
                adGroupId: row.ad_group?.id?.toString() || '',
                adGroupName: row.ad_group?.name || '',
                searchTerm: row.search_term_view.search_term,
                searchTermStatus: String(row.search_term_view?.status) || 'NONE',
                date: row.segments?.date || '',
                device: row.segments?.device ? getDeviceName(row.segments.device) : 'ALL',
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost: Number(row.metrics?.cost_micros) / 1000000 || 0,
                conversions: Number(row.metrics?.conversions) || 0,
                conversionValue: Number(row.metrics?.conversions_value) || 0,
                ctr: row.metrics?.ctr != null ? Number(row.metrics.ctr) : (Number(row.metrics?.clicks) > 0 && Number(row.metrics?.impressions) > 0 ? Number(row.metrics.clicks) / Number(row.metrics.impressions) : 0),
                averageCpc: row.metrics?.average_cpc != null ? Number(row.metrics.average_cpc) / 1000000 : (Number(row.metrics?.clicks) > 0 ? (Number(row.metrics?.cost_micros) / 1000000) / Number(row.metrics.clicks) : 0),
                conversionRate: Number(row.metrics?.clicks) > 0 ? Number(row.metrics?.conversions) / Number(row.metrics?.clicks) : 0,
            })),
            ...pmaxInsights.map((row: any) => ({
                campaignId: '',
                campaignName: 'PMax Insight',
                adGroupId: '',
                adGroupName: '',
                searchTerm: `[PMax Insight] ${row.campaign_search_term_insight.category_label}`,
                searchTermStatus: 'NONE',
                date: '',
                device: 'CROSS_DEVICE',
                impressions: Number(row.metrics?.impressions) || 0,
                clicks: Number(row.metrics?.clicks) || 0,
                cost: 0,
                conversions: Number(row.metrics?.conversions) || 0,
                conversionValue: Number(row.metrics?.conversions_value) || 0,
                ctr: Number(row.metrics?.impressions) > 0 ? Number(row.metrics?.clicks) / Number(row.metrics?.impressions) : 0,
                averageCpc: 0,
                conversionRate: Number(row.metrics?.clicks) > 0 ? Number(row.metrics?.conversions) / Number(row.metrics?.clicks) : 0,
            }))
        ];

        // Sort merged data by conversions then clicks
        formattedSearchTerms.sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks);

        return NextResponse.json({ searchTerms: formattedSearchTerms });

    } catch (error: any) {
        console.error('Error fetching search terms:', error);
        return NextResponse.json({
            error: 'Failed to fetch search terms',
            details: error.message
        }, { status: 500 });
    }
}
