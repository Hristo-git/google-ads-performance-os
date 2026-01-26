import { NextResponse } from "next/server";
import { getGoogleAdsDataFromWindsor } from "@/lib/windsor";

export async function GET(request: Request) {
    try {
        const apiKey = process.env.WINDSOR_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { error: "Windsor API key not configured" },
                { status: 500 }
            );
        }

        // Get query params for date range
        const { searchParams } = new URL(request.url);
        const datePreset = searchParams.get("date_preset") || "last_30d";

        const data = await getGoogleAdsDataFromWindsor(apiKey, datePreset);

        // Transform Windsor data to match campaign interface
        // Group by campaign and aggregate metrics
        const campaignMap = new Map();

        data.forEach(record => {
            const campaignName = record.campaign;
            if (!campaignMap.has(campaignName)) {
                campaignMap.set(campaignName, {
                    id: campaignName, // Use campaign name as ID
                    name: campaignName,
                    status: "ENABLED", // Windsor doesn't provide status
                    impressions: 0,
                    clicks: 0,
                    cost: 0,
                    conversions: 0,
                    ctr: 0,
                    cpc: 0,
                    // For weighted average of impression share metrics
                    _isWeightedSum: 0,
                    _isWeight: 0,
                    _lostRankWeightedSum: 0,
                    _lostRankWeight: 0,
                    _lostBudgetWeightedSum: 0,
                    _lostBudgetWeight: 0,
                });
            }

            const campaign = campaignMap.get(campaignName);
            const recordImpressions = record.impressions || 0;

            campaign.impressions += recordImpressions;
            campaign.clicks += record.clicks || 0;
            campaign.cost += record.cost || 0;
            campaign.conversions += record.conversions || 0;

            // Aggregate impression share metrics (weighted by impressions)
            // These are percentages (0-1), so we use impression-weighted average
            if (record.search_impression_share != null && recordImpressions > 0) {
                campaign._isWeightedSum += record.search_impression_share * recordImpressions;
                campaign._isWeight += recordImpressions;
            }
            if (record.search_rank_lost_impression_share != null && recordImpressions > 0) {
                campaign._lostRankWeightedSum += record.search_rank_lost_impression_share * recordImpressions;
                campaign._lostRankWeight += recordImpressions;
            }
            if (record.search_budget_lost_impression_share != null && recordImpressions > 0) {
                campaign._lostBudgetWeightedSum += record.search_budget_lost_impression_share * recordImpressions;
                campaign._lostBudgetWeight += recordImpressions;
            }
        });

        // Calculate CTR, CPC, and finalize impression share metrics
        const campaigns = Array.from(campaignMap.values()).map(campaign => ({
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            impressions: campaign.impressions,
            clicks: campaign.clicks,
            cost: campaign.cost,
            conversions: campaign.conversions,
            ctr: campaign.impressions > 0 ? campaign.clicks / campaign.impressions : 0,
            cpc: campaign.clicks > 0 ? campaign.cost / campaign.clicks : 0,
            // Calculate weighted average for impression share metrics
            searchImpressionShare: campaign._isWeight > 0
                ? campaign._isWeightedSum / campaign._isWeight
                : null,
            searchLostISRank: campaign._lostRankWeight > 0
                ? campaign._lostRankWeightedSum / campaign._lostRankWeight
                : null,
            searchLostISBudget: campaign._lostBudgetWeight > 0
                ? campaign._lostBudgetWeightedSum / campaign._lostBudgetWeight
                : null,
        }));

        // Sort by impressions descending
        campaigns.sort((a, b) => b.impressions - a.impressions);

        // Debug logging
        console.log("Windsor.ai API Response Summary:");
        console.log(`- Raw records: ${data.length}`);
        console.log(`- Unique campaigns: ${campaigns.length}`);
        console.log(`- Sample campaign:`, campaigns[0]);
        console.log(`- Total impressions across all campaigns:`, campaigns.reduce((sum, c) => sum + c.impressions, 0));

        return NextResponse.json({
            campaigns,
            source: "windsor.ai",
            datePreset,
        });
    } catch (error) {
        console.error("Error fetching Windsor.ai data:", error);
        return NextResponse.json(
            { error: "Failed to fetch Windsor.ai data", details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
