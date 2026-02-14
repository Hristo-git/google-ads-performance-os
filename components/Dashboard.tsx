"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { Campaign, AdGroup, AssetGroup, NegativeKeyword, KeywordWithQS, AdWithStrength, Account, AccountAsset, NavigationState, PMaxAsset, DeviceBreakdown as DeviceBreakdownType, SearchTerm } from "@/types/google-ads";
import { ACCOUNTS, DEFAULT_ACCOUNT_ID } from "../config/accounts";
import { processNGrams } from "@/lib/n-gram";
import AIAnalysisModal from "./AIAnalysisModal";
import StrategicInsights from "./StrategicInsights";
import { AuctionInsights } from "./dashboard/AuctionInsights";
import AIReportsHub from "./AIReportsHub";
import AccountHealthWidget from "./AccountHealthWidget";
import NGramInsights from "./NGramInsights";
import Tooltip from "./Tooltip";

const Sparkline = ({ data, color = "#a78bfa" }: { data: number[], color?: string }) => {
    if (!data || data.length < 2) return null;

    const height = 24;
    const width = 60;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((val - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} className="opacity-70">
            <polyline
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                points={points}
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
};

const MetricCell = ({ value, format, previous, invertColor = false }: { value: number, format: (v: number) => string, previous?: number, invertColor?: boolean }) => {
    let delta = null;

    if (previous !== undefined && previous !== null && previous !== 0) {
        delta = ((value - previous) / previous) * 100;
    }

    let colorClass = "text-slate-500";
    let arrow = "";

    if (delta !== null) {
        if (delta > 0) {
            arrow = "↑";
            colorClass = invertColor ? "text-red-400" : "text-emerald-400";
        } else if (delta < 0) {
            arrow = "↓";
            colorClass = invertColor ? "text-emerald-400" : "text-red-400";
        }
    }

    return (
        <div className="flex flex-col items-end">
            <span>{format(value)}</span>
            {delta !== null && Math.abs(delta) > 0.5 && (
                <span className={`text-[10px] ${colorClass} flex items-center`}>
                    {arrow} {Math.abs(delta).toFixed(0)}%
                </span>
            )}
        </div>
    );
};

// Helper to get default "Last Month" date range
const getLastMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of last month

    // Format YYYY-MM-DD
    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    return {
        start: formatDate(start),
        end: formatDate(end)
    };
};

// Helper to get "Last 7 Days" date range
const getLast7DaysRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);

    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
    };
};

const STORAGE_KEY_DATE_RANGE = 'gads_dateRange';
const STORAGE_KEY_DATE_SELECTION = 'gads_dateRangeSelection';

const loadDateRange = (): { start: string; end: string } => {
    if (typeof window === 'undefined') return getLast7DaysRange();
    try {
        const saved = localStorage.getItem(STORAGE_KEY_DATE_RANGE);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.start && parsed.end) return parsed;
        }
    } catch { }
    return getLast7DaysRange();
};

const loadDateSelection = (): string => {
    if (typeof window === 'undefined') return 'last-7';
    return localStorage.getItem(STORAGE_KEY_DATE_SELECTION) || 'last-7';
};

// Helper to categorize campaigns
const getCampaignCategory = (c: any) => {
    const name = (c.name || "").trim().toLowerCase().replace(/\s+/g, ' ');
    const channelType = String(c.advertisingChannelType || "");

    // (1) Brand
    if (name.includes('brand') || name.includes('brand protection') ||
        name.includes('бренд') || name.includes('защита')) {
        return 'brand';
    }

    // PMax Check (Channel Type OR Name)
    const isPMax = channelType === 'PERFORMANCE_MAX' ||
        channelType === '10' ||
        name.includes('pmax') ||
        name.includes('performance');

    if (isPMax) {
        // (2) PMax – Sale
        if (name.includes('[sale]') || name.includes('sale') || name.includes('promo') ||
            name.includes('promotion') || name.includes('bf') || name.includes('black friday') ||
            name.includes('cyber') || name.includes('discount') || name.includes('намал') ||
            name.includes('промо') || name.includes('reducere') || name.includes('oferta') ||
            name.includes('promotie')) {
            return 'pmax_sale';
        }
        // (3) PMax – AON (Default for PMax)
        return 'pmax_aon';
    }

    // (4) Search – DSA
    if (name.includes('dsa')) {
        return 'search_dsa';
    }

    // (5) Search – NonBrand
    if (name.includes('sn') || name.includes('search') || name.includes('wd_s')) {
        return 'search_nonbrand';
    }

    // (6) Video/Display / Demand Gen
    if (name.includes('video') || name.includes('display') ||
        name.includes('youtube') || name.includes('yt') ||
        name.includes('dg - video') || name.includes('gdn') ||
        channelType === 'VIDEO' || channelType === 'DISPLAY' ||
        channelType === '6' || channelType === '3' ||
        channelType === 'DEMAND_GEN' || channelType === '14' ||
        channelType === 'DISCOVERY' || channelType === '12') {
        return 'upper_funnel';
    }

    // (7) Shopping
    if (name.includes('shop') || channelType === 'SHOPPING' || channelType === '4') {
        return 'shopping';
    }

    return 'other';
};

const CHANNEL_TYPE_LABELS: Record<string, string> = {
    'PERFORMANCE_MAX': 'PMax',
    'SEARCH': 'Search',
    'VIDEO': 'Video',
    'DISPLAY': 'Display',
    'SHOPPING': 'Shopping',
    'DEMAND_GEN': 'Demand Gen',
    'DISCOVERY': 'Demand Gen',
    'MULTI_CHANNEL': 'PMax (Multi)',
    'LOCAL': 'Local',
    'SMART': 'Smart',
    // Numeric mappings (Google Ads Enums v17+)
    '2': 'Search',
    '3': 'Display',
    '4': 'Shopping',
    '5': 'Hotel',
    '6': 'Video',
    '7': 'PMax (Multi)',
    '8': 'Local',
    '9': 'Smart',
    '10': 'Performance Max',
    '11': 'Local Services',
    '12': 'Discovery',
    '13': 'Travel',
    '14': 'Demand Gen',
};

const BIDDING_STRATEGY_LABELS: Record<string, string> = {
    'TARGET_ROAS': 'tROAS',
    'TARGET_CPA': 'tCPA',
    'MAXIMIZE_CONVERSIONS': 'Max Conversions',
    'MAXIMIZE_CONVERSION_VALUE': 'Max Conv Value',
    'ENHANCED_CPC': 'eCPC',
    'MANUAL_CPC': 'Manual CPC',
    'MANUAL_CPM': 'Manual CPM',
    'TARGET_SPEND': 'Max Clicks',
    'TARGET_IMPRESSION_SHARE': 'Target Imp Share',
    'COMMISSION': 'Commission',
    'MAXIMIZE_CONVERSION_VALUE_BASED_BIDDING': 'Max Conv Value',
    // Numeric mappings (Google Ads Enums)
    '2': 'Manual CPC',
    '3': 'Manual CPM',
    '4': 'Page One Promoted',
    '5': 'Max Clicks',
    '6': 'tCPA',
    '7': 'tROAS',
    '8': 'Max Conversions',
    '9': 'Max Conv Value',
    '10': 'eCPC',
    '11': 'Target Imp Share'
};


// Asset Field Type Labels
const ASSET_FIELD_TYPE_LABELS: Record<string, string> = {
    'HEADLINE': 'Headline',
    'DESCRIPTION': 'Description',
    'MARKETING_IMAGE': 'Marketing Image',
    'LOGO': 'Logo',
    'YOUTUBE_VIDEO': 'Video',
    'MEDIA_BUNDLE': 'Media Bundle',
    'CALL_TO_ACTION': 'Call to Action',
    'SITELINK': 'Sitelink',
    'CALLOUT': 'Callout',
    'STRUCTURED_SNIPPET': 'Structured Snippet',
    'LONG_HEADLINE': 'Long Headline',
    'BUSINESS_NAME': 'Business Name',
    'SQUARE_MARKETING_IMAGE': 'Square Image',
    'PORTRAIT_MARKETING_IMAGE': 'Portrait Image',
    'LANDSCAPE_LOGO': 'Landscape Logo',
    // numeric fallbacks (AssetFieldType enum values)
    '2': 'Headline',
    '3': 'Description',
    '4': 'Mandatory Ad Text',
    '5': 'Marketing Image',
    '6': 'Media Bundle',
    '7': 'Video',
    '8': 'Book on Google',
    '9': 'Lead Form',
    '10': 'Promotion',
    '11': 'Callout',
    '12': 'Structured Snippet',
    '13': 'Sitelink',
    '14': 'Mobile App',
    '15': 'Hotel Callout',
    '16': 'Call',
    '17': 'Price',
    '18': 'Long Headline',
    '19': 'Business Name',
    '20': 'Square Image',
    '21': 'Portrait Image',
    '22': 'Logo',
    '23': 'Landscape Logo',
    '24': 'Video',
    '25': 'Call to Action',
    '26': 'Ad Image',
    '27': 'Business Logo',
    '28': 'Hotel Property'
};

const PERFORMANCE_LABEL_LABELS: Record<string, string> = {
    'PENDING': 'Pending',
    'LEARNING': 'Learning',
    'LOW': 'Low',
    'GOOD': 'Good',
    'BEST': 'Best',
    'UNSPECIFIED': 'Pending',
    'UNKNOWN': 'Unknown',
    'undefined': 'Pending',
    // numeric fallbacks (AssetPerformanceLabel enum values)
    '2': 'Pending',
    '3': 'Learning',
    '4': 'Low',
    '5': 'Good',
    '6': 'Best',
};

// Helper to calculate strategic breakdown
const calculateStrategicBreakdown = (campaigns: any[]) => {
    const totalSpend = campaigns.reduce((sum, c) => sum + (c.cost || 0), 0);
    const breakdown: Record<string, any> = {
        brand: { spend: 0, campaigns: 0, percentage: 0 },
        pmax_sale: { spend: 0, campaigns: 0, percentage: 0 },
        pmax_aon: { spend: 0, campaigns: 0, percentage: 0 },
        search_dsa: { spend: 0, campaigns: 0, percentage: 0 },
        search_nonbrand: { spend: 0, campaigns: 0, percentage: 0 },
        shopping: { spend: 0, campaigns: 0, percentage: 0 },
        upper_funnel: { spend: 0, campaigns: 0, percentage: 0 },
        other: { spend: 0, campaigns: 0, percentage: 0 }
    };

    campaigns.forEach(c => {
        const cat = getCampaignCategory(c);
        if (breakdown[cat]) {
            breakdown[cat].spend += (c.cost || 0);
            breakdown[cat].campaigns += 1;
        } else {
            breakdown.other.spend += (c.cost || 0);
            breakdown.other.campaigns += 1;
        }
    });

    Object.keys(breakdown).forEach(key => {
        breakdown[key].percentage = totalSpend > 0 ? (breakdown[key].spend / totalSpend) * 100 : 0;
    });

    return breakdown;
};

