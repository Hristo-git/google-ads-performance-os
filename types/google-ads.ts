export interface Campaign {
    id: string;
    name: string;
    status: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    ctr: number;
    cpc: number;
    // Impression Share metrics
    searchImpressionShare: number | null;
    searchLostISRank: number | null;
    searchLostISBudget: number | null;
}

export interface AdGroup {
    id: string;
    campaignId: string;
    name: string;
    status: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    ctr: number;
    cpc: number;
    // Quality Score (aggregated)
    avgQualityScore: number | null;
    keywordsWithLowQS: number;
    // Ad Strength summary
    adsCount: number;
    poorAdsCount: number;
}

export interface NegativeKeyword {
    id: string;
    adGroupId: string;
    text: string;
    matchType: string;
}

export interface KeywordWithQS {
    id: string;
    adGroupId: string;
    text: string;
    matchType: string;
    qualityScore: number | null;
    expectedCtr: string;
    landingPageExperience: string;
    adRelevance: string;
    impressions: number;
    clicks: number;
    cost: number;
}

export interface AdWithStrength {
    id: string;
    adGroupId: string;
    type: string;
    adStrength: string;
    headlinesCount: number;
    descriptionsCount: number;
    finalUrls: string[];
    headlines: string[];
}

export interface Account {
    id: string;
    name: string;
    currency: string;
    timezone: string;
}

export type NavigationLevel = 'account' | 'campaign' | 'adgroup';

export interface NavigationState {
    level: NavigationLevel;
    campaignId?: string;
    campaignName?: string;
    adGroupId?: string;
    adGroupName?: string;
}
