"use client";

import { useState } from "react";
import StrategicBreakdown from "./StrategicBreakdown";
import DeviceBreakdown from "./DeviceBreakdown";
import EnhancedSearchTerms from "./EnhancedSearchTerms";
import DayHourHeatmap from "./DayHourHeatmap";
import LandingPagesTab from "./LandingPagesTab";
import ConversionBreakdown from "./ConversionBreakdown";
import GeographicPerformance from "./GeographicPerformance";
import NegativeKeywordMiner from "./NegativeKeywordMiner";
import ReactMarkdown from 'react-markdown';
import { Campaign, AdGroup, NavigationState, DeviceBreakdown as DeviceBreakdownType, SearchTerm } from "@/types/google-ads";

interface StrategicInsightsProps {
    campaigns: Campaign[];
    adGroups: AdGroup[];
    strategicBreakdown: any;
    dateRange: { start: string; end: string };
    selectedAccountId: string;
    onCategoryFilter: (category: string) => void;
    onClearFilter: () => void;
    categoryFilter: string | null;
    enrichWithSmartBidding: (camps: any[]) => any[];
    language: 'bg' | 'en';
    setLanguage: (lang: 'bg' | 'en') => void;
    deviceBreakdown: DeviceBreakdownType[];
    searchTerms: SearchTerm[];
    customerId: string;
    filteredCampaignIds?: string[];
    onNavigate?: (nav: NavigationState) => void;
}

