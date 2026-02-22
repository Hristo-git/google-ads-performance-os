export interface Campaign {
    id: string;
    name: string;
    status: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue?: number;
    ctr: number;
    cpc: number;
    cpa?: number | null;
    roas?: number | null;
    // Impression Share metrics
    searchImpressionShare: number | null;
    searchLostISRank: number | null;
    searchLostISBudget: number | null;
    category?: string;
    biddingStrategyType?: string | null;
    advertisingChannelType?: string | null;
    advertisingChannelSubType?: string | null;
    targetRoas?: number;
    targetCpa?: number;
    // PMax Asset Groups
    assetGroups?: AssetGroup[];
    // PoP Analysis
    previous?: {
        cost: number;
        conversions: number;
        cpa: number | null;
        roas: number | null;
        clicks: number;
        impressions: number;
    };
    trends?: {
        date: string;
        cost: number;
        conversions: number;
        roas: number;
        cpa: number;
        clicks: number;
        impressions: number;
    }[];
}

export interface AssetGroup {
    id: string;
    campaignId: string;
    name: string;
    status: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue?: number;
    ctr: number;
    cpc: number;
    cpa?: number | null;
    roas?: number | null;
    category?: string;
    strength?: string;
    // Impression Share metrics
    searchImpressionShare?: number | null;
    searchLostISRank?: number | null;
    searchLostISBudget?: number | null;
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
    conversionValue?: number;
    ctr: number;
    cpc: number;
    cpa?: number | null;
    roas?: number | null;
    // Quality Score (aggregated)
    avgQualityScore: number | null;
    relativeCtr?: number | null; // Display Network Relevance
    keywordsWithLowQS: number;
    // Ad Strength summary
    adsCount: number;
    poorAdsCount: number;
    adStrength?: string;
    finalUrl?: string;
    campaignName?: string;
    adGroupName?: string;
    // Impression Share metrics
    searchImpressionShare: number | null;
    searchLostISRank: number | null;
    searchLostISBudget: number | null;
    viewThroughConversions?: number;
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
    conversions: number;
    conversionValue: number;
    cpc: number;
    biddingStrategyType: string;
    finalUrl?: string;
    campaignName?: string;
    adGroupName?: string;
    // New fields for diagnostics
    approvalStatus?: string;
    policySummary?: string[];
    allConversions?: number;
    viewThroughConversions?: number;
    searchImpressionShare: number | null;
    searchLostISRank: number | null;
    searchLostISBudget: number | null;
}

export interface AssetPerformance {
    id: string;
    type: string;
    name?: string;
    text?: string;
    finalUrls?: string[];
    performanceLabel?: string;
    approvalStatus?: string;
    policySummary?: string[];
    performance?: string;
    assetType?: string;
    fieldType?: string;
    content?: string;
    url?: string;
    imageUrl?: string;
    youtubeVideoId?: string;
    impressions: number;
    clicks: number;
    cost: number;
    ctr: number;
    conversions: number;
    conversionValue: number;
}

export interface ChangeEvent {
    id: string;
    changeDateTime: string;
    changeResourceType: string;
    changeResourceName: string;
    clientType: string;
    userEmail: string;
    oldResource?: string;
    newResource?: string;
    resourceName: string; // The specific entity changed (e.g., campaign name)
}

export interface ConversionAction {
    id: string;
    name: string;
    type: string;
    status: string;
    category: string;
    ownerCustomer?: string;
    includeInConversionsMetric: boolean;
    allConversions: number;
    viewThroughConversions: number;
    value: number;
}

export interface AuctionInsight {
    campaignId: string;
    competitor: string;
    impressionShare: number | null;
    overlapRate: number | null;
    outrankingShare: number | null;
    positionAboveRate: number | null;
    topOfPageRate?: number | null;
    absTopOfPageRate?: number | null;
}

export interface AudiencePerformance {
    campaignId: string;
    campaignName: string;
    adGroupId: string;
    adGroupName: string;
    criterionId: string;
    audienceName: string;
    audienceType?: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    ctr: number;
    cpc: number;
    roas: number | null;
    cpa: number | null;
    searchImpressionShare: number | null;
    searchLostISRank: number | null;
}

export interface PMaxSearchInsight {
    campaignId: string;
    campaignName: string;
    categoryName: string;
    term: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
}

export interface ConversionActionBreakdown {
    campaignId: string;
    campaignName: string;
    conversionAction: string;
    conversionCategory: string;
    conversions: number;
    conversionValue: number;
    allConversions: number;
    allConversionValue: number;
}

export type CampaignPerformance = Campaign;

export interface PMaxProductPerformance {
    id: string;
    merchantCenterId: number;
    channel: string;
    languageCode: string;
    feedLabel: string;
    itemId: string;
    title: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    roas: number | null;
}

