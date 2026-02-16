import { prepareSearchTermData } from "../lib/ai-data-prep";
import { SearchTerm, AuctionInsight, ConversionActionBreakdown, AudiencePerformance, NetworkPerformance, PMaxProductPerformance, CampaignPerformance } from "../types/google-ads";
import { buildAdvancedAnalysisPrompt } from "../lib/prompts-v2";

const mockSearchTerms: SearchTerm[] = [
    {
        searchTerm: "videnov mebeli",
        date: "2023-10-01",
        device: "MOBILE",
        impressions: 1000,
        clicks: 100,
        cost: 50.0,
        conversions: 10,
        conversionValue: 500.0,
        ctr: 0.1,
        averageCpc: 0.5,
        conversionRate: 0.1,
        campaignName: "Brand Campaign",
        campaignId: "123"
    },
    {
        searchTerm: "corner sofa",
        date: "2023-10-01",
        device: "DESKTOP",
        impressions: 500,
        clicks: 20,
        cost: 20.0,
        conversions: 1,
        conversionValue: 150.0,
        ctr: 0.04,
        averageCpc: 1.0,
        conversionRate: 0.05,
        campaignName: "Generic Campaign",
        campaignId: "456"
    },
    {
        searchTerm: "corner sofa", // Cross-campaign term
        date: "2023-10-02",
        device: "MOBILE",
        impressions: 200,
        clicks: 10,
        cost: 10.0,
        conversions: 0,
        conversionValue: 0.0,
        ctr: 0.05,
        averageCpc: 1.0,
        conversionRate: 0.0,
        campaignName: "Competitor Campaign", // Distinct campaign
        campaignId: "789"
    }
];

const mockCampaigns: CampaignPerformance[] = [
    {
        id: "123",
        name: "Brand Campaign",
        status: "ENABLED",
        cost: 1000,
        conversions: 200,
        conversionValue: 10000,
        advertisingChannelType: "SEARCH",
        biddingStrategyType: "TARGET_ROAS",
        impressions: 5000,
        clicks: 500,
        ctr: 0.1,
        cpc: 2.0,
        searchImpressionShare: 0.9,
        searchLostISRank: 0.05,
        searchLostISBudget: 0.05
    },
    {
        id: "456",
        name: "Generic Campaign",
        status: "ENABLED",
        cost: 2000,
        conversions: 50,
        conversionValue: 2000,
        advertisingChannelType: "SEARCH",
        biddingStrategyType: "MAXIMIZE_CONVERSIONS",
        impressions: 10000,
        clicks: 200,
        ctr: 0.02,
        cpc: 10.0,
        searchImpressionShare: 0.6,
        searchLostISRank: 0.2,
        searchLostISBudget: 0.2
    },
    {
        id: "789",
        name: "Competitor Campaign",
        status: "ENABLED",
        cost: 500,
        conversions: 10,
        conversionValue: 500,
        advertisingChannelType: "SEARCH",
        biddingStrategyType: "MANUAL_CPC",
        impressions: 2000,
        clicks: 100,
        ctr: 0.05,
        cpc: 5.0,
        searchImpressionShare: 0.4,
        searchLostISRank: 0.3,
        searchLostISBudget: 0.3
    }
];

const mockAuctionInsights: AuctionInsight[] = [
    {
        campaignId: "456",
        competitor: "competitor.com",
        impressionShare: 0.5,
        overlapRate: 0.3,
        outrankingShare: 0.1,
        positionAboveRate: 0.2,
        topOfPageRate: 0.8,
        absTopOfPageRate: 0.1
    }
];

const mockConversionActions: ConversionActionBreakdown[] = [
    {
        campaignId: "456",
        campaignName: "Generic Campaign",
        conversionAction: "Purchase",
        conversionCategory: "PURCHASE",
        conversions: 200,
        conversionValue: 10000,
        allConversions: 220,
        allConversionValue: 11000
    },
    {
        campaignId: "456",
        campaignName: "Generic Campaign",
        conversionAction: "Add to Cart",
        conversionCategory: "ADD_TO_CART",
        conversions: 500,
        conversionValue: 0,
        allConversions: 550,
        allConversionValue: 0
    }
];

const mockAudiencePerformance: AudiencePerformance[] = [
    {
        campaignId: "456",
        campaignName: "Generic Campaign",
        adGroupId: "ag1",
        adGroupName: "Sofa Group",
        criterionId: "crit1",
        audienceName: "Home Decor Enthusiasts",
        impressions: 1000,
        clicks: 50,
        cost: 50,
        conversions: 2,
        conversionValue: 100,
        cpc: 1.0,
        ctr: 0.05,
        roas: 2.0,
        cpa: 25.0
    }
];

const mockNetworkPerformance: NetworkPerformance[] = [
    {
        campaignId: "456",
        campaignName: "Generic Campaign",
        adNetworkType: "SEARCH",
        impressions: 9000,
        clicks: 180,
        cost: 1800,
        conversions: 45,
        conversionValue: 1800
    },
    {
        campaignId: "456",
        campaignName: "Generic Campaign",
        adNetworkType: "SEARCH_PARTNERS",
        impressions: 1000,
        clicks: 20,
        cost: 200,
        conversions: 5,
        conversionValue: 200
    }
];

const daysInPeriod = 7;
const periodStart = "2023-10-01";
const periodEnd = "2023-10-07";
const totalAccountCost = 3500;

try {
    console.log("Preparing Data...");
    const preparedData = prepareSearchTermData(
        mockSearchTerms,
        mockCampaigns,
        totalAccountCost,
        daysInPeriod,
        periodStart,
        periodEnd,
        mockAuctionInsights,
        mockConversionActions,
        mockAudiencePerformance,
        mockNetworkPerformance,
        [], // pmaxInsights - keeping empty for simplicity or add if needed
        "bg"
    );

    console.log("Data Prepared Successfully.");
    console.log("Unique Terms:", preparedData.metadata.uniqueSearchTermsCount);
    console.log("Cross Campaign Terms:", preparedData.crossCampaignTerms.length);
    console.log("Aggregated Terms:", preparedData.aggregatedSearchTerms.length);
    console.log("Date Range:", preparedData.metadata.dateRange);

    if (preparedData.additionalData.auctionInsights?.length) {
        console.log("Auction Insights present:", preparedData.additionalData.auctionInsights.length);
    } else {
        console.warn("Auction Insights MISSING in prepared output");
    }

    console.log("Building Prompt...");
    const prompt = buildAdvancedAnalysisPrompt(preparedData, { daysInPeriod, periodStart, periodEnd });

    console.log("Prompt Built Successfully.");
    console.log("Prompt Preview (first 500 chars):");
    console.log(prompt.substring(0, 500));

    // Simple check if new sections are present
    if (prompt.includes("БЛОК 6: Auction Insights")) {
        console.log("SUCCESS: Auction Insights section present in prompt");
    } else {
        console.error("FAILURE: Auction Insights section MISSING in prompt");
    }

    if (prompt.includes("БЛОК 4: Audience Segment Performance")) {
        console.log("SUCCESS: Audience section present in prompt");
    } else {
        console.error("FAILURE: Audience section MISSING in prompt");
    }

} catch (error) {
    console.error("Verification Failed:", error);
    process.exit(1);
}
