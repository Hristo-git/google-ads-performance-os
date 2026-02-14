import { NextResponse } from 'next/server';
import { getKeywordsWithQS, getGoogleAdsCustomer } from '@/lib/google-ads';
import { saveQSSnapshots, QSSnapshot } from '@/lib/supabase';

// CRON job to snapshot Quality Score data for all keywords
// Checks for a valid CRON_SECRET header if configured, otherwise assumes public (not recommended for production).
// For Vercel Cron, you would check the authorization header.

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
        const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;

        if (!refreshToken || !customerId) {
            return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
        }

        console.log('[Cron] Starting Quality Score snapshot...');

        // Fetch all enabled keywords with QS data
        // defaulting to last 30 days metrics just to get the objects, but QS is current snapshot
        const keywords = await getKeywordsWithQS(
            refreshToken,
            undefined,
            customerId,
            undefined, // dateRange default
            undefined, // adGroupIds
            undefined, // minQS
            undefined, // maxQS
            true // onlyEnabled
        );

        console.log(`[Cron] Fetched ${keywords.length} keywords.`);

        const today = new Date().toISOString().split('T')[0];

        const snapshots: QSSnapshot[] = keywords
            .filter(k => k.qualityScore !== null) // Only store if QS exists
            .map(k => ({
                customer_id: customerId,
                keyword_id: k.id,
                ad_group_id: k.adGroupId,
                quality_score: k.qualityScore,
                expected_ctr: k.expectedCtr,
                landing_page_experience: k.landingPageExperience,
                ad_relevance: k.adRelevance,
                snapshot_date: today,
            }));

        if (snapshots.length > 0) {
            const { saved, error } = await saveQSSnapshots(snapshots);
            if (error) {
                throw new Error(error);
            }
            console.log(`[Cron] Successfully saved ${saved} snapshots.`);
            return NextResponse.json({ success: true, saved, date: today });
        } else {
            console.log('[Cron] No keywords with QS found to snapshot.');
            return NextResponse.json({ success: true, saved: 0, message: 'No data to save' });
        }

    } catch (error: any) {
        console.error('[Cron] Error recording Quality Scores:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}
