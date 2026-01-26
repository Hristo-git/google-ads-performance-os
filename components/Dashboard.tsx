"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import { Campaign, AdGroup, NegativeKeyword, KeywordWithQS, AdWithStrength, Account, NavigationState } from "@/types/google-ads";

export default function Dashboard() {
    const { data: session, status } = useSession();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
    const [negativeKeywords, setNegativeKeywords] = useState<NegativeKeyword[]>([]);
    const [keywords, setKeywords] = useState<KeywordWithQS[]>([]);
    const [ads, setAds] = useState<AdWithStrength[]>([]);
    const [account, setAccount] = useState<Account | null>(null);
    const [loading, setLoading] = useState(false);
    const [analysis, setAnalysis] = useState("");
    const [analyzing, setAnalyzing] = useState(false);
    const [navigation, setNavigation] = useState<NavigationState>({ level: 'account' });
    const [dataSource, setDataSource] = useState<'google-ads' | 'windsor'>('google-ads');
    const [loadingMessage, setLoadingMessage] = useState<string>("");
    const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

    useEffect(() => {
        if (session) {
            fetchData();
        }
    }, [session]);

    useEffect(() => {
        if (navigation.level === 'adgroup' && navigation.adGroupId) {
            fetchAdGroupDetails(navigation.adGroupId);
        }
    }, [navigation]);

    const fetchData = async () => {
        setLoading(true);
        setSelectedCampaignId(null);
        try {
            if (dataSource === 'windsor') {
                // Fetch Windsor.ai data
                setLoadingMessage("Connecting to Windsor.ai...");
                const camRes = await fetch("/api/windsor/campaigns");
                setLoadingMessage("Processing campaign data...");
                const camData = await camRes.json();

                if (camData.campaigns) {
                    setCampaigns(camData.campaigns);
                    setAccount({ name: 'Windsor.ai Data', id: 'windsor', currency: 'USD', timezone: 'America/New_York' });
                }
                // Ad groups not available from Windsor
                setAdGroups([]);
            } else {
                // Fetch Google Ads API data
                setLoadingMessage("Fetching Google Ads data...");
                const [accRes, camRes, agRes] = await Promise.all([
                    fetch("/api/google-ads/account"),
                    fetch("/api/google-ads/campaigns"),
                    fetch("/api/google-ads/ad-groups")
                ]);

                setLoadingMessage("Processing data...");
                const accData = await accRes.json();
                const camData = await camRes.json();
                const agData = await agRes.json();

                if (accData.account) setAccount(accData.account);
                if (camData.campaigns) setCampaigns(camData.campaigns);
                if (agData.adGroups) setAdGroups(agData.adGroups);
            }
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setLoading(false);
            setLoadingMessage("");
        }
    };

    const fetchAdGroupDetails = async (adGroupId: string) => {
        try {
            const [nkRes, kwRes, adsRes] = await Promise.all([
                fetch(`/api/google-ads/negative-keywords?adGroupId=${adGroupId}`),
                fetch(`/api/google-ads/keywords?adGroupId=${adGroupId}`),
                fetch(`/api/google-ads/ads?adGroupId=${adGroupId}`)
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

    const runAnalysis = async () => {
        const dataToAnalyze = getAnalysisContext();
        if (!dataToAnalyze) return;

        setAnalyzing(true);
        try {
            const res = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dataToAnalyze)
            });
            const data = await res.json();
            setAnalysis(data.analysis);
        } catch (error) {
            console.error("Analysis failed:", error);
            setAnalysis("Failed to generate analysis.");
        } finally {
            setAnalyzing(false);
        }
    };

    const getAnalysisContext = () => {
        // For Windsor mode with selected campaign
        if (dataSource === 'windsor' && selectedCampaignId) {
            const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
            return { campaign: selectedCampaign, campaigns: [selectedCampaign], level: 'account' };
        }

        switch (navigation.level) {
            case 'account':
                return { campaigns, level: 'account' };
            case 'campaign':
                const campaignAdGroups = adGroups.filter(ag => ag.campaignId === navigation.campaignId);
                const campaign = campaigns.find(c => c.id === navigation.campaignId);
                return { campaign, adGroups: campaignAdGroups, level: 'campaign' };
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

    if (status === "loading") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="text-slate-300 text-lg">Loading session...</div>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center space-y-8 px-4">
                <div className="text-center space-y-4">
                    <h1 className="text-5xl font-bold text-white tracking-tight">
                        Google Ads Performance OS
                    </h1>
                    <p className="text-slate-400 text-lg max-w-md">
                        Connect your Google Ads account and get AI-powered insights to optimize your campaigns.
                    </p>
                </div>
                <button
                    onClick={() => signIn("google")}
                    className="flex items-center gap-3 rounded-lg bg-white px-8 py-4 font-semibold text-slate-900 shadow-lg transition hover:bg-slate-100 hover:shadow-xl"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Sign in with Google
                </button>
            </div>
        );
    }

    // Get current data based on navigation level
    const getCurrentData = () => {
        switch (navigation.level) {
            case 'account':
                return campaigns;
            case 'campaign':
                return adGroups.filter(ag => ag.campaignId === navigation.campaignId);
            case 'adgroup':
                return [adGroups.find(ag => ag.id === navigation.adGroupId)].filter(Boolean);
            default:
                return [];
        }
    };

    const currentData = getCurrentData();
    const totalSpend = currentData.reduce((sum, item) => sum + (item?.cost || 0), 0);
    const totalConversions = currentData.reduce((sum, item) => sum + (item?.conversions || 0), 0);
    const totalClicks = currentData.reduce((sum, item) => sum + (item?.clicks || 0), 0);
    const totalImpressions = currentData.reduce((sum, item) => sum + (item?.impressions || 0), 0);

    // Current selected ad group for detail view
    const currentAdGroup = navigation.level === 'adgroup'
        ? adGroups.find(ag => ag.id === navigation.adGroupId)
        : null;

    return (
        <div className="min-h-screen bg-slate-900 flex">
            {/* Sidebar */}
            <Sidebar
                campaigns={campaigns}
                adGroups={adGroups}
                navigation={navigation}
                onNavigate={setNavigation}
                accountName={account?.name || ''}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-h-screen overflow-hidden relative">
                {/* Loading Overlay */}
                {loading && (
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="bg-slate-800 rounded-xl p-8 shadow-2xl border border-slate-700 text-center">
                            <div className="relative w-16 h-16 mx-auto mb-4">
                                <div className="absolute inset-0 border-4 border-slate-600 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-violet-500 rounded-full border-t-transparent animate-spin"></div>
                            </div>
                            <p className="text-white font-medium mb-1">
                                {dataSource === 'windsor' ? 'Loading Windsor.ai Data' : 'Loading Google Ads Data'}
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
                                    {account?.name || 'Account'}
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
                                {navigation.level === 'account' && 'All Campaigns'}
                                {navigation.level === 'campaign' && 'Ad Groups'}
                                {navigation.level === 'adgroup' && 'Ad Group Details'}
                            </h1>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Data Source Selector */}
                            <div className="flex items-center gap-2 bg-slate-700/50 rounded-lg p-1">
                                <button
                                    onClick={() => { setDataSource('google-ads'); fetchData(); }}
                                    className={`text-xs px-3 py-1.5 rounded transition-all ${dataSource === 'google-ads'
                                        ? 'bg-blue-600 text-white font-medium'
                                        : 'text-slate-400 hover:text-white'
                                        }`}
                                >
                                    Google Ads API
                                </button>
                                <button
                                    onClick={() => { setDataSource('windsor'); fetchData(); }}
                                    className={`text-xs px-3 py-1.5 rounded transition-all ${dataSource === 'windsor'
                                        ? 'bg-violet-600 text-white font-medium'
                                        : 'text-slate-400 hover:text-white'
                                        }`}
                                >
                                    Windsor.ai
                                </button>
                            </div>
                            <button
                                onClick={() => signOut()}
                                className="text-sm text-slate-400 hover:text-red-400 transition-colors px-4 py-2 rounded-lg hover:bg-slate-700/50"
                            >
                                Sign out
                            </button>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-6 space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 shadow-lg">
                            <p className="text-sm font-medium text-blue-100">Total Spend</p>
                            <p className="text-2xl font-bold text-white mt-1">${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 shadow-lg">
                            <p className="text-sm font-medium text-emerald-100">Conversions</p>
                            <p className="text-2xl font-bold text-white mt-1">{totalConversions.toLocaleString()}</p>
                        </div>
                        <div className="rounded-xl bg-gradient-to-br from-violet-600 to-violet-700 p-5 shadow-lg">
                            <p className="text-sm font-medium text-violet-100">Clicks</p>
                            <p className="text-2xl font-bold text-white mt-1">{totalClicks.toLocaleString()}</p>
                        </div>
                        <div className="rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 p-5 shadow-lg">
                            <p className="text-sm font-medium text-amber-100">Impressions</p>
                            <p className="text-2xl font-bold text-white mt-1">{totalImpressions.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        {/* Data Table */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                                    <h2 className="font-semibold text-white">
                                        {navigation.level === 'account' && 'Campaigns'}
                                        {navigation.level === 'campaign' && 'Ad Groups'}
                                        {navigation.level === 'adgroup' && 'Performance'}
                                    </h2>
                                    <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">
                                        {currentData.length} {navigation.level === 'account' ? 'campaigns' : 'ad groups'}
                                    </span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                                            <tr>
                                                <th className="px-4 py-3 font-medium">Name</th>
                                                <th className="px-4 py-3 text-right font-medium">Cost</th>
                                                <th className="px-4 py-3 text-right font-medium">CTR</th>
                                                {navigation.level === 'account' && (
                                                    <>
                                                        <th className="px-4 py-3 text-right font-medium">Impr. Share</th>
                                                        <th className="px-4 py-3 text-right font-medium">Lost (Rank)</th>
                                                    </>
                                                )}
                                                {navigation.level === 'campaign' && (
                                                    <>
                                                        <th className="px-4 py-3 text-right font-medium">Avg QS</th>
                                                        <th className="px-4 py-3 text-right font-medium">Poor Ads</th>
                                                    </>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700">
                                            {currentData.map((item: any) => (
                                                <tr
                                                    key={item.id}
                                                    className={`hover:bg-slate-700/30 transition-colors cursor-pointer ${
                                                        dataSource === 'windsor' && selectedCampaignId === item.id
                                                            ? 'bg-violet-600/20 ring-1 ring-violet-500'
                                                            : ''
                                                        }`}
                                                    onClick={() => {
                                                        // Windsor mode: select campaign for analysis
                                                        if (dataSource === 'windsor' && navigation.level === 'account') {
                                                            setSelectedCampaignId(selectedCampaignId === item.id ? null : item.id);
                                                            return;
                                                        }

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
                                                            <span className={`w-2 h-2 rounded-full ${item.status === 'ENABLED' ? 'bg-emerald-400' : 'bg-slate-500'
                                                                }`} />
                                                            {item.name}
                                                            {navigation.level !== 'adgroup' && !(dataSource === 'windsor' && navigation.level === 'account') && (
                                                                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                </svg>
                                                            )}
                                                            {dataSource === 'windsor' && navigation.level === 'account' && selectedCampaignId === item.id && (
                                                                <span className="text-xs text-violet-400 font-medium ml-1">Selected for analysis</span>
                                                            )}
                                                            {dataSource === 'windsor' && navigation.level === 'account' && selectedCampaignId !== item.id && (
                                                                <span className="text-xs text-slate-500 italic ml-1">(click to select)</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-right text-slate-200">${item.cost.toFixed(2)}</td>
                                                    <td className="px-4 py-4 text-right">
                                                        <span className={`font-medium ${item.ctr >= 0.05 ? 'text-emerald-400' :
                                                            item.ctr >= 0.02 ? 'text-amber-400' : 'text-red-400'
                                                            }`}>
                                                            {(item.ctr * 100).toFixed(2)}%
                                                        </span>
                                                    </td>
                                                    {navigation.level === 'account' && (
                                                        <>
                                                            <td className="px-4 py-4 text-right">
                                                                <span className={`font-medium ${getISColor(item.searchImpressionShare)}`}>
                                                                    {item.searchImpressionShare !== null
                                                                        ? `${(item.searchImpressionShare * 100).toFixed(0)}%`
                                                                        : '—'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-4 text-right">
                                                                {item.searchLostISRank !== null && item.searchLostISRank > 0.15 ? (
                                                                    <span className="text-red-400 font-medium">
                                                                        {(item.searchLostISRank * 100).toFixed(1)}% ⚠️
                                                                    </span>
                                                                ) : item.searchLostISRank !== null ? (
                                                                    <span className="text-slate-400">
                                                                        {(item.searchLostISRank * 100).toFixed(1)}%
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-slate-500">—</span>
                                                                )}
                                                            </td>
                                                        </>
                                                    )}
                                                    {navigation.level === 'campaign' && (
                                                        <>
                                                            <td className="px-4 py-4 text-right">
                                                                <span className={`font-medium ${getQSColor(item.avgQualityScore)}`}>
                                                                    {item.avgQualityScore !== null
                                                                        ? item.avgQualityScore.toFixed(1)
                                                                        : '—'}
                                                                </span>
                                                                {item.keywordsWithLowQS > 0 && (
                                                                    <span className="ml-1 text-xs text-red-400">
                                                                        ({item.keywordsWithLowQS} low)
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-4 text-right">
                                                                {item.poorAdsCount > 0 ? (
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">
                                                                        {item.poorAdsCount}/{item.adsCount}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-slate-400">{item.adsCount} ads</span>
                                                                )}
                                                            </td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                            {currentData.length === 0 && (
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
                                                                <span className={`font-bold text-lg ${getQSColor(kw.qualityScore)}`}>
                                                                    {kw.qualityScore ?? '—'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <span className={`text-xs px-2 py-0.5 rounded ${kw.expectedCtr === 'ABOVE_AVERAGE' ? 'bg-emerald-500/20 text-emerald-400' :
                                                                    kw.expectedCtr === 'AVERAGE' ? 'bg-slate-600/50 text-slate-300' :
                                                                        'bg-red-500/20 text-red-400'
                                                                    }`}>
                                                                    {kw.expectedCtr.replace('_', ' ')}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <span className={`text-xs px-2 py-0.5 rounded ${kw.adRelevance === 'ABOVE_AVERAGE' ? 'bg-emerald-500/20 text-emerald-400' :
                                                                    kw.adRelevance === 'AVERAGE' ? 'bg-slate-600/50 text-slate-300' :
                                                                        'bg-red-500/20 text-red-400'
                                                                    }`}>
                                                                    {kw.adRelevance.replace('_', ' ')}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <span className={`text-xs px-2 py-0.5 rounded ${kw.landingPageExperience === 'ABOVE_AVERAGE' ? 'bg-emerald-500/20 text-emerald-400' :
                                                                    kw.landingPageExperience === 'AVERAGE' ? 'bg-slate-600/50 text-slate-300' :
                                                                        'bg-red-500/20 text-red-400'
                                                                    }`}>
                                                                    {kw.landingPageExperience.replace('_', ' ')}
                                                                </span>
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
                                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getAdStrengthColor(ad.adStrength)}`}>
                                                            {ad.adStrength}
                                                        </span>
                                                        <div className="flex items-center gap-4 text-sm">
                                                            <span className={`${ad.headlinesCount < 10 ? 'text-red-400' : 'text-slate-400'}`}>
                                                                Headlines: <strong>{ad.headlinesCount}</strong>/15
                                                                {ad.headlinesCount < 10 && ' ⚠️'}
                                                            </span>
                                                            <span className={`${ad.descriptionsCount < 3 ? 'text-red-400' : 'text-slate-400'}`}>
                                                                Descriptions: <strong>{ad.descriptionsCount}</strong>/4
                                                                {ad.descriptionsCount < 3 && ' ⚠️'}
                                                            </span>
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
                        </div>

                        {/* AI Insights Panel */}
                        <div className="lg:col-span-1">
                            <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700 p-6 shadow-lg sticky top-24">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-violet-500 rounded-full animate-pulse"></div>
                                        <h2 className="font-semibold text-white">AI Insights</h2>
                                    </div>
                                    <button
                                        onClick={runAnalysis}
                                        disabled={analyzing || currentData.length === 0}
                                        className="text-xs bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {analyzing ? (
                                            <span className="flex items-center gap-2">
                                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                Analyzing...
                                            </span>
                                        ) : 'Analyze'}
                                    </button>
                                </div>
                                <div className="text-xs text-slate-500 mb-3 px-2 py-1 bg-slate-700/30 rounded">
                                    Context: {
                                        dataSource === 'windsor' && selectedCampaignId
                                            ? `Campaign: ${campaigns.find(c => c.id === selectedCampaignId)?.name || 'Selected'}`
                                            : navigation.level === 'account' ? 'All Campaigns'
                                            : navigation.level === 'campaign' ? navigation.campaignName
                                            : navigation.adGroupName
                                    }
                                </div>
                                <div className="text-sm text-slate-300 min-h-[240px] whitespace-pre-wrap leading-relaxed">
                                    {analysis || (
                                        <div className="text-slate-500 space-y-3">
                                            <p>Click 'Analyze' to get AI insights for the current view.</p>
                                            <div className="border-t border-slate-700 pt-3 space-y-2">
                                                <p className="text-xs text-slate-600">Analysis includes:</p>
                                                <ul className="text-xs text-slate-600 space-y-1">
                                                    {navigation.level === 'account' && (
                                                        <>
                                                            <li>• Impression Share analysis</li>
                                                            <li>• Rank loss opportunities</li>
                                                            <li>• Budget recommendations</li>
                                                        </>
                                                    )}
                                                    {navigation.level === 'campaign' && (
                                                        <>
                                                            <li>• Quality Score insights</li>
                                                            <li>• Ad Strength improvements</li>
                                                            <li>• Performance bottlenecks</li>
                                                        </>
                                                    )}
                                                    {navigation.level === 'adgroup' && (
                                                        <>
                                                            <li>• Keyword QS breakdown</li>
                                                            <li>• Ad copy recommendations</li>
                                                            <li>• Negative keyword suggestions</li>
                                                        </>
                                                    )}
                                                </ul>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
