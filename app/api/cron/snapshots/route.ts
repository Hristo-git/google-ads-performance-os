import { NextResponse } from "next/server";
import { getKeywordsWithQS, getAdsWithStrength, getAccessibleCustomers } from "@/lib/google-ads";
import {
    saveQSSnapshots,
    saveAdStrengthSnapshots,
    type QSSnapshot,
    type AdStrengthSnapshot,
    supabaseAdmin
} from "@/lib/supabase";

export const maxDuration = 60; // Hobby-safe: process one account at a time

/**
 * Weekly cron job: Snapshot current Quality Score & Ad Strength
 * Called by Vercel Cron every Monday at 06:00 UTC
 *
 * Security: Vercel Cron sends Authorization header automatically.
 * We also accept a manual ?secret= param for testing.
 */
export async function GET(request: Request) {
    // Verify authorization
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && secret !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    if (!refreshToken) {
        return NextResponse.json({ error: "Missing GOOGLE_ADS_REFRESH_TOKEN" }, { status: 500 });
    }

    const today = new Date().toISOString().split('T')[0];
    const results: { customerId: string; keywords: number; ads: number; error?: string; debug?: { totalKeywords: number; withQS: number } }[] = [];

    try {
        // Discover all customer accounts from user_accounts table
        const { data: accountRows } = await supabaseAdmin
            .from('gads_user_accounts')
            .select('account_id');

        const customerIds = [...new Set((accountRows || []).map(r => r.account_id))].filter(id => id !== '*');

        // If no specific accounts, try the default env var
        if (customerIds.length === 0) {
            const defaultId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, '');
            if (defaultId) customerIds.push(defaultId);
        }

        console.log(`[Cron/Snapshots] Starting for ${customerIds.length} accounts: ${customerIds.join(', ')}`);

        for (const customerId of customerIds) {
            try {
                // Fetch last 30 days for date range (QS needs some impression data)
                const end = new Date();
                const start = new Date(); start.setDate(start.getDate() - 30);
                const dateRange = {
                    start: start.toISOString().split('T')[0],
                    end: end.toISOString().split('T')[0]
                };

                // Fetch keywords with QS (all, not only enabled — paused may be re-enabled)
                const keywords = await getKeywordsWithQS(refreshToken, undefined, customerId, dateRange);
                const withQS = keywords.filter(k => k.qualityScore !== null);
                console.log(`[Cron/Snapshots] ${customerId}: ${keywords.length} total keywords, ${withQS.length} with QS`);
                if (keywords.length > 0 && withQS.length === 0) {
                    // Debug: show first 3 keywords to inspect qualityScore values
                    const sample = keywords.slice(0, 3).map(k => ({
                        id: k.id, text: k.text, qs: k.qualityScore,
                        expectedCtr: k.expectedCtr, impressions: k.impressions
                    }));
                    console.log(`[Cron/Snapshots] ${customerId} sample keywords:`, JSON.stringify(sample));
                }
                const qsSnapshots: QSSnapshot[] = withQS
                    .map(k => ({
                        customer_id: customerId,
                        keyword_id: k.id,
                        ad_group_id: k.adGroupId,
                        quality_score: k.qualityScore,
                        expected_ctr: k.expectedCtr || '',
                        landing_page_experience: k.landingPageExperience || '',
                        ad_relevance: k.adRelevance || '',
                        snapshot_date: today,
                    }));

                const qsSaved = await saveQSSnapshots(qsSnapshots);

                // Fetch ads with strength
                const ads = await getAdsWithStrength(refreshToken, undefined, customerId, undefined, dateRange);
                const adSnapshots: AdStrengthSnapshot[] = ads
                    .filter(a => a.adStrength && a.adStrength !== 'UNSPECIFIED')
                    .map(a => ({
                        customer_id: customerId,
                        ad_id: a.id,
                        ad_group_id: a.adGroupId,
                        ad_strength: a.adStrength,
                        snapshot_date: today,
                    }));

                const adsSaved = await saveAdStrengthSnapshots(adSnapshots);

                results.push({
                    customerId,
                    keywords: qsSaved,
                    ads: adsSaved,
                    debug: { totalKeywords: keywords.length, withQS: withQS.length }
                });
                console.log(`[Cron/Snapshots] ${customerId}: ${qsSaved} QS + ${adsSaved} ads saved`);
            } catch (err: any) {
                console.error(`[Cron/Snapshots] Error for ${customerId}:`, err.message);
                results.push({ customerId, keywords: 0, ads: 0, error: err.message });
            }
        }

        return NextResponse.json({
            success: true,
            date: today,
            accounts: results
        });
    } catch (error: any) {
        console.error("[Cron/Snapshots] Fatal error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