export interface ListingGroupItem {
    id: string;
    adGroupId: string;
    adGroupName: string;
    campaignId: string;
    campaignName: string;
    dimension: string;  // e.g., "All products", product type, brand, custom label
    caseValue: string;  // The specific value (e.g., product type value)
    type: string;       // SUBDIVISION | UNIT
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    ctr: number;
    cpc: number;
    roas: number | null;
    cpa: number | null;
    searchImpressionShare: number | null;
    searchLostISRank: number | null;
    searchLostISBudget: number | null;
}

export interface AdWithStrength {
    id: string;
    adGroupId: string;
    type: string;
    status?: string;
    adStrength: string;
    headlinesCount: number;
    descriptionsCount: number;
    finalUrls: string[];
    headlines: string[];
    descriptions?: string[];
    impressions?: number;
    clicks?: number;
    cost?: number;
    conversions?: number;
    conversionValue?: number;
    ctr?: number;
    roas?: number | null;
}

export interface Account {
    id: string;
    name: string;
    currency: string;
    timezone: string;
}

export type NavigationLevel = 'account' | 'campaign' | 'adgroup';
export type ViewMode = 'dashboard' | 'insights' | 'reports' | 'diagnostics' | 'ngrams' | 'auction_insights';

export interface NavigationState {
    level: NavigationLevel;
    view?: ViewMode; // 'dashboard' or 'insights'
    campaignId?: string;
    campaignName?: string;
    adGroupId?: string;
    adGroupName?: string;
}

export interface AccountAsset {
    id: string;
    name: string;
    type: string; // SITELINK, CALLOUT, etc.
    fieldType: string; // BUSINESS_NAME, LOGO, etc.
    status: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    ctr: number;
    cpc: number;
    performanceLabel?: string;
}

export interface PMaxAsset {
    id: string;
    assetGroupId: string;
    type: string; // HEADLINE, DESCRIPTION, LOGO, MARKETING_IMAGE, etc.
    fieldType: string;
    text?: string;
    name?: string;
    status: string;
    performanceLabel?: string; // PENDING, LEARNING, LOW, GOOD, BEST
    imageUrl?: string;
    youtubeVideoId?: string;
}

export interface SearchTerm {
    campaignId?: string;
    campaignName?: string;
    adGroupId?: string;
    adGroupName?: string;
    searchTerm: string;
    matchType?: string | null; // BROAD, EXACT, PHRASE, etc.
    searchTermStatus?: string;
    date?: string;
    device?: string; // MOBILE, DESKTOP, TABLET, UNKNOWN — optional (not segmented in adgroup view)
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    ctr: number;
    averageCpc: number;
    conversionRate: number;
}

export interface DeviceBreakdown {
    campaignId: string;
    campaignName: string;
    device: string; // MOBILE, DESKTOP, TABLET, UNKNOWN
    cost: number;
    conversions: number;
    conversionValue: number;
    clicks: number;
    impressions: number;
    crossDeviceConversions: number;
    viewThroughConversions: number;
}

export type ReportTemplateId =
    | 'quality_score_diagnostics'
    | 'lost_is_analysis'
    | 'search_terms_intelligence'
    | 'ad_strength_performance'
    | 'budget_allocation_efficiency'
    | 'campaign_structure_health'
    | 'change_impact_analysis';

export type ReportCategory = 'quality' | 'efficiency' | 'insights' | 'structure';

export interface ReportTemplate {
    id: ReportTemplateId;
    nameEN: string;
    nameBG: string;
    descriptionEN: string;
    descriptionBG: string;
    icon: string; // emoji or icon identifier
    category: ReportCategory;
    requiredData: ('campaigns' | 'adGroups' | 'keywords' | 'searchTerms' | 'ads')[];
}

export interface ReportSettings {
    model: 'opus-4.6' | 'sonnet-4.6' | 'sonnet-4.5' | 'haiku-4.5';
    language: 'bg' | 'en';
    audience: 'internal' | 'client';
    expertMode: boolean;
    rowLimit: number;
}

export interface GeneratedReport {
    id: string;
    templateId: ReportTemplateId;
    templateName: string;
    timestamp: string;
    analysis: string;
    settings: ReportSettings;
    accountId?: string;
}




export interface NetworkPerformance {
    campaignId: string;
    campaignName: string;
    adNetworkType: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
}

export interface PlacementPerformance {
    placement: string;
    description?: string;
    type: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    ctr: number;
    viewThroughConversions: number;
}

export interface DemographicPerformance {
    type: 'AGE' | 'GENDER' | 'PARENTAL_STATUS' | 'INCOME';
    dimension: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    ctr: number;
}

export interface TimeAnalysisPerformance {
    period: string; // Hour (0-23) or Day of Week
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    roas?: number | null;
}


