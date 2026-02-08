
import { NextResponse } from "next/server";
import { getKeywordDataFromWindsor, getGranularQSDataFromWindsor, WindsorGranularQSData } from "@/lib/windsor";

export async function GET(request: Request) {
    try {
        const apiKey = process.env.WINDSOR_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Windsor API key not configured" }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        const datePreset = searchParams.get("date_preset") || "last_30d";
        const adGroupFilter = searchParams.get("adGroup"); // Pass ad group name

        // specific parallel fetch - fetch granular separately to handle failure gracefully
        const data = await getKeywordDataFromWindsor(apiKey, datePreset);

        let granularData: WindsorGranularQSData[] = [];
        try {
            granularData = await getGranularQSDataFromWindsor(apiKey, datePreset);
        } catch (error) {
            console.warn("[Keywords Warning] Failed to fetch Granular QS data (likely API segmentation limit). Proceeding with standard data.", error);
        }

        console.log(`[Keywords Debug] Fetched ${data.length} records, ${granularData.length} granular records. Filter: ${adGroupFilter}`);

        // Create map for granular QS
        const qsMap = new Map<string, WindsorGranularQSData>();
        granularData.forEach(g => {
            // Create a unique key that matches the keyword aggregation key
            const key = `${g.ad_group_name}|${g.keyword_text}`;
            qsMap.set(key, g);
        });

        // Aggregate by Keyword + Match Type
        const keywordMap = new Map();

        data.forEach((record: any) => {
            // Filter by ad group
            if (adGroupFilter && record.ad_group_name !== adGroupFilter) return;
            if (!record.keyword_text) return;

            const key = `${record.ad_group_name}|${record.keyword_text}|${record.match_type}`;

            if (!keywordMap.has(key)) {

                // Lookup Granular QS
                const qsKey = `${record.ad_group_name}|${record.keyword_text}`;
                const granular = qsMap.get(qsKey);

                keywordMap.set(key, {
                    id: `kw-${keywordMap.size}`,
                    adGroupId: record.ad_group_id || record.ad_group_name,
                    text: record.keyword_text,
                    matchType: record.match_type,
                    qualityScore: 0,
                    latestDate: "",
                    expectedCtr: granular?.search_predicted_ctr || "UNSPECIFIED",
                    landingPageExperience: granular?.post_click_quality_score || "UNSPECIFIED",
                    adRelevance: granular?.creative_quality_score || "UNSPECIFIED",
                    impressions: 0,
                    clicks: 0,
                    cost: 0,
                    conversions: 0,
                    conversionValue: 0
                });
            }

            const kw = keywordMap.get(key);
            kw.impressions += record.impressions || 0;
            kw.clicks += record.clicks || 0;
            kw.cost += record.cost || 0;
            kw.conversions += record.conversions || 0;
            kw.conversionValue += record.conversion_value || 0;

            // Take Quality Score (Windsor aggregates or returns latest for the period)
            kw.qualityScore = record.quality_score || kw.qualityScore || null;
        });

        const keywords = Array.from(keywordMap.values());

        // Sort by impressions
        keywords.sort((a: any, b: any) => b.impressions - a.impressions);

        return NextResponse.json({ keywords });
    } catch (error) {
        console.error("Error fetching Windsor keywords:", error);
        return NextResponse.json(
            { error: `Failed to fetch keywords: ${error instanceof Error ? error.message : String(error)}` },
            { status: 500 }
        );
    }
}