// Helper to calculate Smart Bidding Deviation
const enrichWithSmartBidding = (camps: Campaign[]) => {
    return camps.map(c => {
        let smartBiddingAnalysis = null;
        // Check for Target ROAS
        if (c.biddingStrategyType === 'TARGET_ROAS' && c.targetRoas) {
            const actualRoas = c.roas || 0;
            const target = c.targetRoas;
            const deviation = target > 0 ? (actualRoas - target) / target : 0;
            smartBiddingAnalysis = {
                type: 'tROAS',
                target,
                actual: actualRoas,
                deviation: parseFloat(deviation.toFixed(2)),
                status: deviation < -0.2 ? 'MISSING_TARGET' : deviation > 0.2 ? 'EXCEEDING_TARGET' : 'ON_TARGET'
            };
        }
        // Check for Target CPA
        else if (c.biddingStrategyType === 'TARGET_CPA' && c.targetCpa) {
            const actualCpa = c.cpa || 0;
            const target = c.targetCpa;
            // For CPA, lower is better. Positive deviation means we are spending MORE than target (bad).
            const deviation = target > 0 ? (actualCpa - target) / target : 0;
            smartBiddingAnalysis = {
                type: 'tCPA',
                target,
                actual: actualCpa,
                deviation: parseFloat(deviation.toFixed(2)),
                status: deviation > 0.2 ? 'MISSING_TARGET' : deviation < -0.2 ? 'BEATING_TARGET' : 'ON_TARGET'
            };
        }
        return { ...c, smartBiddingAnalysis };
    });
};

