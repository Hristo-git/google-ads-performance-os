
import { NextResponse } from "next/server";
import { getAdDataFromWindsor } from "@/lib/windsor";

export async function GET(request: Request) {
    try {
        const apiKey = process.env.WINDSOR_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Windsor API key not configured" }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        const datePreset = searchParams.get("date_preset") || "last_30d";
        const adGroupFilter = searchParams.get("adGroup");

        const data = await getAdDataFromWindsor(apiKey, datePreset);

        const ads = data
            .filter(record => {
                if (adGroupFilter && record.ad_group_name !== adGroupFilter) return false;
                return !!record.ad_name; // Ensure ad content exists
            })
            .map((record, index) => {
                // Parse ad assets from ad_name (for headlines)
                const assets = record.ad_name ? record.ad_name.split('|').map((s: string) => s.trim()) : [];

                // 1. Explicit descriptions
                const explicitDescriptions = [];
                if (record.description1) explicitDescriptions.push(record.description1);
                if (record.description2) explicitDescriptions.push(record.description2);

                const descriptions = [...explicitDescriptions];

                // 2. Fallback: Parse assets for descriptions if we don't have enough
                if (descriptions.length < 4) {
                    const longAssets = assets.filter((s: string) => s.length > 30);
                    // Add unique long assets that aren't already in descriptions
                    longAssets.forEach(a => {
                        if (!descriptions.includes(a) && descriptions.length < 4) descriptions.push(a);
                    });
                }

                // 3. Identify Headlines (short assets not used as descriptions)
                let headlines = assets.filter((s: string) => s.length <= 30 && !descriptions.includes(s));

                // 4. Overflow Heuristic: If we have > 15 headlines, move extra to descriptions if slots available
                if (headlines.length > 15 && descriptions.length < 4) {
                    const overflow = headlines.slice(15);
                    headlines = headlines.slice(0, 15);

                    overflow.forEach(a => {
                        if (descriptions.length < 4) descriptions.push(a);
                    });
                } else {
                    headlines = headlines.slice(0, 15);
                }

                // 5. Emergency Heuristic: If we have 0 descriptions (or very few), steal from headlines
                // Google Ads requires at least 2 descriptions.
                if (descriptions.length < 2 && headlines.length > 3) {
                    // Determine how many to steal (aim for 2 descriptions)
                    const needed = 2 - descriptions.length;
                    const stolen = headlines.splice(-needed, needed);
                    descriptions.push(...stolen);
                }

                return {
                    id: `ad-${index}`,
                    adGroupId: record.ad_group_name, // Removed non-existent ad_group_id
                    type: "RESPONSIVE_SEARCH_AD",
                    adStrength: record.ad_strength || "UNSPECIFIED",
                    headlinesCount: headlines.length,
                    descriptionsCount: descriptions.length,
                    finalUrls: [],
                    headlines: headlines,
                    descriptions: descriptions
                };
            });

        return NextResponse.json({ ads });
    } catch (error) {
        console.error("Error fetching Windsor ads:", error);
        return NextResponse.json(
            { error: "Failed to fetch ads" },
            { status: 500 }
        );
    }
}
