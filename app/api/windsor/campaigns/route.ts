import { NextResponse } from "next/server";
import { getGoogleAdsDataFromWindsor } from "@/lib/windsor";

// Helper to determine campaign category for strategic analysis
function getCampaignCategory(name: string): string {
    const n = name.trim().toLowerCase().replace(/\s+/g, ' ');

    // (1) Brand
    if (n.includes('brand') || n.includes('brand protection') ||
        n.includes('бренд') || n.includes('защита')) {
        return 'brand';
    }

    // (2) PMax – Sale
    if (n.includes('pmax') && (
        n.includes('[sale]') || n.includes('sale') || n.includes('promo') ||
        n.includes('promotion') || n.includes('bf') || n.includes('black friday') ||
        n.includes('cyber') || n.includes('discount') || n.includes('намал') ||
        n.includes('промо')
    )) {
        return 'pmax_sale';
    }

    // (3) PMax – AON
    if (n.includes('pmax') && (
        n.includes('[aon]') || n.includes('always on') || n.includes('always-on') || n.includes('aon')
    )) {
        return 'pmax_aon';
    }

    // (4) Search – DSA
    if (n.includes('dsa')) {
        return 'search_dsa';
    }

    // (5) Search – NonBrand
    if (n.includes('sn') || n.includes('search')) {
        return 'search_nonbrand';
    }

    // (6) Video/Display
    if (n.includes('video') || n.includes('display') ||
        n.includes('youtube') || n.includes('yt') ||
        n.includes('dg - video') || n.includes('gdn')) {
        return 'upper_funnel';
    }

    return 'other';
}

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

        // Debug: Log first few raw records to verify conversion_value
        console.log("Windsor.ai raw data sample (first 3 records):", JSON.stringify(data.slice(0, 3), null, 2));

        // Transform Windsor data to match campaign interface
        // Group by campaign and aggregate metrics
        const campaignMap = new Map();

        data.forEach(record => {
            const campaignName = record.campaign;
            if (!campaignMap.has(campaignName)) {
                campaignMap.set(campaignName, {
                    id: campaignName,
                    name: campaignName,
                    status: "ENABLED",
                    impressions: 0,
                    clicks: 0,
                    cost: 0,
                    conversions: 0,
                    conversionValue: 0,
                    // Strategy info (take first non-null)
                    biddingStrategyType: null,
                    advertisingChannelType: null,
                    advertisingChannelSubType: null,
                    targetCpa: null,
                    targetRoas: null,
                    // Weighted averages accumulators
                    _isWeightedSum: 0,
                    _isWeight: 0,
                    _lostRankWeightedSum: 0,
                    _lostRankWeight: 0,
                    _lostBudgetWeightedSum: 0,
                    _lostBudgetWeight: 0,
                    // Top IS
                    _topIsWeightedSum: 0,
                    _topIsWeight: 0,
                    _absTopIsWeightedSum: 0,
                    _absTopIsWeight: 0,
                    _lostRankTopWeightedSum: 0,
                    _lostRankTopWeight: 0,
                    _lostBudgetTopWeightedSum: 0,
                    _lostBudgetTopWeight: 0,
                    // ROAS weighted
                    _roasWeightedSum: 0,
                    _roasWeight: 0,
                    // Asset Group mapping
                    _assetGroupsMap: new Map(),
                });
            }

            const campaign = campaignMap.get(campaignName);
            const recordImpressions = record.impressions || 0;
            const recordCost = record.cost || 0;

            // Aggregate basic metrics
            campaign.impressions += recordImpressions;
            campaign.clicks += record.clicks || 0;
            campaign.cost += recordCost;
            campaign.conversions += record.conversions || 0;
            campaign.conversionValue += record.conversion_value || 0;

            // Strategy info (take first non-null value)
            if (!campaign.biddingStrategyType && record.bidding_strategy_type) {
                campaign.biddingStrategyType = record.bidding_strategy_type;
            }
            if (!campaign.advertisingChannelType && record.advertising_channel_type) {
                campaign.advertisingChannelType = record.advertising_channel_type;
            }
            if (!campaign.advertisingChannelSubType && record.advertising_channel_sub_type) {
                campaign.advertisingChannelSubType = record.advertising_channel_sub_type;
            }
            if (!campaign.targetCpa && record.target_cpa) {
                campaign.targetCpa = record.target_cpa;
            }
            if (!campaign.targetRoas && record.target_roas) {
                campaign.targetRoas = record.target_roas;
            }

            // Aggregate impression share metrics (weighted by impressions)
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

            // Top IS metrics
            if (record.search_top_impression_share != null && recordImpressions > 0) {
                campaign._topIsWeightedSum += record.search_top_impression_share * recordImpressions;
                campaign._topIsWeight += recordImpressions;
            }
            if (record.search_absolute_top_impression_share != null && recordImpressions > 0) {
                campaign._absTopIsWeightedSum += record.search_absolute_top_impression_share * recordImpressions;
                campaign._absTopIsWeight += recordImpressions;
            }
            if (record.search_rank_lost_top_impression_share != null && recordImpressions > 0) {
                campaign._lostRankTopWeightedSum += record.search_rank_lost_top_impression_share * recordImpressions;
                campaign._lostRankTopWeight += recordImpressions;
            }
            if (record.search_budget_lost_top_impression_share != null && recordImpressions > 0) {
                campaign._lostBudgetTopWeightedSum += record.search_budget_lost_top_impression_share * recordImpressions;
                campaign._lostBudgetTopWeight += recordImpressions;
            }

            // ROAS (weighted by cost since it's a cost-based metric)
            if (record.roas != null && recordCost > 0) {
                campaign._roasWeightedSum += record.roas * recordCost;
                campaign._roasWeight += recordCost;
            }

            // Aggregate Asset Group data if present
            if (record.asset_group) {
                const agName = record.asset_group;
                if (!campaign._assetGroupsMap.has(agName)) {
                    campaign._assetGroupsMap.set(agName, {
                        id: agName,
                        campaignId: campaign.id,
                        name: agName,
                        status: "ENABLED",
                        impressions: 0,
                        clicks: 0,
                        cost: 0,
                        conversions: 0,
                        conversionValue: 0,
                    });
                }
                const ag = campaign._assetGroupsMap.get(agName);
                ag.impressions += recordImpressions;
                ag.clicks += record.clicks || 0;
                ag.cost += recordCost;
                ag.conversions += record.conversions || 0;
                ag.conversionValue += record.conversion_value || 0;
            }
        });

        // Calculate final metrics
        const campaigns = Array.from(campaignMap.values()).map(campaign => {
            const category = getCampaignCategory(campaign.name);

            return {
                id: campaign.id,
                name: campaign.name,
                status: campaign.status,
                impressions: campaign.impressions,
                clicks: campaign.clicks,
                cost: campaign.cost,
                conversions: campaign.conversions,
                conversionValue: campaign.conversionValue,
                ctr: campaign.impressions > 0 ? campaign.clicks / campaign.impressions : 0,
                cpc: campaign.clicks > 0 ? campaign.cost / campaign.clicks : 0,
                cpa: campaign.conversions > 0 ? campaign.cost / campaign.conversions : null,
                roas: campaign._roasWeight > 0
                    ? campaign._roasWeightedSum / campaign._roasWeight
                    : (campaign.conversionValue > 0 && campaign.cost > 0 ? campaign.conversionValue / campaign.cost : null),
                // Strategy
                biddingStrategyType: campaign.biddingStrategyType,
                advertisingChannelType: campaign.advertisingChannelType,
                advertisingChannelSubType: campaign.advertisingChannelSubType,
                targetCpa: campaign.targetCpa,
                targetRoas: campaign.targetRoas,
                category: category,
                // Impression Share
                searchImpressionShare: campaign._isWeight > 0
                    ? campaign._isWeightedSum / campaign._isWeight
                    : null,
                searchLostISRank: campaign._lostRankWeight > 0
                    ? campaign._lostRankWeightedSum / campaign._lostRankWeight
                    : null,
                searchLostISBudget: campaign._lostBudgetWeight > 0
                    ? campaign._lostBudgetWeightedSum / campaign._lostBudgetWeight
                    : null,
                // Top IS
                searchTopImpressionShare: campaign._topIsWeight > 0
                    ? campaign._topIsWeightedSum / campaign._topIsWeight
                    : null,
                searchAbsoluteTopImpressionShare: campaign._absTopIsWeight > 0
                    ? campaign._absTopIsWeightedSum / campaign._absTopIsWeight
                    : null,
                searchLostTopISRank: campaign._lostRankTopWeight > 0
                    ? campaign._lostRankTopWeightedSum / campaign._lostRankTopWeight
                    : null,
                searchLostTopISBudget: campaign._lostBudgetTopWeight > 0
                    ? campaign._lostBudgetTopWeightedSum / campaign._lostBudgetTopWeight
                    : null,
                // Asset Groups
                assetGroups: Array.from(campaign._assetGroupsMap.values()).map((ag: any) => ({
                    ...ag,
                    ctr: ag.impressions > 0 ? ag.clicks / ag.impressions : 0,
                    cpc: ag.clicks > 0 ? ag.cost / ag.clicks : 0,
                })),
            };
        });

        // Sort by cost descending (most important campaigns first)
        campaigns.sort((a, b) => b.cost - a.cost);

        // Calculate strategic breakdown
        const totalSpend = campaigns.reduce((sum, c) => sum + c.cost, 0);
        const strategicBreakdown = {
            brand: { spend: 0, percentage: 0, campaigns: 0 },
            pmax_sale: { spend: 0, percentage: 0, campaigns: 0 },
            pmax_aon: { spend: 0, percentage: 0, campaigns: 0 },
            search_dsa: { spend: 0, percentage: 0, campaigns: 0 },
            search_nonbrand: { spend: 0, percentage: 0, campaigns: 0 },
            upper_funnel: { spend: 0, percentage: 0, campaigns: 0 },
            other: { spend: 0, percentage: 0, campaigns: 0 },
        };

        campaigns.forEach(c => {
            const cat = c.category as keyof typeof strategicBreakdown;
            strategicBreakdown[cat].spend += c.cost;
            strategicBreakdown[cat].campaigns += 1;
        });

        // Calculate percentages
        Object.keys(strategicBreakdown).forEach(key => {
            const cat = key as keyof typeof strategicBreakdown;
            strategicBreakdown[cat].percentage = totalSpend > 0
                ? (strategicBreakdown[cat].spend / totalSpend) * 100
                : 0;
        });

        // Debug logging
        console.log("Windsor.ai API Response Summary:");
        console.log(`- Raw records: ${data.length}`);
        console.log(`- Unique campaigns: ${campaigns.length}`);
        console.log(`- Total spend: $${totalSpend.toFixed(2)}`);
        console.log(`- Strategic breakdown:`, strategicBreakdown);
        console.log(`- Sample campaign with new fields:`, campaigns[0]);

        return NextResponse.json({
            campaigns,
            strategicBreakdown,
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
