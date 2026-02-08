import { NextResponse } from "next/server";
import { getAdGroupDataFromWindsor, WindsorAdGroupData } from "@/lib/windsor";

export async function GET(request: Request) {
    try {
        const apiKey = process.env.WINDSOR_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Windsor API key not configured" }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        const datePreset = searchParams.get("date_preset") || "last_30d";
        const campaignFilter = searchParams.get("campaign");

        const data = await getAdGroupDataFromWindsor(apiKey, datePreset);

        // Aggregate by Ad Group
        const adGroupMap = new Map();

        data.forEach(record => {
            // Filter by campaign if provided
            if (campaignFilter && record.campaign !== campaignFilter) return;
            // Skip records without adgroup name (common in PMax)
            if (!record.ad_group_name) return;

            const key = `${record.campaign}|${record.ad_group_name}`;

            if (!adGroupMap.has(key)) {
                adGroupMap.set(key, {
                    id: record.ad_group_id || record.ad_group_name, // Use ID if available, else Name
                    campaignId: record.campaign, // Use name as ID
                    name: record.ad_group_name,
                    status: "ENABLED", // Placeholder
                    impressions: 0,
                    clicks: 0,
                    cost: 0,
                    conversions: 0,
                    ctr: 0,
                    cpc: 0,
                    // Placeholders for QS (populated by separate endpoint usually, but we keep structure consistent)
                    avgQualityScore: null,
                    keywordsWithLowQS: 0,
                    adsCount: 0,
                    poorAdsCount: 0,
                });
            }

            const ag = adGroupMap.get(key);
            ag.impressions += record.impressions || 0;
            ag.clicks += record.clicks || 0;
            ag.cost += record.cost || 0;
            ag.conversions += record.conversions || 0;
        });

        const adGroups = Array.from(adGroupMap.values()).map(ag => ({
            ...ag,
            ctr: ag.impressions > 0 ? ag.clicks / ag.impressions : 0,
            cpc: ag.clicks > 0 ? ag.cost / ag.clicks : 0,
        }));

        // Sort by cost
        adGroups.sort((a, b) => b.cost - a.cost);

        return NextResponse.json({ adGroups });
    } catch (error) {
        console.error("Error fetching Windsor ad groups:", error);
        return NextResponse.json(
            { error: `Failed to fetch ad groups: ${error instanceof Error ? error.message : String(error)}` },
            { status: 500 }
        );
    }
}
