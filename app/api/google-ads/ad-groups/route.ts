import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getAdGroups, getAssetGroups, getCampaigns, AdGroupPerformance, resolveCustomerAccountId } from "@/lib/google-ads";
import { getQSSnapshotsForDate, getAdStrengthSnapshotsForDate } from "@/lib/supabase";

// getAdGroups internally enriches with keywords + ads (3 GAQL queries)
export const maxDuration = 60;

// ... (keep mock data if needed, but I am replacing logic below)

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
            const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
            if (!refreshToken) {
                return NextResponse.json(
                    { error: "Configuration Error - Missing Refresh Token" },
                    { status: 500 }
                );
            }

            // Resolve to a valid client account (not MCC) if not already set
            try {
                customerId = await resolveCustomerAccountId(refreshToken, customerId);
            } catch (e: any) {
                return NextResponse.json({ error: e.message }, { status: 400 });
            }

            console.log(`Fetching ad groups for customerId: ${customerId}, campaignId: ${campaignId}, onlyEnabled: ${onlyEnabled}`);

            const campaignTypeParam = searchParams.get('campaignType') || '';

            let adGroups: AdGroupPerformance[] = [];

            // Helper: normalize channelType to string name — the Google Ads API sometimes
            // returns the proto enum NUMBER (e.g. "10" for PERFORMANCE_MAX) via String()
            const CHANNEL_TYPE_MAP: Record<string, string> = {
                '10': 'PERFORMANCE_MAX',
                '3': 'DISPLAY',
                '4': 'SHOPPING',
                '5': 'HOTEL',
                '6': 'VIDEO',
                '7': 'MULTI_CHANNEL', // also PMax in some contexts
                '9': 'SMART',
                '14': 'DEMAND_GEN',
            };
            const normalizeChannelType = (ct: string) =>
                CHANNEL_TYPE_MAP[ct] ?? ct.toUpperCase();

            const isPMax = (ct: string) => {
                const n = normalizeChannelType(ct);
                return n === 'PERFORMANCE_MAX' || n === 'MULTI_CHANNEL';
            };

            if (campaignId) {
                // Determine campaign type — prefer the param passed by the frontend
                // to avoid an extra getCampaigns() API call.
                let channelType = campaignTypeParam;

                if (!channelType) {
                    // Fallback: fetch campaigns to detect the type
                    const campaigns = await getCampaigns(refreshToken, customerId, dateRange, false, session.user.id);
                    const campaign = campaigns.find(c => c.id === campaignId);
                    channelType = campaign?.advertisingChannelType || '';
                }

                if (isPMax(channelType)) {
                    console.log(`[AdGroups] Detected PMax campaign ${campaignId} (channelType=${channelType}). Fetching Asset Groups.`);
                    adGroups = await getAssetGroups(refreshToken, campaignId, customerId, dateRange, onlyEnabled, session.user.id);
                } else {
                    // Shopping, Search, Display, Video, Demand Gen — all use standard ad_group GAQL
                    adGroups = await getAdGroups(refreshToken, campaignId, customerId, dateRange, onlyEnabled, session.user.id);
                }
            } else {
                // Fetch both standard ad groups and asset groups when no campaign is selected (All Campaigns view)
                // Note: unique ID collision is possible if asset group ID matches an ad group ID (unlikely but possible across entities)
                // But usually we filter by campaign. If we show all, we mix them.
                const [standardGroups, assetGroups] = await Promise.all([
                    getAdGroups(refreshToken, undefined, customerId, dateRange, onlyEnabled, session.user.id),
                    getAssetGroups(refreshToken, undefined, customerId, dateRange, onlyEnabled, session.user.id)
                ]);
                adGroups = [...standardGroups, ...assetGroups];
            }

            console.log(`Fetched ${adGroups.length} items (AdGroups + AssetGroups)`);

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