export default function Dashboard({ customerId }: { customerId?: string }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
    const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([]);
    const [negativeKeywords, setNegativeKeywords] = useState<NegativeKeyword[]>([]);
    const [keywords, setKeywords] = useState<KeywordWithQS[]>([]);
    const [ads, setAds] = useState<AdWithStrength[]>([]);
    const [assets, setAssets] = useState<AccountAsset[]>([]); // New state for assets
    const [pmaxAssets, setPmaxAssets] = useState<PMaxAsset[]>([]); // New state for PMax assets
    const [account, setAccount] = useState<Account | null>(null);
    const [loading, setLoading] = useState(false);
    const [analysis, setAnalysis] = useState("");
    const [analyzing, setAnalyzing] = useState(false);
    const [navigation, setNavigation] = useState<NavigationState>({ level: 'account', view: 'dashboard' });
    const [error, setError] = useState<string | null>(null);
    const [loadingMessage, setLoadingMessage] = useState<string>("");
    const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
    const [strategicBreakdown, setStrategicBreakdown] = useState<any>(null);
    const [selectedAccountId, setSelectedAccountId] = useState<string>(DEFAULT_ACCOUNT_ID);
    const [dateRange, setDateRangeRaw] = useState<{ start: string, end: string }>(loadDateRange);
    const [sortBy, setSortBy] = useState<string>('cost'); // Default sort by cost
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc'); // Default descending
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null); // Filter by category
    const [showAIModal, setShowAIModal] = useState(false); // AI Insights modal
    const [dateRangeSelection, setDateRangeSelectionRaw] = useState<string>(loadDateSelection);

    // Persist date range to localStorage
    const setDateRange = (range: { start: string; end: string }) => {
        setDateRangeRaw(range);
        try { localStorage.setItem(STORAGE_KEY_DATE_RANGE, JSON.stringify(range)); } catch { }
    };
    const setDateRangeSelection = (val: string) => {
        setDateRangeSelectionRaw(val);
        try { localStorage.setItem(STORAGE_KEY_DATE_SELECTION, val); } catch { }
    };
    const [language, setLanguage] = useState<'bg' | 'en'>('bg');
    const [deviceBreakdown, setDeviceBreakdown] = useState<DeviceBreakdownType[]>([]);
    const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([]);
    const [hideStopped, setHideStopped] = useState(false); // Filter for Enabled only items
    const [healthData, setHealthData] = useState<any>(null);
    const [loadingHealth, setLoadingHealth] = useState(false);
    const [auditSnapshotDate, setAuditSnapshotDate] = useState<string | null>(null);

    // Sync state with URL parameter (from props) and trigger data refresh
    useEffect(() => {
        if (customerId && customerId !== selectedAccountId) {
            console.log(`[Dashboard] Account changed from ${selectedAccountId} to ${customerId}`);
            // Clear existing data to force refresh
            setCampaigns([]);
            setAdGroups([]);
            setAssetGroups([]);
            setKeywords([]);
            setAds([]);
            setNegativeKeywords([]);
            setAssets([]);
            setPmaxAssets([]);
            setAccount(null);
            setStrategicBreakdown(null);
            // Update the selected account ID
            setSelectedAccountId(customerId);
            // Data will be refetched automatically by the useEffect that watches selectedAccountId
        }
    }, [customerId, selectedAccountId]);

    // Derived state for filtered accounts based on permissions
    const filteredAccounts = useMemo(() => {
        if (!session?.user) return [];
        const allowedIds = session.user.allowedCustomerIds || [];
        const role = session.user.role;
        const isAdmin = role === 'admin' || allowedIds.includes('*');

        if (isAdmin) return ACCOUNTS;
        return ACCOUNTS.filter(acc => allowedIds.includes(acc.id));
    }, [session]);

    // Auto-select allowed account if current selection is forbidden
    useEffect(() => {
        if (status === 'loading' || !session) return;

        // If we have accounts but the current selection isn't one of them
        if (filteredAccounts.length > 0) {
            const isAllowed = filteredAccounts.some(acc => acc.id === selectedAccountId);
            if (!isAllowed) {
                console.warn(`[Dashboard] Selected account ${selectedAccountId} is not allowed. Switching to ${filteredAccounts[0].id}`);
                const newId = filteredAccounts[0].id;
                setSelectedAccountId(newId);
                // Update URL without causing a full page re-render
                window.history.replaceState(null, '', `/?customerId=${newId}`);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, selectedAccountId]);

    const displayAccountName = useMemo(() => {
        const mappedAccount = ACCOUNTS.find(acc => acc.id === selectedAccountId);
        return mappedAccount ? mappedAccount.name : (account?.name || 'Account');
    }, [selectedAccountId, account]);

    const filteredCampaignIds = useMemo(() => {
        if (!categoryFilter) return undefined;
        return campaigns
            .filter(c => (getCampaignCategory as any)(c) === categoryFilter)
            .map(c => String(c.id));
    }, [campaigns, categoryFilter]);

    // Calculate comparison date range
    const getComparisonDateRange = (start: string, end: string) => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive

        const prevEndDate = new Date(startDate);
        prevEndDate.setDate(prevEndDate.getDate() - 1);

        const prevStartDate = new Date(prevEndDate);
        prevStartDate.setDate(prevStartDate.getDate() - (diffDays - 1));

        return {
            start: prevStartDate.toISOString().split('T')[0],
            end: prevEndDate.toISOString().split('T')[0]
        };
    };

    const fetchCoreData = async () => {
        console.log(`[fetchCoreData] Called with:`, { selectedAccountId, dateRange });
        setLoading(true);
        setError(null);
        try {
            const statusParam = hideStopped ? '&status=ENABLED' : '';
            const commonParams = `customerId=${selectedAccountId}&startDate=${dateRange.start}&endDate=${dateRange.end}${statusParam}`;

            setLoadingMessage("Fetching Google Ads account...");
            const [accRes, camRes] = await Promise.all([
                fetch(`/api/google-ads/account?customerId=${selectedAccountId}`),
                fetch(`/api/google-ads/campaigns?${commonParams}`)
            ]);

            const accData = await accRes.json();
            const camData = await camRes.json();

            // Check for quota errors first
            const quotaResponse = [accData, camData].find(d => d.isQuotaError);
            if (quotaResponse) {
                const retrySeconds = quotaResponse.retryAfterSeconds;
                const hours = retrySeconds ? Math.ceil(retrySeconds / 3600) : null;
                throw new Error(`QUOTA_EXCEEDED:${hours || ''}`);
            }
            if (accData.error) throw new Error(`Account Error: ${accData.error}${accData.details ? ' — ' + accData.details : ''}`);
            if (camData.error) throw new Error(`Campaigns Error: ${camData.error}${camData.details ? ' — ' + camData.details : ''}`);

            if (accData.account) setAccount(accData.account);
            if (camData.campaigns) {
                const categorizedCampaigns = camData.campaigns.map((c: any) => ({
                    ...c,
                    category: getCampaignCategory(c)
                }));
                setCampaigns(categorizedCampaigns);
                setStrategicBreakdown(calculateStrategicBreakdown(categorizedCampaigns));
            }

            // Fetch Account Assets, Device Breakdown, and Search Terms
            setLoadingMessage("Fetching Assets and Performance Data...");
            const [assetsRes, deviceRes, searchRes] = await Promise.all([
                fetch(`/api/google-ads/assets?${commonParams}`),
                fetch(`/api/google-ads/device-breakdown?${commonParams}`),
                fetch(`/api/google-ads/search-terms?${commonParams}`)
            ]);

            const assetsData = await assetsRes.json();
            const deviceData = await deviceRes.json();
            const searchData = await searchRes.json();

            if (assetsData.assets) setAssets(assetsData.assets);
            if (!deviceData.error && deviceData.deviceBreakdown) {
                setDeviceBreakdown(deviceData.deviceBreakdown);
            } else {
                console.log('Device breakdown error or no data:', deviceData);
                setDeviceBreakdown([]);
            }
            if (!searchData.error && searchData.searchTerms) {
                setSearchTerms(searchData.searchTerms);
            } else {
                console.log('Search terms error or no data:', searchData);
                setSearchTerms([]);
            }
        } catch (err: any) {
            console.error("Failed to fetch core data:", err);
            setError(err.message || "An unexpected error occurred");
        } finally {
            setLoading(false);
            setLoadingMessage("");
        }
    };

    const fetchAdGroupData = async () => {
        if (campaigns.length === 0) return; // Wait for campaigns to load context

        setLoading(true); // Show loading for ad groups
        try {
            setLoadingMessage("Fetching details...");
            const statusParam = hideStopped ? '&status=ENABLED' : '';
            const commonParams = `customerId=${selectedAccountId}&startDate=${dateRange.start}&endDate=${dateRange.end}${statusParam}`;
            const adGroupParams = navigation.campaignId ? `${commonParams}&campaignId=${navigation.campaignId}` : commonParams;

            const agRes = await fetch(`/api/google-ads/ad-groups?${adGroupParams}`);
            const agData = await agRes.json();
            if (agData.error) throw new Error(`Ad Groups Error: ${agData.error}`);
            if (agData.adGroups) setAdGroups(agData.adGroups);

            // Fetch PMax assets if applicable
            if (navigation.campaignId) {
                const campaign = campaigns.find(c => String(c.id) === String(navigation.campaignId));
                const isPMax = campaign?.advertisingChannelType === 'PERFORMANCE_MAX' ||
                    campaign?.name?.toLowerCase().includes('pmax');

                if (isPMax) {
                    fetchAssetGroups(navigation.campaignId);
                }
            }
        } catch (err: any) {
            console.error("Failed to fetch ad group data:", err);
            // Only show error to user when they're actually viewing ad groups
            if (navigation.level === 'campaign' || navigation.level === 'adgroup') {
                setError(err.message || "Failed to load ad groups");
            }
        } finally {
            setLoading(false);
            setLoadingMessage("");
        }
    };

    useEffect(() => {
        if (session) {
            fetchCoreData();
        }
    }, [session, selectedAccountId, dateRange.start, dateRange.end, hideStopped]);

    useEffect(() => {
        if (session && (navigation.level === 'campaign' || navigation.level === 'adgroup') && navigation.campaignId) {
            fetchAdGroupData();
        }
    }, [session, navigation.level, navigation.campaignId, selectedAccountId, dateRange.start, dateRange.end, hideStopped, campaigns.length]);

    // Fetch ALL ad groups when entering Strategic Insights (for Quality Audit)
    useEffect(() => {
        if (session && navigation.view === 'insights' && campaigns.length > 0) {
            const fetchAllAdGroupsForAudit = async () => {
                try {
                    const statusParam = hideStopped ? '&status=ENABLED' : '';
                    const params = `customerId=${selectedAccountId}&startDate=${dateRange.start}&endDate=${dateRange.end}${statusParam}`;
                    const res = await fetch(`/api/google-ads/ad-groups?${params}`);
                    const data = await res.json();
                    if (data.adGroups) setAdGroups(data.adGroups);
                    setAuditSnapshotDate(data.snapshotDate || null);
                } catch (err) {
                    console.error("Failed to fetch ad groups for audit:", err);
                }
            };
            fetchAllAdGroupsForAudit();
        }
    }, [session, navigation.view, selectedAccountId, dateRange.start, dateRange.end, hideStopped, campaigns.length]);

    useEffect(() => {
        if (session && navigation.level === 'adgroup' && navigation.adGroupId) {
            fetchAdGroupDetails(navigation.adGroupId);
        }
    }, [session, navigation.level, navigation.adGroupId, selectedAccountId, dateRange.start, dateRange.end, hideStopped, campaigns.length]);

    const fetchAssetGroups = async (campaignId: string) => {
        try {
            const statusParam = hideStopped ? '&status=ENABLED' : '';
            const queryParams = `?campaignId=${campaignId}&customerId=${selectedAccountId}&startDate=${dateRange.start}&endDate=${dateRange.end}${statusParam}`;
            const res = await fetch(`/api/google-ads/pmax-detailed${queryParams}`);
            const data = await res.json();
            if (data.assetGroups) {
                setAssetGroups(data.assetGroups);
                // Store extra PMax data for analysis
                (window as any).__pmaxEnrichedData = {
                    searchInsights: data.searchInsights || [],
                    assetGroupDetails: data.assetGroups || []
                };
            }
        } catch (error) {
            console.error("Failed to fetch asset groups:", error);
        }
    };

    const fetchAdGroupDetails = async (adGroupId: string) => {
        if (campaigns.length === 0) return; // Wait for campaigns to load context

        try {
            // Check if this is a PMax campaign (using asset groups)
            const currentCampaign = campaigns.find(c => String(c.id) === String(navigation.campaignId));
            const isPMax = currentCampaign?.advertisingChannelType === 'PERFORMANCE_MAX' ||
                currentCampaign?.name?.toLowerCase().includes('pmax');

            if (isPMax) {
                // Fetch PMax Assets
                setLoadingMessage("Fetching Asset Group Assets...");
                const res = await fetch(`/api/google-ads/pmax-assets?assetGroupId=${adGroupId}&customerId=${selectedAccountId}`);
                if (!res.ok) throw new Error('Failed to fetch assets');
                const data = await res.json();
                setPmaxAssets(data.assets || []);
                setAds([]); // Clear standard ads
                setKeywords([]); // Clear standard keywords
                return;
            }

            const statusParam = hideStopped ? '&status=ENABLED' : '';
            const queryParams = `&customerId=${selectedAccountId}&startDate=${dateRange.start}&endDate=${dateRange.end}${statusParam}`;
            const [nkRes, kwRes, adsRes] = await Promise.all([
                fetch(`/api/google-ads/negative-keywords?adGroupId=${adGroupId}&customerId=${selectedAccountId}`),
                fetch(`/api/google-ads/keywords?adGroupId=${adGroupId}${queryParams}`),
                fetch(`/api/google-ads/ads?adGroupId=${adGroupId}${queryParams}`)
            ]);

            const nkData = await nkRes.json();
            const kwData = await kwRes.json();
            const adsData = await adsRes.json();

            if (nkData.negativeKeywords) setNegativeKeywords(nkData.negativeKeywords);
            if (kwData.keywords) setKeywords(kwData.keywords);
            if (adsData.ads) setAds(adsData.ads);
        } catch (error) {
            console.error("Failed to fetch ad group details:", error);
        }
    };

    // -----------------------------------------------------------------
    // Fetch Account Health & N-Grams
    // -----------------------------------------------------------------
    useEffect(() => {
        const fetchHealthData = async () => {
            if (navigation.view !== 'diagnostics' || !selectedAccountId) return;

            console.log(`[fetchHealthData] Fetching for customer: ${selectedAccountId}`, dateRange);
            setLoadingHealth(true);
            try {
                const queryParams = new URLSearchParams({
                    customerId: selectedAccountId,
                    startDate: dateRange.start || '',
                    endDate: dateRange.end || ''
                });

                const response = await fetch(`/api/google-ads/health?${queryParams.toString()}`);
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Failed to fetch health data: ${response.status} ${errorText}`);
                }
                const data = await response.json();
                console.log(`[fetchHealthData] Received:`, data);
                setHealthData(data);
            } catch (err) {
                console.error("Error fetching health data:", err);
            } finally {
                setLoadingHealth(false);
            }
        };

        fetchHealthData();
    }, [navigation.view, selectedAccountId, dateRange]);


    const runAnalysis = async (analysisType?: 'account-overview' | 'category' | 'campaign' | 'adgroup', category?: string, model?: string) => {
        let dataToAnalyze: any = getAnalysisContext();
        if (!dataToAnalyze) return;

        // Add language, analysis type, customerId, and dateRange to analysis data
        dataToAnalyze.language = language;
        dataToAnalyze.customerId = selectedAccountId;
        dataToAnalyze.analysisType = analysisType || (navigation.level === 'account' ? 'account-overview' : navigation.level);
        dataToAnalyze.dateRange = dateRange;
        if (model) dataToAnalyze.model = model;

        // If category-specific analysis, filter campaigns by category
        if (analysisType === 'category' && category) {
            const filteredCampaigns = campaigns.filter(c => getCampaignCategory(c) === category);
            dataToAnalyze = {
                campaigns: enrichWithSmartBidding(filteredCampaigns),
                strategicBreakdown,
                level: 'strategic_category',
                category,
                language
            };
        }

        setAnalyzing(true);
        try {
            // --- Enrich with N-Gram Analysis (Account/Campaign Level) ---
            if (navigation.level === 'account' || navigation.level === 'campaign') {
                try {
                    setLoadingMessage("Fetching search terms for N-Gram analysis...");
                    const queryParams = `?customerId=${selectedAccountId}&startDate=${dateRange.start}&endDate=${dateRange.end}&aggregate=true`;
                    const stRes = await fetch(`/api/google-ads/search-terms${queryParams}`);
                    if (stRes.ok) {
                        const stData = await stRes.json();
                        if (stData.searchTerms && stData.searchTerms.length > 0) {
                            const nGramResult = processNGrams(stData.searchTerms);
                            dataToAnalyze = {
                                ...dataToAnalyze,
                                nGramAnalysis: {
                                    topWinning: nGramResult.topWinning,
                                    topWasteful: nGramResult.topWasteful
                                }
                            };
                        }
                    }
                } catch (err) {
                    console.warn("Failed to fetch search terms for N-Gram analysis", err);
                }
            }
            // ------------------------------------------------------------

            // --- Fetch Context Signals (device/geo/hour/auction/LP/conversions + PMax) ---
            try {
                setLoadingMessage("Fetching context signals...");
                const pmaxIds = campaigns
                    .filter(c => c.advertisingChannelType === 'PERFORMANCE_MAX' || (c as any).advertisingChannelType === 6)
                    .map(c => c.id)
                    .filter(Boolean);
                const pmaxParam = pmaxIds.length > 0 ? `&pmaxCampaignIds=${pmaxIds.join(',')}` : '';
                const ctxRes = await fetch(
                    `/api/google-ads/analysis-context?customerId=${selectedAccountId}&startDate=${dateRange.start}&endDate=${dateRange.end}&language=${language}${pmaxParam}`
                );
                if (ctxRes.ok) {
                    const ctxData = await ctxRes.json();
                    if (ctxData.contextBlock) dataToAnalyze.contextBlock = ctxData.contextBlock;
                    if (ctxData.pmaxBlock) dataToAnalyze.pmaxBlock = ctxData.pmaxBlock;
                    if (ctxData.context?.device) dataToAnalyze.deviceData = ctxData.context.device;
                }
            } catch (err) {
                console.warn("Failed to fetch context signals (non-blocking)", err);
            }
            // ------------------------------------------------------------

            setLoadingMessage("Streaming AI analysis...");
            const res = await fetch("/api/analyze/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dataToAnalyze)
            });
            if (!res.ok) {
                const text = await res.text();
                let errorMsg: string;
                try {
                    const errData = JSON.parse(text);
                    errorMsg = errData.error || `HTTP ${res.status}`;
                    if (errData.details) errorMsg += ` (${errData.details})`;
                } catch {
                    errorMsg = `HTTP ${res.status}: ${text.slice(0, 200)}`;
                }
                setAnalysis(`Error: ${errorMsg}`);
                return;
            }

            // Read stream incrementally and render as chunks arrive
            const reader = res.body?.getReader();
            if (!reader) {
                setAnalysis("Error: No response stream available");
                return;
            }
            const decoder = new TextDecoder();
            let accumulated = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                accumulated += decoder.decode(value, { stream: true });
                setAnalysis(accumulated);
            }
        } catch (error: any) {
            console.error("Analysis failed:", error);
            setAnalysis(`Failed to generate analysis: ${error.message || 'Unknown error'}`);
        } finally {
            setAnalyzing(false);
            setLoadingMessage(""); // Clear enrichment loading message
        }
    };

    const getAnalysisContext = () => {
        // Enriched Context Variable
        let context: any = {};

        if (navigation.level === 'account') {
            // Priority 1: Specific Campaign Selected
            if (selectedCampaignId) {
                const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
                return { campaign: selectedCampaign, campaigns: [selectedCampaign], strategicBreakdown, level: 'account' };
            }

            // Priority 2: Category Filter Active
            if (categoryFilter) {
                const filteredCampaigns = campaigns.filter(c => c.category === categoryFilter);
                return {
                    campaigns: filteredCampaigns,
                    strategicBreakdown,
                    level: 'account',
                    context: `Filtered by category: ${categoryFilter}`
                };
            }
        }

        switch (navigation.level) {
            case 'account':
                // Trim keywords if >1000: keep top by cost, low QS, and 0 impressions
                let trimmedKeywords = keywords;
                if (keywords.length > 1000) {
                    const bySpend = [...keywords].sort((a, b) => (b.cost || 0) - (a.cost || 0)).slice(0, 500);
                    const lowQS = keywords.filter(k => k.qualityScore !== null && k.qualityScore <= 5).slice(0, 300);
                    const zeroImpr = keywords.filter(k => !k.impressions || k.impressions === 0).slice(0, 200);
                    const idSet = new Set<string>();
                    trimmedKeywords = [...bySpend, ...lowQS, ...zeroImpr].filter(k => {
                        if (idSet.has(k.id)) return false;
                        idSet.add(k.id);
                        return true;
                    });
                }
                return {
                    campaigns: enrichWithSmartBidding(campaigns),
                    adGroups,
                    keywords: trimmedKeywords,
                    ads,
                    negativeKeywords,
                    deviceData: deviceBreakdown,
                    strategicBreakdown,
                    level: 'account'
                };
            case 'campaign':
                const campaign = campaigns.find(c => c.id === navigation.campaignId);
                const isPMax = campaign?.advertisingChannelType === 'PERFORMANCE_MAX' ||
                    campaign?.name?.toLowerCase().includes('pmax');

                const campaignAdGroups = adGroups.filter(ag => ag.campaignId === navigation.campaignId);
                // If we have asset groups (PMax), return them with enriched data
                if (assetGroups.length > 0 && isPMax) {
                    const pmaxData = (window as any).__pmaxEnrichedData || {};
                    return {
                        campaign: enrichWithSmartBidding(campaign ? [campaign] : [])[0],
                        assetGroups,
                        pmaxSearchInsights: pmaxData.searchInsights || [],
                        pmaxAssetGroupDetails: pmaxData.assetGroupDetails || [],
                        level: 'campaign'
                    };
                }

                return { campaign: enrichWithSmartBidding(campaign ? [campaign] : [])[0], adGroups: campaignAdGroups, level: 'campaign' };
            case 'adgroup':
                const adGroup = adGroups.find(ag => ag.id === navigation.adGroupId);
                return { adGroup, negativeKeywords, keywords, ads, level: 'adgroup' };
            default:
                return null;
        }
    };

    // Helper functions for status colors
    const getQSColor = (qs: number | null) => {
        if (qs === null) return 'text-slate-500';
        if (qs >= 7) return 'text-emerald-400';
        if (qs >= 5) return 'text-amber-400';
        return 'text-red-400';
    };

    const getAdStrengthColor = (strength: string) => {
        switch (strength) {
            case 'EXCELLENT': return 'bg-emerald-500/20 text-emerald-400';
            case 'GOOD': return 'bg-blue-500/20 text-blue-400';
            case 'AVERAGE': return 'bg-amber-500/20 text-amber-400';
            case 'POOR': return 'bg-red-500/20 text-red-400';
            default: return 'bg-slate-600/50 text-slate-400';
        }
    };

    const getISColor = (is: number | null) => {
        if (is === null) return 'text-slate-500';
        if (is >= 0.8) return 'text-emerald-400';
        if (is >= 0.5) return 'text-amber-400';
        return 'text-red-400';
    };

    // Recommendation text helpers
    const getAdStrengthTip = (strength: string, headlinesCount?: number, descriptionsCount?: number, adType?: string) => {
        const isDisplay = adType === 'RESPONSIVE_DISPLAY_AD';
        const maxH = isDisplay ? 5 : 15;
        const maxD = isDisplay ? 5 : 4;
        const minH = isDisplay ? 5 : 10;
        const minD = isDisplay ? 5 : 3;
        switch (strength) {
            case 'POOR': return `Ad strength is Poor. Add more unique headlines (aim for ${minH}+/${maxH}) and descriptions (${minD}+/${maxD}). Use diverse messaging angles, include keywords, and add a clear call-to-action.`;
            case 'AVERAGE': return `Ad strength is Average. Add more unique headlines${headlinesCount ? ` (currently ${headlinesCount}/${maxH})` : ''} and descriptions${descriptionsCount ? ` (currently ${descriptionsCount}/${maxD})` : ''}. Each headline should offer a unique selling point. Avoid repetition.`;
            case 'GOOD': return `Good ad strength. Consider adding 1-2 more unique headlines for even better rotation and testing.`;
            default: return '';
        }
    };

    const getQSComponentTip = (component: string, value: string) => {
        if (value !== 'BELOW_AVERAGE') return '';
        switch (component) {
            case 'expectedCtr': return 'Expected CTR is below average. Write more compelling headlines with strong calls-to-action. Use ad extensions (sitelinks, callouts) to increase visibility and click appeal.';
            case 'adRelevance': return 'Ad relevance is below average. Include the target keyword in your headlines. Ensure ad copy directly addresses what users are searching for. Consider tighter ad group theming.';
            case 'landingPageExperience': return 'Landing page experience is below average. Improve page load speed, ensure mobile-friendliness, match landing page content to ad messaging, and add clear CTAs.';
            default: return '';
        }
    };

    const getQSValueTip = (qs: number | null) => {
        if (qs === null) return '';
        if (qs <= 4) return `Quality Score ${qs}/10 is low. This increases CPC and reduces ad rank. Review Expected CTR, Ad Relevance, and Landing Page Experience for this keyword.`;
        if (qs <= 6) return `Quality Score ${qs}/10 is average. Improving the below-average components can lower CPC and improve ad position.`;
        return '';
    };

    const getPMaxPerfTip = (label: string) => {
        switch (label) {
            case 'LOW': return 'This asset is underperforming compared to others. Consider replacing it with a different creative, text variation, or image to improve results.';
            case 'PENDING': case 'LEARNING': return 'Google is still evaluating this asset. Allow 1-2 weeks for enough data to accumulate before making changes.';
            default: return '';
        }
    };

    if (status === "loading") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="text-slate-300 text-lg">Loading session...</div>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                {/* This should strictly be handled by app/page.tsx redirection, but as a fallback: */}
                <div className="text-slate-400">Redirecting to login...</div>
            </div>
        );
    }

    // Get current data based on navigation level
    const getCurrentData = () => {
        switch (navigation.level) {
            case 'account':
                return campaigns;
            case 'campaign':
                const currentCampaign = campaigns.find(c => String(c.id) === String(navigation.campaignId));
                const isPMaxCampaignForCurrentLevel = currentCampaign?.advertisingChannelType === 'PERFORMANCE_MAX' ||
                    currentCampaign?.name?.toLowerCase().includes('pmax') ||
                    assetGroups.length > 0;

                if (isPMaxCampaignForCurrentLevel && assetGroups.length > 0) {
                    return assetGroups;
                }

                return adGroups.filter(ag => String(ag.campaignId) === String(navigation.campaignId));
            case 'adgroup':
                const campaignForAdGroup = campaigns.find(c => c.id === navigation.campaignId);
                const isPMaxCampForAdGroup = campaignForAdGroup?.advertisingChannelType === 'PERFORMANCE_MAX' ||
                    campaignForAdGroup?.name?.toLowerCase().includes('pmax');

                if (isPMaxCampForAdGroup) {
                    return [assetGroups.find(ag => ag.id === navigation.adGroupId)].filter(Boolean);
                }
                return [adGroups.find(ag => ag.id === navigation.adGroupId)].filter(Boolean);
            default:
                return [];
        }
    };

    // Handle column sorting
    const handleSort = (column: string) => {
        if (sortBy === column) {
            // Toggle direction if same column
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            // New column, default to descending
            setSortBy(column);
            setSortDirection('desc');
        }
    };

    // Handle category filter
    const handleCategoryFilter = (category: string) => {
        if (categoryFilter === category) {
            setCategoryFilter(null); // Toggle off
        } else {
            setCategoryFilter(category); // Set filter
        }
    };

    const currentData = getCurrentData();

    // Filter data first
    const filteredData = (currentData || []).filter(item => {
        if (!item) return false;
        if (!categoryFilter || navigation.level !== 'account') return true;
        return (item as any).category === categoryFilter;
    });

    // Apply sorting
    const sortedData = [...(filteredData || [])].sort((a, b) => {
        if (!a || !b) return 0; // Guard against undefined items

        let aVal: any = (a as any)[sortBy];
        let bVal: any = (b as any)[sortBy];

        // Custom handling for CVR
        if (sortBy === 'cvr') {
            aVal = a.clicks > 0 ? (a.conversions || 0) / a.clicks : 0;
            bVal = b.clicks > 0 ? (b.conversions || 0) / b.clicks : 0;
        }

        // Handle null/undefined
        if (aVal == null) aVal = -Infinity;
        if (bVal == null) bVal = -Infinity;

        // String comparison for name
        if (sortBy === 'name') {
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
            return sortDirection === 'asc'
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        }

        // Numeric comparison
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    const totalSpend = sortedData.reduce((sum, item) => sum + (item?.cost || 0), 0);
    const totalConversions = sortedData.reduce((sum, item) => sum + (item?.conversions || 0), 0);
    const totalClicks = sortedData.reduce((sum, item) => sum + (item?.clicks || 0), 0);
    const totalImpressions = sortedData.reduce((sum, item) => sum + (item?.impressions || 0), 0);
    const totalConversionValue = sortedData.reduce((sum, item) => sum + (item?.conversionValue || 0), 0);
    const totalROAS = totalSpend > 0 ? totalConversionValue / totalSpend : 0;

    // Current selected ad group for detail view
    const currentAdGroup = navigation.level === 'adgroup'
        ? (adGroups.find(ag => String(ag.id) === String(navigation.adGroupId)) ||
            assetGroups.find(ag => String(ag.id) === String(navigation.adGroupId)))
        : null;

    return (
        <div className="flex h-screen bg-slate-900 overflow-hidden">
            <Sidebar
                campaigns={campaigns}
                adGroups={adGroups}
                assetGroups={assetGroups}
                onNavigate={setNavigation}
                navigation={navigation}
                accountName={displayAccountName}
            />
            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                {/* Loading Overlay */}
                {loading && (
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="bg-slate-800 rounded-xl p-8 shadow-2xl border border-slate-700 text-center">
                            <div className="relative w-16 h-16 mx-auto mb-4">
                                <div className="absolute inset-0 border-4 border-slate-600 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-violet-500 rounded-full border-t-transparent animate-spin"></div>
                            </div>
                            <p className="text-white font-medium mb-1">
                                Loading Google Ads Data
                            </p>
                            <p className="text-slate-400 text-sm">{loadingMessage || 'Please wait...'}</p>
                        </div>
                    </div>
                )}

                {/* Header */}
                <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm sticky top-0 z-10">
                    <div className="px-6 py-4 flex items-center justify-between">
                        <div>
                            {/* Breadcrumbs */}
                            <div className="flex items-center gap-2 text-sm">
                                <button
                                    onClick={() => setNavigation({ level: 'account' })}
                                    className={`hover:text-white transition-colors ${navigation.level === 'account' ? 'text-white font-medium' : 'text-slate-400'
                                        }`}
                                >
                                    {displayAccountName}
                                </button>
                                {navigation.campaignName && (
                                    <>
                                        <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                        <button
                                            onClick={() => setNavigation({
                                                level: 'campaign',
                                                campaignId: navigation.campaignId,
                                                campaignName: navigation.campaignName,
                                            })}
                                            className={`hover:text-white transition-colors ${navigation.level === 'campaign' ? 'text-white font-medium' : 'text-slate-400'
                                                }`}
                                        >
                                            {navigation.campaignName}
                                        </button>
                                    </>
                                )}
                                {navigation.adGroupName && (
                                    <>
                                        <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                        <span className="text-white font-medium">{navigation.adGroupName}</span>
                                    </>
                                )}
                            </div>
                            <h1 className="text-xl font-bold text-white mt-1">
                                {navigation.view === 'insights' ? 'Strategic Insights' :
                                    navigation.view === 'reports' ? 'AI Reports' :
                                        navigation.view === 'diagnostics' ? 'Diagnostics & N-Grams' :
                                            navigation.level === 'campaign' ? (
                                                (campaigns.find(c => String(c.id) === String(navigation.campaignId))?.advertisingChannelType === 'PERFORMANCE_MAX' ||
                                                    campaigns.find(c => String(c.id) === String(navigation.campaignId))?.name.toLowerCase().includes('pmax'))
                                                    ? 'Asset Groups'
                                                    : 'Ad Groups'
                                            ) :
                                                navigation.level === 'adgroup' ? (
                                                    (campaigns.find(c => String(c.id) === String(navigation.campaignId))?.advertisingChannelType === 'PERFORMANCE_MAX' ||
                                                        campaigns.find(c => String(c.id) === String(navigation.campaignId))?.name.toLowerCase().includes('pmax'))
                                                        ? 'Asset Group Details'
                                                        : 'Ad Group Details'
                                                ) :
                                                    'All Campaigns'}
                            </h1>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Account Selector */}
                            <div className="bg-slate-700/50 rounded-lg px-3 py-1.5 flex items-center gap-2 border border-slate-600/50">
                                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                <select
                                    value={selectedAccountId}
                                    onChange={(e) => {
                                        const newId = e.target.value;
                                        setSelectedAccountId(newId);
                                        router.push(`/?customerId=${newId}`);
                                    }}
                                    className="bg-transparent text-xs text-white border-none focus:ring-0 cursor-pointer appearance-none hover:text-blue-400 transition-colors"
                                >
                                    {filteredAccounts.map(acc => (
                                        <option key={acc.id} value={acc.id} className="bg-slate-800 text-white">
                                            {acc.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Date Range Selector */}
                            <div className="flex items-center gap-2">
                                <div className="bg-slate-700/50 rounded-lg px-3 py-1.5 flex items-center gap-2 border border-slate-600/50">
                                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <select
                                        value={dateRangeSelection}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setDateRangeSelection(val);
                                            if (val === 'last-month') {
                                                setDateRange(getLastMonthRange());
                                            } else if (val === 'last-30') {
                                                setDateRange({
                                                    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
                                                    end: new Date().toISOString().split('T')[0]
                                                });
                                            } else if (val === 'last-7') {
                                                setDateRange(getLast7DaysRange());
                                            }
                                        }}
                                        className="bg-transparent text-xs text-white border-none focus:ring-0 cursor-pointer appearance-none hover:text-blue-400 transition-colors"
                                    >
                                        <option value="last-month" className="bg-slate-800">Last Month</option>
                                        <option value="last-30" className="bg-slate-800">Last 30 Days</option>
                                        <option value="last-7" className="bg-slate-800">Last 7 Days</option>
                                        <option value="custom" className="bg-slate-800">Custom Range</option>
                                    </select>
                                </div>

                                {dateRangeSelection === 'custom' && (
                                    <div className="flex items-center gap-2 bg-slate-700/50 rounded-lg px-2 py-1 border border-slate-600/50 animate-in fade-in slide-in-from-left-2 duration-300">
                                        <input
                                            type="date"
                                            value={dateRange.start}
                                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                            className="bg-transparent text-[10px] text-white border-none focus:ring-0 p-0 w-24 cursor-pointer hover:text-blue-400 transition-colors"
                                        />
                                        <span className="text-slate-500 text-[10px]">to</span>
                                        <input
                                            type="date"
                                            value={dateRange.end}
                                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                            className="bg-transparent text-[10px] text-white border-none focus:ring-0 p-0 w-24 cursor-pointer hover:text-blue-400 transition-colors"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Hide Stopped Items Toggle */}
                            <button
                                onClick={() => setHideStopped(!hideStopped)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${hideStopped
                                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                    : 'bg-slate-700/50 border-slate-600/50 text-slate-400 hover:text-slate-300'
                                    }`}
                                title={hideStopped ? "Showing only Enabled items" : "Showing all items (including Paused)"}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {hideStopped ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    )}
                                </svg>
                                <span className="text-xs font-medium">
                                    {hideStopped ? 'Enabled Only' : 'All Statuses'}
                                </span>
                            </button>

                            {/* Windsor toggle hidden as requested */}

                            {/* AI Analysis Button */}
                            <button
                                onClick={() => setShowAIModal(true)}
                                className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-4 py-2 rounded-lg transition-all shadow-lg hover:shadow-violet-500/25 font-medium"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Analyze with AI
                            </button>

                            <button
                                onClick={() => signOut()}
                                className="text-sm text-slate-400 hover:text-red-400 transition-colors px-4 py-2 rounded-lg hover:bg-slate-700/50"
                            >
                                Sign out
                            </button>

                            {session?.user?.role === 'admin' && (
                                <a
                                    href="/admin"
                                    className="text-sm text-slate-400 hover:text-purple-400 transition-colors px-4 py-2 rounded-lg hover:bg-slate-700/50 flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Admin
                                </a>
                            )}
                        </div>
                    </div>
                </header>

                {/* AI Insights Modal */}
                <AIAnalysisModal
                    isOpen={showAIModal}
                    onClose={() => setShowAIModal(false)}
                    analysis={analysis}
                    analyzing={analyzing}
                    onAnalyze={() => runAnalysis()}
                    onAnalyzeStrategic={(category) => {
                        runAnalysis('category', category);
                    }}
                    onClear={() => { setAnalysis(""); setAnalyzing(false); }}
                    strategicBreakdown={strategicBreakdown}
                    language={language}
                    setLanguage={setLanguage}
                />

                {/* Error Alert */}
                {error && error.startsWith('QUOTA_EXCEEDED:') && (
                    <div className="mx-6 mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between group animate-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-amber-400">API Rate Limit Exceeded</p>
                                <p className="text-xs text-amber-400/70 mt-0.5">
                                    Google Ads API daily quota exhausted (Explorer Access).
                                    {error.split(':')[1] ? ` Retry in ~${error.split(':')[1]}h.` : ''}
                                    {' '}Consider applying for Standard Access.
                                </p>
                            </div>
                        </div>
                        <button onClick={() => setError(null)} className="p-2 hover:bg-amber-500/20 rounded-lg transition-colors">
                            <svg className="w-4 h-4 text-amber-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}
                {error && !error.startsWith('QUOTA_EXCEEDED:') && (
                    <div className="mx-6 mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between group animate-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-red-400">API Connection Error</p>
                                <p className="text-xs text-red-400/70 mt-0.5">
                                    {error.includes('invalid_grant')
                                        ? 'Your Google Ads Refresh Token has expired or been revoked. Please update the GOOGLE_ADS_REFRESH_TOKEN in .env.local'
                                        : error}
                                </p>
                            </div>
                        </div>
                        <button onClick={() => setError(null)} className="p-2 hover:bg-red-500/20 rounded-lg transition-colors">
                            <svg className="w-4 h-4 text-red-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}

                {navigation.view === 'insights' ? (
                    <StrategicInsights
                        campaigns={currentData as Campaign[]}
                        adGroups={adGroups}
                        strategicBreakdown={strategicBreakdown}
                        dateRange={dateRange}
                        selectedAccountId={selectedAccountId}
                        onCategoryFilter={handleCategoryFilter}
                        onClearFilter={() => setCategoryFilter(null)}
                        categoryFilter={categoryFilter}
                        enrichWithSmartBidding={enrichWithSmartBidding}
                        language={language}
                        setLanguage={setLanguage}
                        deviceBreakdown={deviceBreakdown}
                        searchTerms={searchTerms}
                        customerId={selectedAccountId}
                        filteredCampaignIds={filteredCampaignIds}
                        onNavigate={setNavigation}
                        auditSnapshotDate={auditSnapshotDate}
                    />
                ) : navigation.view === 'reports' ? (
                    <main className="flex-1 overflow-auto p-6">
                        <AIReportsHub
                            campaigns={enrichWithSmartBidding(campaigns)}
                            adGroups={adGroups}
                            searchTerms={searchTerms}
                            keywords={keywords}
                            ads={ads}
                            strategicBreakdown={strategicBreakdown}
                            language={language}
                            setLanguage={setLanguage}
                            customerId={selectedAccountId}
                            dateRange={dateRange}
                            userRole={((session?.user as any)?.role === 'admin') ? 'admin' : 'viewer'}
                        />
                    </main>
                ) : navigation.view === 'diagnostics' ? (
                    <main className="flex-1 overflow-auto p-6 space-y-6">
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <AccountHealthWidget
                                data={healthData || { overallScore: 0, overallGrade: 'N/A', checks: [], summary: '' }}
                                loading={loadingHealth}
                            />
                            <NGramInsights
                                searchTerms={healthData?.searchTerms || []}
                                loading={loadingHealth}
                            />
                        </div>
                    </main>
                ) : (
                    <main className="flex-1 overflow-auto p-6 space-y-6">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                            <div className="rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 shadow-lg">
                                <p className="text-sm font-medium text-blue-100">Total Spend</p>
                                <p className="text-2xl font-bold text-white mt-1">€{totalSpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                            </div>
                            <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 shadow-lg">
                                <p className="text-sm font-medium text-emerald-100">Conversions</p>
                                <p className="text-2xl font-bold text-white mt-1">{totalConversions.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                            </div>
                            <div className="rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 p-5 shadow-lg">
                                <p className="text-sm font-medium text-purple-100">Conv. Value</p>
                                <p className="text-2xl font-bold text-white mt-1">€{totalConversionValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                            </div>
                            <div className="rounded-xl bg-gradient-to-br from-pink-600 to-pink-700 p-5 shadow-lg">
                                <p className="text-sm font-medium text-pink-100">ROAS</p>
                                <p className="text-2xl font-bold text-white mt-1">{totalROAS.toFixed(2)}x</p>
                            </div>
                            <div className="rounded-xl bg-gradient-to-br from-violet-600 to-violet-700 p-5 shadow-lg">
                                <p className="text-sm font-medium text-violet-100">Clicks</p>
                                <p className="text-2xl font-bold text-white mt-1">{totalClicks.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-6">
                            {/* Data Table */}
                            <div className="w-full space-y-6">
                                <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden">
                                    <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <h2 className="font-semibold text-white">
                                                {navigation.level === 'account' && 'Campaigns'}
                                                {navigation.level === 'campaign' && (
                                                    (campaigns.find(c => c.id === navigation.campaignId)?.advertisingChannelType === 'PERFORMANCE_MAX' ||
                                                        campaigns.find(c => c.id === navigation.campaignId)?.name.toLowerCase().includes('pmax'))
                                                        ? 'Asset Groups'
                                                        : 'Ad Groups'
                                                )}
                                                {navigation.level === 'adgroup' && 'Performance'}
                                            </h2>
                                            {categoryFilter && navigation.level === 'account' && (
                                                <div className="flex items-center gap-2 bg-violet-500/20 border border-violet-500/30 rounded-lg px-3 py-1">
                                                    <span className="text-xs text-violet-300">Filtered: {
                                                        categoryFilter === 'pmax_sale' ? 'PMax – Sale' :
                                                            categoryFilter === 'pmax_aon' ? 'PMax – AON' :
                                                                categoryFilter === 'search_dsa' ? 'Search – DSA' :
                                                                    categoryFilter === 'search_nonbrand' ? 'Search – NonBrand' :
                                                                        categoryFilter === 'shopping' ? 'Shopping' :
                                                                            categoryFilter === 'upper_funnel' ? 'Video/Display' :
                                                                                categoryFilter === 'brand' ? 'Brand' : categoryFilter
                                                    }</span>
                                                    <button
                                                        onClick={() => setCategoryFilter(null)}
                                                        className="text-violet-400 hover:text-white transition-colors"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">
                                            {sortedData.length} {
                                                navigation.level === 'account' ? 'campaigns' :
                                                    (navigation.level === 'campaign' && assetGroups.length > 0) ? 'asset groups' : 'ad groups'
                                            }
                                        </span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                                                <tr>
                                                    <th className="px-4 py-3 font-medium">
                                                        <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-white">
                                                            Name
                                                            {sortBy === 'name' && (
                                                                <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                            )}
                                                        </button>
                                                    </th>
                                                    <th className="px-4 py-3 text-right font-medium">
                                                        <button onClick={() => handleSort('cost')} className="flex items-center gap-1 ml-auto hover:text-white">
                                                            Cost
                                                            {sortBy === 'cost' && (
                                                                <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                            )}
                                                        </button>
                                                    </th>
                                                    <th className="px-4 py-3 text-right font-medium">
                                                        <button onClick={() => handleSort('ctr')} className="flex items-center gap-1 ml-auto hover:text-white">
                                                            CTR
                                                            {sortBy === 'ctr' && (
                                                                <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                            )}
                                                        </button>
                                                    </th>
                                                    {navigation.level === 'account' && (
                                                        <>
                                                            <th className="px-4 py-3 text-right font-medium">
                                                                <button onClick={() => handleSort('conversions')} className="flex items-center gap-1 ml-auto hover:text-white">
                                                                    Conversions
                                                                    {sortBy === 'conversions' && (
                                                                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                    )}
                                                                </button>
                                                            </th>
                                                            <th className="px-4 py-3 text-right font-medium">
                                                                <button onClick={() => handleSort('cvr')} className="flex items-center gap-1 ml-auto hover:text-white">
                                                                    CVR
                                                                    {sortBy === 'cvr' && (
                                                                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                    )}
                                                                </button>
                                                            </th>
                                                            <th className="px-4 py-3 text-right font-medium">
                                                                <button onClick={() => handleSort('conversionValue')} className="flex items-center gap-1 ml-auto hover:text-white">
                                                                    Conv. Value
                                                                    {sortBy === 'conversionValue' && (
                                                                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                    )}
                                                                </button>
                                                            </th>
                                                            <th className="px-4 py-3 text-right font-medium">
                                                                <button onClick={() => handleSort('roas')} className="flex items-center gap-1 ml-auto hover:text-white">
                                                                    ROAS
                                                                    {sortBy === 'roas' && (
                                                                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                    )}
                                                                </button>
                                                            </th>
                                                            <th className="px-4 py-3 text-right font-medium">
                                                                <button onClick={() => handleSort('searchLostISRank')} className="flex items-center gap-1 ml-auto hover:text-white">
                                                                    Lost (Rank)
                                                                    {sortBy === 'searchLostISRank' && (
                                                                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                    )}
                                                                </button>
                                                            </th>
                                                            <th className="px-4 py-3 text-center font-medium">Type</th>
                                                            <th className="px-4 py-3 text-center font-medium">Bidding</th>
                                                        </>
                                                    )}
                                                    {navigation.level === 'campaign' && (
                                                        (campaigns.find(c => String(c.id) === String(navigation.campaignId))?.advertisingChannelType === 'PERFORMANCE_MAX' ||
                                                            campaigns.find(c => String(c.id) === String(navigation.campaignId))?.name.toLowerCase().includes('pmax')) ? (
                                                            <>
                                                                <th className="px-4 py-3 text-right font-medium">Ad Strength</th>
                                                                <th className="px-4 py-3 text-right font-medium"></th>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <th className="px-4 py-3 text-right font-medium">
                                                                    {(() => {
                                                                        const camp = campaigns.find(c => String(c.id) === String(navigation.campaignId));
                                                                        const isDisplay = camp?.advertisingChannelType === 'DISPLAY' ||
                                                                            camp?.name.toLowerCase().includes('remarketing') ||
                                                                            camp?.category?.includes('upper_funnel');
                                                                        return isDisplay ? 'Rel. CTR' : 'Avg QS';
                                                                    })()}
                                                                </th>
                                                                <th className="px-4 py-3 text-right font-medium">Ad Strength</th>
                                                                <th className="px-4 py-3 text-right font-medium">Poor Ads</th>
                                                            </>
                                                        )
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700">
                                                {sortedData.map((item: any) => (
                                                    <tr
                                                        key={item.id}
                                                        className="hover:bg-slate-700/30 transition-colors cursor-pointer"
                                                        onClick={() => {
                                                            // Standard navigation

                                                            if (navigation.level === 'account') {
                                                                setNavigation({
                                                                    level: 'campaign',
                                                                    campaignId: item.id,
                                                                    campaignName: item.name,
                                                                });
                                                            } else if (navigation.level === 'campaign') {
                                                                setNavigation({
                                                                    level: 'adgroup',
                                                                    campaignId: navigation.campaignId,
                                                                    campaignName: navigation.campaignName,
                                                                    adGroupId: item.id,
                                                                    adGroupName: item.name,
                                                                });
                                                            }
                                                        }}
                                                    >
                                                        <td className="px-4 py-4 font-medium text-white">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm mr-1">
                                                                    {(item.status === 'ENABLED' || item.status === 'enabled') ? '✅' : `⚠️ ${item.status || ''}`}
                                                                </span>
                                                                {item.name}
                                                                {navigation.level !== 'adgroup' && (
                                                                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                    </svg>
                                                                )}
                                                                {navigation.level === 'account' && selectedCampaignId === item.id && (
                                                                    <span className="text-xs text-violet-400 font-medium ml-1">Selected for analysis</span>
                                                                )}
                                                                {navigation.level === 'account' && selectedCampaignId !== item.id && (
                                                                    <span className="text-xs text-slate-500 italic ml-1">(click to select)</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 text-right text-slate-200">
                                                            <MetricCell
                                                                value={item.cost}
                                                                previous={item.previous?.cost}
                                                                format={(v) => `€${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                                                                invertColor={true}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-4 text-right">
                                                            <span className={`font-medium ${item.ctr >= 0.05 ? 'text-emerald-400' :
                                                                item.ctr >= 0.02 ? 'text-amber-400' : 'text-red-400'
                                                                }`}>
                                                                {(item.ctr * 100).toFixed(2)}%
                                                            </span>
                                                        </td>
                                                        {navigation.level === 'account' && (
                                                            <>
                                                                <td className="px-4 py-4 text-right text-slate-200">
                                                                    <MetricCell
                                                                        value={item.conversions || 0}
                                                                        previous={item.previous?.conversions}
                                                                        format={(v) => v.toLocaleString('en-US')}
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-4 text-right text-slate-400">
                                                                    {item.clicks > 0 ? ((item.conversions || 0) / item.clicks * 100).toFixed(2) : '0.00'}%
                                                                </td>
                                                                <td className="px-4 py-4 text-right">
                                                                    {item.conversionValue != null && item.conversionValue > 0 ? (
                                                                        <span className="text-slate-200">€{item.conversionValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                                                                    ) : (
                                                                        <span className="text-slate-500">—</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-4 text-right">
                                                                    <div className="flex flex-col items-end">
                                                                        {item.roas != null ? (
                                                                            <span className={`font-medium ${item.roas >= 3 ? 'text-emerald-400' : item.roas >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
                                                                                {item.roas.toFixed(2)}x
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-500">—</span>
                                                                        )}
                                                                        {item.roas != null && item.previous?.roas && (
                                                                            (() => {
                                                                                const delta = ((item.roas - item.previous.roas) / item.previous.roas) * 100;
                                                                                if (Math.abs(delta) < 0.5) return null;
                                                                                const color = delta > 0 ? 'text-emerald-400' : 'text-red-400';
                                                                                const arrow = delta > 0 ? '↑' : '↓';
                                                                                return (
                                                                                    <span className={`text-[10px] ${color} flex items-center`}>
                                                                                        {arrow} {Math.abs(delta).toFixed(0)}%
                                                                                    </span>
                                                                                );
                                                                            })()
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-4 text-right">
                                                                    {item.searchLostISRank != null && item.searchLostISRank > 0.15 ? (
                                                                        <span className="text-red-400 font-medium">
                                                                            {(item.searchLostISRank * 100).toFixed(1)}%
                                                                        </span>
                                                                    ) : item.searchLostISRank != null ? (
                                                                        <span className="text-slate-400">
                                                                            {(item.searchLostISRank * 100).toFixed(1)}%
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-slate-500">—</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-4 text-center">
                                                                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${item.category === 'pmax_sale' || item.category === 'pmax_aon' ? 'bg-purple-500/20 text-purple-400' :
                                                                        item.category === 'search_nonbrand' || item.category === 'search_dsa' ? 'bg-blue-500/20 text-blue-400' :
                                                                            item.category === 'upper_funnel' ? 'bg-orange-500/20 text-orange-400' :
                                                                                item.category === 'brand' ? 'bg-emerald-500/20 text-emerald-400' :
                                                                                    'bg-slate-600/50 text-slate-400'
                                                                        }`}>
                                                                        {item.category === 'pmax_sale' ? 'PMax – Sale' :
                                                                            item.category === 'pmax_aon' ? 'PMax – AON' :
                                                                                item.category === 'search_dsa' ? 'Search – DSA' :
                                                                                    item.category === 'search_nonbrand' ? 'Search' :
                                                                                        item.category === 'upper_funnel' ? 'Video/Display' :
                                                                                            item.category === 'brand' ? 'Brand' :
                                                                                                CHANNEL_TYPE_LABELS[String(item.advertisingChannelType).toUpperCase()] ||
                                                                                                CHANNEL_TYPE_LABELS[String(item.advertisingChannelType)] ||
                                                                                                (String(item.advertisingChannelType).toUpperCase().includes('MULTI_CHANNEL') ? 'PMax (Multi)' :
                                                                                                    String(item.advertisingChannelType).toUpperCase().includes('DISPLAY') ? 'Display' :
                                                                                                        item.advertisingChannelType || 'Other')}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-4 text-center">
                                                                    {(item as Campaign).biddingStrategyType ? (
                                                                        <span className="text-xs text-slate-300 bg-slate-700 px-2 py-1 rounded">
                                                                            {BIDDING_STRATEGY_LABELS[String((item as Campaign).biddingStrategyType).toUpperCase()] ||
                                                                                BIDDING_STRATEGY_LABELS[String((item as Campaign).biddingStrategyType)] ||
                                                                                String((item as Campaign).biddingStrategyType).replace('TARGET_', 't').replace('MAXIMIZE_', 'Max ').replace(/_/g, ' ')}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-slate-500 text-xs">—</span>
                                                                    )}
                                                                </td>
                                                            </>
                                                        )}
                                                        {navigation.level === 'campaign' && (
                                                            (campaigns.find(c => c.id === navigation.campaignId)?.advertisingChannelType === 'PERFORMANCE_MAX' ||
                                                                campaigns.find(c => c.id === navigation.campaignId)?.name.toLowerCase().includes('pmax')) ? (
                                                                <>
                                                                    <td className="px-4 py-4 text-right">
                                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getAdStrengthColor((item as any).strength || (item as any).adStrength || 'UNSPECIFIED')}`}>
                                                                            {(item as any).strength || (item as any).adStrength || 'UNSPECIFIED'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right"></td>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <td className="px-4 py-4 text-right">
                                                                        {(() => {
                                                                            const camp = campaigns.find(c => c.id === navigation.campaignId);
                                                                            const isDisplay = camp?.advertisingChannelType === 'DISPLAY' ||
                                                                                camp?.name.toLowerCase().includes('remarketing') ||
                                                                                camp?.category?.includes('upper_funnel');

                                                                            if (isDisplay) {
                                                                                return item.relativeCtr != null ? (
                                                                                    <span className={`font-medium ${item.relativeCtr >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                                                        {item.relativeCtr.toFixed(1)}x
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-slate-500">—</span>
                                                                                );
                                                                            }

                                                                            return (
                                                                                <>
                                                                                    {item.avgQualityScore !== null && item.avgQualityScore <= 6 ? (
                                                                                        <Tooltip text={getQSValueTip(item.avgQualityScore)}>
                                                                                            <span className={`font-medium ${getQSColor(item.avgQualityScore)} border-b border-dashed ${item.avgQualityScore <= 4 ? 'border-red-400/40' : 'border-amber-400/40'}`}>
                                                                                                {item.avgQualityScore.toFixed(1)}
                                                                                            </span>
                                                                                        </Tooltip>
                                                                                    ) : (
                                                                                        <span className={`font-medium ${getQSColor(item.avgQualityScore)}`}>
                                                                                            {item.avgQualityScore !== null ? item.avgQualityScore.toFixed(1) : '—'}
                                                                                        </span>
                                                                                    )}
                                                                                    {item.keywordsWithLowQS > 0 && (
                                                                                        <Tooltip text={`${item.keywordsWithLowQS} keyword${item.keywordsWithLowQS > 1 ? 's' : ''} with Quality Score below 5. Click into this ad group to see which keywords need attention.`}>
                                                                                            <span className="ml-1 text-xs text-red-400 border-b border-dashed border-red-400/40">
                                                                                                ({item.keywordsWithLowQS} low)
                                                                                            </span>
                                                                                        </Tooltip>
                                                                                    )}
                                                                                </>
                                                                            );
                                                                        })()}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right">
                                                                        {((item as any).adStrength === 'POOR' || (item as any).adStrength === 'AVERAGE') ? (
                                                                            <Tooltip text={getAdStrengthTip((item as any).adStrength || 'UNSPECIFIED')}>
                                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border-b border-dashed ${(item as any).adStrength === 'POOR' ? 'border-red-400/40' : 'border-amber-400/40'} ${getAdStrengthColor((item as any).adStrength || 'UNSPECIFIED')}`}>
                                                                                    {(item as any).adStrength || 'UNSPECIFIED'}
                                                                                </span>
                                                                            </Tooltip>
                                                                        ) : (
                                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getAdStrengthColor((item as any).adStrength || 'UNSPECIFIED')}`}>
                                                                                {(item as any).adStrength || 'UNSPECIFIED'}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right">
                                                                        {item.poorAdsCount > 0 ? (
                                                                            <Tooltip text={`${item.poorAdsCount} of ${item.adsCount} ad${item.adsCount > 1 ? 's' : ''} have Poor or Average strength. Click into this ad group to review and improve headline/description diversity.`}>
                                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border-b border-dashed border-red-400/40">
                                                                                    {item.poorAdsCount}/{item.adsCount}
                                                                                </span>
                                                                            </Tooltip>
                                                                        ) : (
                                                                            <span className="text-slate-500 text-xs">0</span>
                                                                        )}
                                                                    </td>
                                                                </>
                                                            )
                                                        )}
                                                    </tr>
                                                ))}
                                                {sortedData.length === 0 && (
                                                    <tr>
                                                        <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                                                            No data found.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Ad Group Detail Sections */}
                                {navigation.level === 'adgroup' && currentAdGroup && (
                                    <>
                                        {pmaxAssets.length > 0 ? (
                                            <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden mb-6">
                                                <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                                                    <h2 className="font-semibold text-white">Asset Group Assets</h2>
                                                    <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">
                                                        {pmaxAssets.length} assets
                                                    </span>
                                                </div>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left text-sm">
                                                        <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                                                            <tr>
                                                                <th className="px-4 py-3 font-medium">Asset Type</th>
                                                                <th className="px-4 py-3 font-medium">Content</th>
                                                                <th className="px-4 py-3 text-center font-medium">Perf. Label</th>
                                                                <th className="px-4 py-3 text-center font-medium">Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-700">
                                                            {pmaxAssets.map((asset) => (
                                                                <tr key={`${asset.id}-${asset.fieldType}`} className="hover:bg-slate-700/30">
                                                                    <td className="px-4 py-3 text-white">
                                                                        <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded text-xs border border-slate-600">
                                                                            {ASSET_FIELD_TYPE_LABELS[asset.fieldType] || asset.fieldType}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-white max-w-md">
                                                                        {asset.imageUrl ? (
                                                                            <div className="flex items-center gap-3">
                                                                                <img
                                                                                    src={asset.imageUrl}
                                                                                    alt={asset.name || 'Asset preview'}
                                                                                    className="w-12 h-12 object-cover rounded border border-slate-600 flex-shrink-0"
                                                                                    loading="lazy"
                                                                                />
                                                                                <span className="text-slate-300 text-xs truncate">{asset.name || ASSET_FIELD_TYPE_LABELS[asset.fieldType] || 'Image'}</span>
                                                                            </div>
                                                                        ) : asset.youtubeVideoId ? (
                                                                            <div className="flex items-center gap-3">
                                                                                <img
                                                                                    src={`https://img.youtube.com/vi/${asset.youtubeVideoId}/default.jpg`}
                                                                                    alt={asset.name || 'Video preview'}
                                                                                    className="w-16 h-12 object-cover rounded border border-slate-600 flex-shrink-0"
                                                                                    loading="lazy"
                                                                                />
                                                                                <span className="text-slate-300 text-xs truncate">{asset.name || asset.youtubeVideoId}</span>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="truncate block" title={asset.text}>{asset.text || asset.name || "—"}</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        {(asset.performanceLabel === 'LOW' || asset.performanceLabel === 'PENDING' || asset.performanceLabel === 'LEARNING') ? (
                                                                            <Tooltip text={getPMaxPerfTip(asset.performanceLabel)}>
                                                                                <span className={`px-2 py-1 rounded text-xs font-bold border-b border-dashed ${asset.performanceLabel === 'LOW' ? 'bg-red-500/20 text-red-400 border-red-400/40' : 'bg-slate-600/50 text-slate-400 border-slate-400/40'
                                                                                    }`}>
                                                                                    {PERFORMANCE_LABEL_LABELS[asset.performanceLabel] || asset.performanceLabel}
                                                                                </span>
                                                                            </Tooltip>
                                                                        ) : (
                                                                            <span className={`px-2 py-1 rounded text-xs font-bold ${(asset.performanceLabel === 'BEST' || asset.performanceLabel === 'GOOD') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600/50 text-slate-400'}`}>
                                                                                {PERFORMANCE_LABEL_LABELS[asset.performanceLabel || 'UNKNOWN'] || asset.performanceLabel || 'Pending'}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center text-xs text-slate-400">
                                                                        {asset.status === 'ENABLED' ? '✅ ENABLED' : '⚠️ ' + asset.status}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Keywords with QS */}
                                                <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden">
                                                    <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                                                        <h2 className="font-semibold text-white">Keywords & Quality Score</h2>
                                                        <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">
                                                            {keywords.length} keywords
                                                        </span>
                                                    </div>
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-left text-sm">
                                                            <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                                                                <tr>
                                                                    <th className="px-4 py-3 font-medium">Keyword</th>
                                                                    <th className="px-4 py-3 text-center font-medium">QS</th>
                                                                    <th className="px-4 py-3 text-center font-medium">Exp. CTR</th>
                                                                    <th className="px-4 py-3 text-center font-medium">Ad Rel.</th>
                                                                    <th className="px-4 py-3 text-center font-medium">LP Exp.</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-700">
                                                                {keywords.map((kw) => (
                                                                    <tr key={kw.id} className="hover:bg-slate-700/30">
                                                                        <td className="px-4 py-3 text-white">
                                                                            <span className="text-xs text-slate-500 mr-1">[{kw.matchType}]</span>
                                                                            {kw.text}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-center">
                                                                            {kw.qualityScore !== null && kw.qualityScore <= 6 ? (
                                                                                <Tooltip text={getQSValueTip(kw.qualityScore)}>
                                                                                    <span className={`font-bold text-lg ${getQSColor(kw.qualityScore)} border-b border-dashed ${kw.qualityScore <= 4 ? 'border-red-400/40' : 'border-amber-400/40'}`}>
                                                                                        {kw.qualityScore}
                                                                                    </span>
                                                                                </Tooltip>
                                                                            ) : (
                                                                                <span className={`font-bold text-lg ${getQSColor(kw.qualityScore)}`}>
                                                                                    {kw.qualityScore ?? '—'}
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-center">
                                                                            {kw.expectedCtr ? (
                                                                                kw.expectedCtr === 'BELOW_AVERAGE' ? (
                                                                                    <Tooltip text={getQSComponentTip('expectedCtr', kw.expectedCtr)}>
                                                                                        <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 border-b border-dashed border-red-400/40">
                                                                                            BELOW AVG
                                                                                        </span>
                                                                                    </Tooltip>
                                                                                ) : (
                                                                                    <span className={`text-xs px-2 py-0.5 rounded ${kw.expectedCtr === 'ABOVE_AVERAGE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600/50 text-slate-300'}`}>
                                                                                        {kw.expectedCtr.replace('_', ' ')}
                                                                                    </span>
                                                                                )
                                                                            ) : <span className="text-slate-600">—</span>}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-center">
                                                                            {kw.adRelevance ? (
                                                                                kw.adRelevance === 'BELOW_AVERAGE' ? (
                                                                                    <Tooltip text={getQSComponentTip('adRelevance', kw.adRelevance)}>
                                                                                        <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 border-b border-dashed border-red-400/40">
                                                                                            BELOW AVG
                                                                                        </span>
                                                                                    </Tooltip>
                                                                                ) : (
                                                                                    <span className={`text-xs px-2 py-0.5 rounded ${kw.adRelevance === 'ABOVE_AVERAGE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600/50 text-slate-300'}`}>
                                                                                        {kw.adRelevance.replace('_', ' ')}
                                                                                    </span>
                                                                                )
                                                                            ) : <span className="text-slate-600">—</span>}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-center">
                                                                            {kw.landingPageExperience ? (
                                                                                kw.landingPageExperience === 'BELOW_AVERAGE' ? (
                                                                                    <Tooltip text={getQSComponentTip('landingPageExperience', kw.landingPageExperience)}>
                                                                                        <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 border-b border-dashed border-red-400/40">
                                                                                            BELOW AVG
                                                                                        </span>
                                                                                    </Tooltip>
                                                                                ) : (
                                                                                    <span className={`text-xs px-2 py-0.5 rounded ${kw.landingPageExperience === 'ABOVE_AVERAGE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600/50 text-slate-300'}`}>
                                                                                        {kw.landingPageExperience.replace('_', ' ')}
                                                                                    </span>
                                                                                )
                                                                            ) : <span className="text-slate-600">—</span>}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                                {keywords.length === 0 && (
                                                                    <tr>
                                                                        <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                                                                            No keywords found.
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>

                                                {/* Ads with Strength */}
                                                <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden">
                                                    <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                                                        <h2 className="font-semibold text-white">Ads & Ad Strength</h2>
                                                        <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">
                                                            {ads.length} ads
                                                        </span>
                                                    </div>
                                                    <div className="p-4 space-y-4">
                                                        {ads.map((ad) => (
                                                            <div key={ad.id} className="bg-slate-700/30 rounded-lg p-4 border border-slate-700">
                                                                <div className="flex items-center justify-between mb-3">
                                                                    {(ad.adStrength === 'POOR' || ad.adStrength === 'AVERAGE') ? (
                                                                        <Tooltip text={getAdStrengthTip(ad.adStrength, ad.headlinesCount, ad.descriptionsCount, ad.type)}>
                                                                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border-b border-dashed ${ad.adStrength === 'POOR' ? 'border-red-400/40' : 'border-amber-400/40'} ${getAdStrengthColor(ad.adStrength)}`}>
                                                                                {ad.adStrength}
                                                                            </span>
                                                                        </Tooltip>
                                                                    ) : (
                                                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getAdStrengthColor(ad.adStrength)}`}>
                                                                            {ad.adStrength}
                                                                        </span>
                                                                    )}
                                                                    <div className="flex items-center gap-4 text-sm">
                                                                        {ad.headlinesCount < (ad.type === 'RESPONSIVE_DISPLAY_AD' ? 5 : 10) ? (
                                                                            <Tooltip text={`Add more headlines (currently ${ad.headlinesCount}/${ad.type === 'RESPONSIVE_DISPLAY_AD' ? 5 : 15}). Aim for at least ${ad.type === 'RESPONSIVE_DISPLAY_AD' ? 5 : 10} unique headlines with diverse messaging and keywords.`}>
                                                                                <span className="text-amber-400 border-b border-dashed border-amber-400/40">
                                                                                    Headlines: <strong>{ad.headlinesCount}</strong>/{ad.type === 'RESPONSIVE_DISPLAY_AD' ? '5' : '15'}
                                                                                </span>
                                                                            </Tooltip>
                                                                        ) : (
                                                                            <span className="text-slate-400">
                                                                                Headlines: <strong>{ad.headlinesCount}</strong>/{ad.type === 'RESPONSIVE_DISPLAY_AD' ? '5' : '15'}
                                                                            </span>
                                                                        )}
                                                                        {ad.descriptionsCount < (ad.type === 'RESPONSIVE_DISPLAY_AD' ? 5 : 3) ? (
                                                                            <Tooltip text={`Add more descriptions (currently ${ad.descriptionsCount}/${ad.type === 'RESPONSIVE_DISPLAY_AD' ? 5 : 4}). Each description should highlight a unique benefit or call-to-action.`}>
                                                                                <span className="text-amber-400 border-b border-dashed border-amber-400/40">
                                                                                    Descriptions: <strong>{ad.descriptionsCount}</strong>/{ad.type === 'RESPONSIVE_DISPLAY_AD' ? '5' : '4'}
                                                                                </span>
                                                                            </Tooltip>
                                                                        ) : (
                                                                            <span className="text-slate-400">
                                                                                Descriptions: <strong>{ad.descriptionsCount}</strong>/{ad.type === 'RESPONSIVE_DISPLAY_AD' ? '5' : '4'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {ad.headlines.slice(0, 6).map((headline, idx) => (
                                                                        <span key={idx} className="text-xs bg-slate-600/50 text-slate-300 px-2 py-1 rounded">
                                                                            {headline}
                                                                        </span>
                                                                    ))}
                                                                    {ad.headlines.length > 6 && (
                                                                        <span className="text-xs text-slate-500">
                                                                            +{ad.headlines.length - 6} more
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {ads.length === 0 && (
                                                            <p className="text-slate-500 text-sm text-center py-4">No ads found.</p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Negative Keywords */}
                                                <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden">
                                                    <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                                                        <h2 className="font-semibold text-white">Negative Keywords</h2>
                                                        <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">
                                                            {negativeKeywords.length} keywords
                                                        </span>
                                                    </div>
                                                    <div className="p-4">
                                                        {negativeKeywords.length > 0 ? (
                                                            <div className="flex flex-wrap gap-2">
                                                                {negativeKeywords.map((kw) => (
                                                                    <span
                                                                        key={kw.id}
                                                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-sm border border-red-500/20"
                                                                    >
                                                                        <span className="text-xs text-red-500/70">[{kw.matchType}]</span>
                                                                        {kw.text}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <p className="text-slate-500 text-sm">No negative keywords configured.</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>

                        </div>

                    </main>
                )
                }
            </div >
        </div >
    );
}