export default function StrategicInsights({
    campaigns,
    adGroups,
    strategicBreakdown,
    dateRange,
    selectedAccountId,
    onCategoryFilter,
    onClearFilter,
    categoryFilter,
    enrichWithSmartBidding,
    language,
    setLanguage,
    deviceBreakdown,
    searchTerms,
    customerId,
    filteredCampaignIds,
    onNavigate
}: StrategicInsightsProps) {
    const [analysis, setAnalysis] = useState("");
    const [analyzing, setAnalyzing] = useState(false);
    const [activeTab, setActiveTab] = useState<'breakdown' | 'audit' | 'ai' | 'device' | 'search' | 'heatmap' | 'landing' | 'conversions' | 'geographic' | 'negatives'>('breakdown');

    const runAnalysis = async () => {
        setAnalyzing(true);
        try {
            const dataToAnalyze = {
                campaigns: enrichWithSmartBidding(campaigns),
                strategicBreakdown,
                level: 'account',
                language
            };

            const res = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dataToAnalyze)
            });
            const data = await res.json();
            if (data.error) {
                setAnalysis(`Error: ${data.error}${data.details ? ` (${data.details})` : ''}`);
            } else {
                setAnalysis(data.analysis);
            }
        } catch (error: any) {
            console.error("Analysis failed:", error);
            setAnalysis(`Failed to generate analysis: ${error.message || 'Unknown error'}`);
        } finally {
            setAnalyzing(false);
        }
    };

    const runCategoryAnalysis = async (category: string) => {
        setActiveTab('ai');
        setAnalyzing(true);
        try {
            const filteredCampaigns = campaigns.filter(c => c.category === category);
            const dataToAnalyze = {
                campaigns: enrichWithSmartBidding(filteredCampaigns),
                strategicBreakdown,
                level: 'account',
                context: `Filtered by category: ${category}`,
                language
            };

            const res = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dataToAnalyze)
            });
            const data = await res.json();
            if (data.error) {
                setAnalysis(`Error: ${data.error}${data.details ? ` (${data.details})` : ''}`);
            } else {
                setAnalysis(data.analysis);
            }
        } catch (error: any) {
            console.error("Analysis failed:", error);
            setAnalysis(`Failed to generate analysis: ${error.message || 'Unknown error'}`);
        } finally {
            setAnalyzing(false);
        }
    };

    const exportToMarkdown = () => {
        if (!analysis) return;
        const blob = new Blob([analysis], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `strategic-analysis-${new Date().toISOString().split('T')[0]}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportToCSV = () => {
        const headers = ['Name', 'Status', 'Category', 'Spend', 'Conversions', 'ROAS', 'Lost IS (Rank)'];
        const rows = campaigns.map(c => [
            c.name,
            c.status,
            c.category || 'Other',
            c.cost.toFixed(2),
            c.conversions?.toString() || '0',
            c.roas?.toFixed(2) || 'N/A',
            c.searchLostISRank ? (c.searchLostISRank * 100).toFixed(1) + '%' : 'N/A'
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `campaigns-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Audit data: campaigns with issues
    const lowQSAdGroups = adGroups.filter(ag => ag.avgQualityScore !== null && ag.avgQualityScore < 5);
    const poorAdsAdGroups = adGroups.filter(ag => ag.poorAdsCount > 0);
    const highLostISCampaigns = campaigns.filter(c => c.searchLostISRank !== null && c.searchLostISRank > 0.15);

    const tabClass = (tab: string) =>
        `px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === tab
            ? 'border-violet-500 text-white'
            : 'border-transparent text-slate-400 hover:text-white'
        }`;

    return (
        <div className="flex-1 overflow-auto p-6 space-y-6">
            {/* Toolbar */}
            <div className="flex justify-end items-center gap-3">
                {/* Language Toggle */}
                <div className="flex items-center gap-2 bg-slate-700/50 rounded-lg p-1 border border-slate-600/50">
                    <button
                        onClick={() => setLanguage('bg')}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${language === 'bg'
                            ? 'bg-violet-600 text-white'
                            : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        BG
                    </button>
                    <button
                        onClick={() => setLanguage('en')}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${language === 'en'
                            ? 'bg-violet-600 text-white'
                            : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        EN
                    </button>
                </div>

                {/* Export Buttons */}
                <button
                    onClick={exportToCSV}
                    className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export CSV
                </button>
                {analysis && (
                    <button
                        onClick={exportToMarkdown}
                        className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export Analysis
                    </button>
                )}
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-slate-700">
                <button onClick={() => setActiveTab('breakdown')} className={tabClass('breakdown')}>
                    Strategic Breakdown
                </button>
                <button onClick={() => setActiveTab('audit')} className={tabClass('audit')}>
                    Quality Audit
                </button>
                <button onClick={() => setActiveTab('ai')} className={tabClass('ai')}>
                    AI Analysis
                </button>
                <button onClick={() => setActiveTab('device')} className={tabClass('device')}>
                    Device Performance
                </button>
                <button onClick={() => setActiveTab('search')} className={tabClass('search')}>
                    Search Terms
                </button>
                <button onClick={() => setActiveTab('heatmap')} className={tabClass('heatmap')}>
                    Day/Hour Heatmap
                </button>
                <button onClick={() => setActiveTab('landing')} className={tabClass('landing')}>
                    Landing Pages
                </button>
                <button onClick={() => setActiveTab('conversions')} className={tabClass('conversions')}>
                    Conversions
                </button>
                <button onClick={() => setActiveTab('geographic')} className={tabClass('geographic')}>
                    Geographic
                </button>
                <button onClick={() => setActiveTab('negatives')} className={tabClass('negatives')}>
                    Neg. Keywords
                </button>
            </div>

            {/* Content Area */}
            <div className="space-y-6">
                {activeTab === 'breakdown' && (
                    <div>
                        <StrategicBreakdown
                            strategicBreakdown={strategicBreakdown}
                            categoryFilter={categoryFilter}
                            onCategorySelect={onCategoryFilter}
                            onClearFilter={onClearFilter}
                            onAnalyze={runCategoryAnalysis}
                        />
                    </div>
                )}

                {activeTab === 'audit' && (
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold text-white">Quality & Performance Audit</h2>

                        {/* High Lost IS Rank */}
                        <div className="rounded-xl bg-slate-800 border border-slate-700 p-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <span className="text-red-400">!</span>
                                High Impression Share Loss (Rank)
                            </h3>
                            {highLostISCampaigns.length > 0 ? (
                                <div className="space-y-2">
                                    {highLostISCampaigns.map(c => (
                                        <div
                                            key={c.id}
                                            onClick={() => onNavigate?.({ level: 'campaign', view: 'dashboard', campaignId: c.id, campaignName: c.name })}
                                            className={`bg-slate-700/30 rounded-lg p-3 border border-slate-700 flex justify-between items-center ${onNavigate ? 'cursor-pointer hover:bg-slate-700/60 hover:border-slate-600 transition-colors group' : ''}`}
                                        >
                                            <span className="text-white font-medium">{c.name}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-red-400 font-bold">
                                                    {(c.searchLostISRank! * 100).toFixed(1)}% Lost IS
                                                </span>
                                                {onNavigate && <span className="text-slate-500 group-hover:text-slate-300 transition-colors">&rarr;</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-slate-400 text-sm">No campaigns with significant rank loss detected.</p>
                            )}
                        </div>

                        {/* Low Quality Score Ad Groups */}
                        <div className="rounded-xl bg-slate-800 border border-slate-700 p-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <span className="text-amber-400">!</span>
                                Low Quality Score Ad Groups
                            </h3>
                            {lowQSAdGroups.length > 0 ? (
                                <div className="space-y-2">
                                    {lowQSAdGroups.map(ag => {
                                        const campaign = campaigns.find(c => String(c.id) === String(ag.campaignId));
                                        return (
                                            <div
                                                key={ag.id}
                                                onClick={() => onNavigate?.({ level: 'adgroup', view: 'dashboard', campaignId: ag.campaignId, campaignName: campaign?.name, adGroupId: ag.id, adGroupName: ag.name })}
                                                className={`bg-slate-700/30 rounded-lg p-3 border border-slate-700 ${onNavigate ? 'cursor-pointer hover:bg-slate-700/60 hover:border-slate-600 transition-colors group' : ''}`}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <span className="text-white font-medium">{ag.name}</span>
                                                        {campaign && <span className="text-slate-500 text-xs ml-2">{campaign.name}</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-amber-400 font-bold">
                                                            QS: {ag.avgQualityScore?.toFixed(1)}
                                                        </span>
                                                        {onNavigate && <span className="text-slate-500 group-hover:text-slate-300 transition-colors">&rarr;</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-slate-400 text-sm">All ad groups have acceptable Quality Scores.</p>
                            )}
                        </div>

                        {/* Poor Ad Strength */}
                        <div className="rounded-xl bg-slate-800 border border-slate-700 p-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <span className="text-orange-400">!</span>
                                Poor Ad Strength
                            </h3>
                            {poorAdsAdGroups.length > 0 ? (
                                <div className="space-y-2">
                                    {poorAdsAdGroups.map(ag => {
                                        const campaign = campaigns.find(c => String(c.id) === String(ag.campaignId));
                                        return (
                                            <div
                                                key={ag.id}
                                                onClick={() => onNavigate?.({ level: 'adgroup', view: 'dashboard', campaignId: ag.campaignId, campaignName: campaign?.name, adGroupId: ag.id, adGroupName: ag.name })}
                                                className={`bg-slate-700/30 rounded-lg p-3 border border-slate-700 ${onNavigate ? 'cursor-pointer hover:bg-slate-700/60 hover:border-slate-600 transition-colors group' : ''}`}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <span className="text-white font-medium">{ag.name}</span>
                                                        {campaign && <span className="text-slate-500 text-xs ml-2">{campaign.name}</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-orange-400 font-bold">
                                                            {ag.poorAdsCount} poor ad{ag.poorAdsCount > 1 ? 's' : ''}
                                                        </span>
                                                        {onNavigate && <span className="text-slate-500 group-hover:text-slate-300 transition-colors">&rarr;</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-slate-400 text-sm">No ad groups with poor Ad Strength detected.</p>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'ai' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-white">AI-Powered Strategic Analysis</h2>
                                <p className="text-xs text-slate-500 mt-0.5">Advanced AI-powered performance auditing</p>
                            </div>
                            <button
                                onClick={runAnalysis}
                                disabled={analyzing}
                                className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-6 py-2.5 rounded-lg transition-all shadow-lg hover:shadow-violet-500/25 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {analyzing ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        Run Analysis
                                    </>
                                )}
                            </button>
                        </div>

                        {analyzing ? (
                            <div className="rounded-xl bg-slate-800 border border-slate-700 p-12 flex flex-col items-center justify-center">
                                <div className="relative w-20 h-20 mb-6">
                                    <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                                    <div className="absolute inset-0 border-4 border-violet-500 rounded-full border-t-transparent animate-spin"></div>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Analyzing Data...</h3>
                                <p className="text-slate-400 animate-pulse">Identifying patterns and opportunities</p>
                            </div>
                        ) : analysis ? (
                            <div className="rounded-xl bg-slate-800 border border-slate-700 p-6">
                                <div className="prose prose-invert prose-slate max-w-none">
                                    <div className="whitespace-pre-wrap text-slate-200 leading-relaxed">{analysis}</div>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl bg-slate-800 border border-slate-700 p-12 text-center">
                                <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-medium text-white mb-2">Ready to Analyze</h3>
                                <p className="text-slate-400 max-w-sm mx-auto">
                                    Click &quot;Run Analysis&quot; to get deep insights into your campaign performance and actionable recommendations in {language === 'bg' ? 'Bulgarian' : 'English'}.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'device' && (
                    <DeviceBreakdown data={deviceBreakdown} />
                )}

                {activeTab === 'search' && (
                    <EnhancedSearchTerms data={searchTerms} />
                )}

                {activeTab === 'heatmap' && (
                    <DayHourHeatmap
                        customerId={customerId}
                        dateRange={dateRange}
                        language={language}
                        campaignIds={filteredCampaignIds}
                    />
                )}

                {activeTab === 'landing' && (
                    <LandingPagesTab
                        customerId={customerId}
                        dateRange={dateRange}
                        language={language}
                        campaignIds={filteredCampaignIds}
                    />
                )}

                {activeTab === 'conversions' && (
                    <ConversionBreakdown
                        customerId={customerId}
                        dateRange={dateRange}
                    />
                )}

                {activeTab === 'geographic' && (
                    <GeographicPerformance
                        customerId={customerId}
                        dateRange={dateRange}
                    />
                )}

                {activeTab === 'negatives' && (
                    <NegativeKeywordMiner
                        customerId={customerId}
                        dateRange={dateRange}
                    />
                )}
            </div>
        </div>
    );
}
