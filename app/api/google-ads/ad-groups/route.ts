import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getAdGroups } from "@/lib/google-ads";
import { getQSSnapshotsForDate, getAdStrengthSnapshotsForDate } from "@/lib/supabase";

// getAdGroups internally enriches with keywords + ads (3 GAQL queries)
export const maxDuration = 60;

// Mock data for demonstration
const mockAdGroups = [
    // Brand Awareness Campaign (id: 1)
    {
        id: "101",
        campaignId: "1",
        name: "Brand Terms - Exact Match",
        status: "ENABLED",
        impressions: 45000,
        clicks: 2250,
        cost: 900.00,
        conversions: 112,
        ctr: 0.05,
        cpc: 0.40,
        avgQualityScore: 9.2,
        keywordsWithLowQS: 0,
        adsCount: 3,
        poorAdsCount: 0,
    },
    {
        id: "102",
        campaignId: "1",
        name: "Brand Terms - Broad Match",
        status: "ENABLED",
        impressions: 80000,
        clicks: 1500,
        cost: 1600.00,
        conversions: 75,
        ctr: 0.019,
        cpc: 1.07,
        avgQualityScore: 6.5,
        keywordsWithLowQS: 3,
        adsCount: 2,
        poorAdsCount: 1,  // One ad with poor strength
        adStrength: "AVERAGE",
    },
    // Product Launch Campaign (id: 2)
    {
        id: "201",
        campaignId: "2",
        name: "New Product - Features",
        status: "ENABLED",
        impressions: 34000,
        clicks: 1700,
        cost: 1200.00,
        conversions: 119,
        ctr: 0.05,
        cpc: 0.71,
        avgQualityScore: 7.8,
        keywordsWithLowQS: 1,
        adsCount: 2,
        poorAdsCount: 0,
    },
    {
        id: "202",
        campaignId: "2",
        name: "New Product - Benefits",
        status: "ENABLED",
        impressions: 28000,
        clicks: 1400,
        cost: 1000.00,
        conversions: 98,
        ctr: 0.05,
        cpc: 0.71,
        avgQualityScore: 8.1,
        keywordsWithLowQS: 0,
        adsCount: 2,
        poorAdsCount: 0,
    },
    {
        id: "203",
        campaignId: "2",
        name: "New Product - Comparisons",
        status: "PAUSED",
        impressions: 27000,
        clicks: 1350,
        cost: 1000.00,
        conversions: 95,
        ctr: 0.05,
        cpc: 0.74,
        avgQualityScore: 5.2,  // Low QS!
        keywordsWithLowQS: 4,
        adsCount: 1,
        poorAdsCount: 1,
        adStrength: "POOR",
    },
    // Retargeting Campaign (id: 3)
    {
        id: "301",
        campaignId: "3",
        name: "Cart Abandoners - 24h",
        status: "ENABLED",
        impressions: 20000,
        clicks: 1200,
        cost: 960.00,
        conversions: 144,
        ctr: 0.06,
        cpc: 0.80,
        avgQualityScore: null,  // Display/Retargeting, no QS
        keywordsWithLowQS: 0,
        adsCount: 4,
        poorAdsCount: 0,
        adStrength: "GOOD",
    },
    {
        id: "302",
        campaignId: "3",
        name: "Cart Abandoners - 7d",
        status: "ENABLED",
        impressions: 25000,
        clicks: 1050,
        cost: 840.00,
        conversions: 81,
        ctr: 0.042,
        cpc: 0.80,
        avgQualityScore: null,
        keywordsWithLowQS: 0,
        adsCount: 3,
        poorAdsCount: 0,
    },
    // Search Campaign (id: 4) - This one has issues!
    {
        id: "401",
        campaignId: "4",
        name: "High Intent - Buy Now",
        status: "ENABLED",
        impressions: 25000,
        clicks: 2500,
        cost: 2000.00,
        conversions: 225,
        ctr: 0.10,
        cpc: 0.80,
        avgQualityScore: 4.8,  // Poor QS hurting rank!
        keywordsWithLowQS: 5,
        adsCount: 2,
        poorAdsCount: 2,  // Both ads are poor!
        adStrength: "POOR",
    },
    {
        id: "402",
        campaignId: "4",
        name: "High Intent - Best Price",
        status: "ENABLED",
        impressions: 22000,
        clicks: 1760,
        cost: 1400.00,
        conversions: 132,
        ctr: 0.08,
        cpc: 0.80,
        avgQualityScore: 6.2,
        keywordsWithLowQS: 2,
        adsCount: 2,
        poorAdsCount: 1,
        adStrength: "AVERAGE",
    },
    {
        id: "403",
        campaignId: "4",
        name: "High Intent - Reviews",
        status: "ENABLED",
        impressions: 20000,
        clicks: 1100,
        cost: 800.00,
        conversions: 71,
        ctr: 0.055,
        cpc: 0.73,
        avgQualityScore: 7.5,
        keywordsWithLowQS: 1,
        adsCount: 1,
        poorAdsCount: 0,
        adStrength: "GOOD",
    },
    // Display Campaign (id: 5)
    {
        id: "501",
        campaignId: "5",
        name: "Competitor Audience - Site A",
        status: "PAUSED",
        impressions: 120000,
        clicks: 960,
        cost: 480.00,
        conversions: 24,
        ctr: 0.008,
        cpc: 0.50,
        avgQualityScore: null,
        keywordsWithLowQS: 0,
        adsCount: 2,
        poorAdsCount: 0,
    },
    {
        id: "502",
        campaignId: "5",
        name: "Competitor Audience - Site B",
        status: "PAUSED",
        impressions: 110000,
        clicks: 880,
        cost: 440.00,
        conversions: 22,
        ctr: 0.008,
        cpc: 0.50,
        avgQualityScore: null,
        keywordsWithLowQS: 0,
        adsCount: 2,
        poorAdsCount: 0,
    },
];

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
        let customerId = searchParams.get('customerId') || undefined;
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const status = searchParams.get('status');
        const onlyEnabled = status === 'ENABLED';
        const dateRange = (startDate && endDate) ? { start: startDate, end: endDate } : undefined;

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

        try {
            console.log(`Fetching ad groups for customerId: ${customerId}, campaignId: ${campaignId}, onlyEnabled: ${onlyEnabled}`);
            const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
            if (!refreshToken) {
                return NextResponse.json(
                    { error: "Configuration Error - Missing Refresh Token" },
                    { status: 500 }
                );
            }
            const adGroups = await getAdGroups(refreshToken, campaignId || undefined, customerId, dateRange, onlyEnabled, session.user.id);
            console.log(`Fetched ${adGroups.length} ad groups`);

            // Enrich with snapshot data for historical periods (end date > 7 days ago)
            let snapshotDate: string | null = null;
            if (endDate && customerId) {
                const endDateObj = new Date(endDate);
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const diffDays = Math.floor((today.getTime() - endDateObj.getTime()) / (1000 * 60 * 60 * 24));

                if (diffDays > 7) {
                    try {
                        const [qsSnapshots, adSnapshots] = await Promise.all([
                            getQSSnapshotsForDate(customerId, endDate),
                            getAdStrengthSnapshotsForDate(customerId, endDate)
                        ]);

                        if (qsSnapshots.length > 0 || adSnapshots.length > 0) {
                            snapshotDate = qsSnapshots[0]?.snapshot_date || adSnapshots[0]?.snapshot_date || null;

                            // Build lookup maps: ad_group_id → aggregated QS / ad strength
                            const qsByAdGroup = new Map<string, { totalWeightedQS: number; totalCount: number; lowCount: number }>();
                            for (const snap of qsSnapshots) {
                                const existing = qsByAdGroup.get(snap.ad_group_id) || { totalWeightedQS: 0, totalCount: 0, lowCount: 0 };
                                if (snap.quality_score !== null) {
                                    existing.totalWeightedQS += snap.quality_score;
                                    existing.totalCount += 1;
                                    if (snap.quality_score < 5) existing.lowCount += 1;
                                }
                                qsByAdGroup.set(snap.ad_group_id, existing);
                            }

                            const adsByAdGroup = new Map<string, { total: number; poor: number; bestStrength: string }>();
                            const STRENGTH_ORDER: Record<string, number> = { EXCELLENT: 4, GOOD: 3, AVERAGE: 2, POOR: 1 };
                            for (const snap of adSnapshots) {
                                const existing = adsByAdGroup.get(snap.ad_group_id) || { total: 0, poor: 0, bestStrength: 'POOR' };
                                existing.total += 1;
                                if (snap.ad_strength === 'POOR') existing.poor += 1;
                                if ((STRENGTH_ORDER[snap.ad_strength] || 0) > (STRENGTH_ORDER[existing.bestStrength] || 0)) {
                                    existing.bestStrength = snap.ad_strength;
                                }
                                adsByAdGroup.set(snap.ad_group_id, existing);
                            }

                            // Override QS and Ad Strength values with snapshot data
                            for (const ag of adGroups) {
                                const qsData = qsByAdGroup.get(ag.id);
                                if (qsData && qsData.totalCount > 0) {
                                    (ag as any).avgQualityScore = Number((qsData.totalWeightedQS / qsData.totalCount).toFixed(1));
                                    (ag as any).keywordsWithLowQS = qsData.lowCount;
                                }
                                const adsData = adsByAdGroup.get(ag.id);
                                if (adsData) {
                                    (ag as any).poorAdsCount = adsData.poor;
                                    (ag as any).adStrength = adsData.bestStrength;
                                    (ag as any).adsCount = adsData.total;
                                }
                            }

                            console.log(`[AdGroups] Enriched with snapshots from ${snapshotDate}: ${qsSnapshots.length} QS, ${adSnapshots.length} ads`);
                        }
                    } catch (snapErr) {
                        console.warn('[AdGroups] Snapshot enrichment failed (using current data):', snapErr);
                    }
                }
            }

            return NextResponse.json({ adGroups, snapshotDate });
        } catch (apiError: any) {
            console.error("Google Ads API error fetching ad groups:", apiError);
            return NextResponse.json({
                error: "Failed to fetch ad groups from Google Ads",
                details: apiError?.message || String(apiError)
            }, { status: 500 });
        }
    } catch (error) {
        console.error("Error fetching ad groups:", error);
        return NextResponse.json(
            { error: "Failed to fetch ad groups" },
            { status: 500 }
        );
    }
}
