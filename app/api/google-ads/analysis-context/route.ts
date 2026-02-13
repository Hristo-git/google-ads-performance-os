import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import {
    fetchAnalysisContext,
    fetchPMaxContext,
    formatContextForPrompt,
    formatPMaxContextForPrompt,
} from '@/lib/analysis-context';

// Allow up to 120s — parallel Google Ads API calls can be slow
export const maxDuration = 120;

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const language = (searchParams.get('language') || 'bg') as 'bg' | 'en';
    // Comma-separated PMax campaign IDs (optional)
    const pmaxCampaignIds = searchParams.get('pmaxCampaignIds')?.split(',').filter(Boolean) || [];

    if (!customerId || !startDate || !endDate) {
        return NextResponse.json({ error: 'Missing required parameters: customerId, startDate, endDate' }, { status: 400 });
    }

    try {
        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        if (!refreshToken) {
            return NextResponse.json({ error: 'Configuration Error - Missing Refresh Token' }, { status: 500 });
        }

        // Access Control
        const allowedIds = (session.user as any).allowedCustomerIds || [];
        if ((session.user as any).role !== 'admin') {
            if (!allowedIds.includes('*') && !allowedIds.includes(customerId)) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        const dateRange = { start: startDate, end: endDate };

        // Fetch general context + PMax context in parallel
        const [context, pmaxContext] = await Promise.all([
            fetchAnalysisContext(refreshToken, customerId, dateRange),
            pmaxCampaignIds.length > 0
                ? fetchPMaxContext(refreshToken, customerId, dateRange, pmaxCampaignIds)
                : Promise.resolve(null),
        ]);

        // Format for prompt injection
        const contextBlock = formatContextForPrompt(context, language);
        const pmaxBlock = pmaxContext
            ? formatPMaxContextForPrompt(pmaxContext, language)
            : '';

        return NextResponse.json({
            context,
            pmaxContext,
            contextBlock,
            pmaxBlock,
        });

    } catch (error: any) {
        console.error('Error fetching analysis context:', error);
        return NextResponse.json({
            error: 'Failed to fetch analysis context',
            details: error.message,
        }, { status: 500 });
    }
}
