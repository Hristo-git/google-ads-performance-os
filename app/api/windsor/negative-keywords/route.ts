
import { NextResponse } from "next/server";
import { getNegativeKeywordData } from "@/lib/windsor";

export async function GET(request: Request) {
    try {
        const apiKey = process.env.WINDSOR_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Windsor API key not configured" }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        const datePreset = searchParams.get("date_preset") || "last_30d";
        const campaignFilter = searchParams.get("campaign");
        const adGroupFilter = searchParams.get("adGroup");

        const data = await getNegativeKeywordData(apiKey, datePreset);

        // Deduplicate and filter
        const negatives = data
            .filter(record => {
                if (campaignFilter && record.campaign !== campaignFilter) return false;
                if (adGroupFilter && record.ad_group_name && record.ad_group_name !== adGroupFilter) return false;
                return !!record.negative_keyword_text;
            })
            .map((record, index) => ({
                id: `neg-${index}`,
                text: record.negative_keyword_text,
                matchType: "BROAD", // Windsor filtering limitations, assume broad or unknown
                level: record.ad_group_name ? "AD_GROUP" : "CAMPAIGN",
                campaignName: record.campaign,
                adGroupName: record.ad_group_name
            }));

        return NextResponse.json({ negatives });
    } catch (error) {
        console.error("Error fetching Windsor negatives:", error);
        return NextResponse.json(
            { error: "Failed to fetch negatives" },
            { status: 500 }
        );
    }
}
