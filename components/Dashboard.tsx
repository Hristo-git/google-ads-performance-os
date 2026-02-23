"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import {
    Campaign, AdGroup, AssetGroup, NegativeKeyword, KeywordWithQS,
    AdWithStrength, Account, AccountAsset, NavigationState, PMaxAsset,
    DeviceBreakdown as DeviceBreakdownType, SearchTerm,
    PlacementPerformance, DemographicPerformance, TimeAnalysisPerformance, AssetPerformance, AudiencePerformance
} from "@/types/google-ads";
import { ACCOUNTS, DEFAULT_ACCOUNT_ID } from "../config/accounts";
import { fmtNum, fmtInt, fmtEuro, fmtPct, fmtX } from '@/lib/format';
import { processNGrams } from "@/lib/n-gram";
import AIAnalysisModal from "./AIAnalysisModal";
import StrategicInsights from "./StrategicInsights";

import AIReportsHub from "./AIReportsHub";
import AccountHealthWidget from "./AccountHealthWidget";
import NGramInsights from "./NGramInsights";
import { BackgroundReportIndicator } from "./BackgroundReportIndicator";
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

const getISColor = (is: number | null) => {
    if (is === null || is === undefined) return 'text-slate-500';
    if (is >= 0.8) return 'text-emerald-400';
    if (is >= 0.5) return 'text-amber-400';
    return 'text-red-400';
};

const getAdStrengthColor = (strength: string) => {
    switch (strength) {
        case 'EXCELLENT': return 'bg-emerald-500/20 text-emerald-400';
        case 'GOOD': return 'bg-blue-500/20 text-blue-400';
        case 'AVERAGE': return 'bg-amber-500/20 text-amber-400';
        case 'POOR': return 'bg-red-500/20 text-red-400';
        case 'PENDING': return 'bg-purple-500/20 text-purple-400';
        case 'UNRATED': return 'bg-slate-600/50 text-slate-400';
        default: return 'bg-slate-600/50 text-slate-400';
    }
};

const AD_STRENGTH_LABEL: Record<string, string> = {
    'EXCELLENT': 'Excellent',
    'GOOD': 'Good',
    'AVERAGE': 'Average',
    'POOR': 'Poor',
    'PENDING': 'Pending',
    'UNRATED': 'Unrated',
    'UNSPECIFIED': '—',
    'UNKNOWN': '—',
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
                    {arrow} {fmtNum(Math.abs(delta), 0)}%
                </span>
            )}
        </div>
    );
};

const ParentContextRow = ({ name, type, metrics, colSpan, layout = 'search' }: { name: string; type: string; metrics: any; colSpan: number; layout?: 'pmax' | 'search' | 'adgroup' | 'listing_group' | 'pmax_assets' }) => {
    // Determine number of leading columns (before metrics)
    const baseColSpan = layout === 'listing_group' ? 2 : 1;

    return (
        <tr className="bg-slate-700/40 border-b border-slate-700 font-medium text-xs text-slate-300">
            <td className="px-4 py-3 text-white" colSpan={baseColSpan}>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded tracking-wider">{type}</span>
                    <span className="truncate max-w-[200px]" title={name}>{name}</span>
                </div>
            </td>

            {layout === 'listing_group' && (
                <>
                    <td className="px-4 py-3">
                        <span className="bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded italic">Total</span>
                    </td>
                    <td className="px-4 py-3 text-right">{fmtInt(metrics.impressions || 0)}</td>
                    <td className="px-4 py-3 text-right">{fmtInt(metrics.clicks || 0)}</td>
                    <td className="px-4 py-3 text-right">{fmtEuro(metrics.cost || 0, 0)}</td>
                    <td className="px-4 py-3 text-right">{fmtNum(metrics.conversions || 0)}</td>
                    <td className="px-4 py-3 text-right">
                        {metrics.roas != null ? (
                            <span className={`font-medium ${metrics.roas >= 3 ? 'text-emerald-400' : metrics.roas >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
                                {fmtX(metrics.roas)}
                            </span>
                        ) : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                        {metrics.searchImpressionShare != null ? (
                            <span className={`font-medium ${getISColor(metrics.searchImpressionShare)}`}>
                                {fmtPct(metrics.searchImpressionShare * 100)}
                            </span>
                        ) : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                        {metrics.searchLostISRank != null ? (
                            <span className={`font-medium ${metrics.searchLostISRank > 0.3 ? 'text-red-400' : 'text-slate-400'}`}>
                                {fmtPct(metrics.searchLostISRank * 100)}
                            </span>
                        ) : <span className="text-slate-500">—</span>}
                    </td>
                </>
            )}

            {layout === 'pmax_assets' && (
                <>
                    <td className="px-4 py-3 italic text-slate-500">Total Asset Group</td>
                    <td className="px-4 py-3 text-center">
                        {metrics.adStrength ? (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${getAdStrengthColor(metrics.adStrength)}`}>
                                {AD_STRENGTH_LABEL[metrics.adStrength] || metrics.adStrength}
                            </span>
                        ) : (
                            <span className="text-slate-500">—</span>
                        )}
                    </td>
                    <td className="px-4 py-3 text-center text-[10px]">
                        {metrics.status === 'ENABLED' ? '✅ ENABLED' : '⚠️ ' + (metrics.status || 'UNKNOWN')}
                    </td>
                </>
            )}

            {(layout === 'search' || layout === 'pmax' || layout === 'adgroup') && (
                <>
                    <td className="px-4 py-3 text-right">{fmtEuro(metrics.cost || 0, 0)}</td>
                    <td className="px-4 py-3 text-right">{fmtPct(metrics.ctr * 100, 2)}</td>
                </>
            )}

            {layout === 'pmax' && (
                <>
                    <td className="px-4 py-3 text-right">{fmtInt(metrics.impressions || 0)}</td>
                    <td className="px-4 py-3 text-right">{fmtInt(metrics.clicks || 0)}</td>
                    <td className="px-4 py-3 text-right">{fmtEuro(metrics.cost || 0, 0)}</td>
                    <td className="px-4 py-3 text-right">{fmtInt(metrics.conversions || 0)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-semibold">{fmtEuro(metrics.conversionValue || 0, 0)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtX(metrics.roas || 0)}</td>
                    <td className="px-4 py-3 text-center">
                        {metrics.searchImpressionShare != null ? (
                            <span className={`font-medium ${getISColor(metrics.searchImpressionShare)}`}>
                                {fmtPct(metrics.searchImpressionShare * 100)}
                            </span>
                        ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                        {metrics.searchLostISRank != null ? (
                            <span className={`font-medium ${metrics.searchLostISRank > 0.3 ? 'text-red-400' : 'text-slate-400'}`}>
                                {fmtPct(metrics.searchLostISRank * 100)}
                            </span>
                        ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                        {metrics.adStrength ? (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${getAdStrengthColor(metrics.adStrength)}`}>
                                {AD_STRENGTH_LABEL[metrics.adStrength] || metrics.adStrength}
                            </span>
                        ) : (
                            <span className="text-xs text-slate-400">
                                {metrics.status === 'ENABLED' ? '✅ ENABLED' : '⚠️ ' + (metrics.status || 'UNKNOWN')}
                            </span>
                        )}
                    </td>
                </>
            )}

            {layout === 'search' && (
                <>
                    <td className="px-4 py-3 text-right text-emerald-400">
                        {metrics.searchImpressionShare ? fmtPct(metrics.searchImpressionShare * 100) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                        {metrics.searchLostISRank ? fmtPct(metrics.searchLostISRank * 100) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">{fmtNum(metrics.avgQualityScore || 0, 1)}</td>
                    <td className="px-4 py-3 text-right">
                        {metrics.adStrength ? (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase ${getAdStrengthColor(metrics.adStrength)}`}>
                                {AD_STRENGTH_LABEL[metrics.adStrength] || metrics.adStrength}
                            </span>
                        ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">{metrics.poorAdsCount || 0}/{metrics.adsCount || 0}</td>
                </>
            )}

            {layout === 'adgroup' && (
                <>
                    <td className="px-4 py-3 text-right">{fmtNum(metrics.conversions || 0)}</td>
                    <td className="px-4 py-3 text-right text-slate-300">
                        {metrics.clicks > 0 && metrics.conversions > 0
                            ? fmtPct(metrics.conversions / metrics.clicks * 100, 2)
                            : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-400">
                        {metrics.conversionValue > 0 ? fmtEuro(metrics.conversionValue, 0) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">{fmtX(metrics.roas || 0)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400">
                        {metrics.searchImpressionShare ? fmtPct(metrics.searchImpressionShare * 100) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                        {metrics.searchLostISRank ? fmtPct(metrics.searchLostISRank * 100) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                        {metrics.adStrength ? (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase ${getAdStrengthColor(metrics.adStrength)}`}>
                                {AD_STRENGTH_LABEL[metrics.adStrength] || metrics.adStrength}
                            </span>
                        ) : '—'}
                    </td>
                </>
            )}

            {(() => {
                const renderedCols = layout === 'listing_group' ? 9 : layout === 'pmax_assets' ? 4 : (layout === 'search' ? 9 : layout === 'pmax' ? 10 : layout === 'adgroup' ? 10 : 1);
                return colSpan > renderedCols ? <td colSpan={colSpan - renderedCols}></td> : null;
            })()}
        </tr>
    );
};





// Format date as YYYY-MM-DD using LOCAL time (avoids UTC offset shifting the day)
const fmtDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

// Helper to get default "Last Month" date range
const getLastMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of last month
    return { start: fmtDate(start), end: fmtDate(end) };
};

// Helper to get "Last 7 Days" date range
const getLast7DaysRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    return { start: fmtDate(start), end: fmtDate(end) };
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
    // Numeric mappings — from google-ads-api v22 BiddingStrategyType enum (enums.js)
    '2': 'eCPC',              // ENHANCED_CPC
    '3': 'Manual CPC',        // MANUAL_CPC
    '4': 'Manual CPM',        // MANUAL_CPM
    '5': 'Page One Promoted', // PAGE_ONE_PROMOTED (deprecated)
    '6': 'tCPA',              // TARGET_CPA
    '7': 'Target Outrank',    // TARGET_OUTRANK_SHARE (deprecated)
    '8': 'tROAS',             // TARGET_ROAS ← verified from enum + tROAS campaign shows '8'
    '9': 'Max Clicks',        // TARGET_SPEND
    '10': 'Max Conversions',  // MAXIMIZE_CONVERSIONS
    '11': 'Max Conv Value',   // MAXIMIZE_CONVERSION_VALUE — verified: PMax returns 11
    '12': 'Percent CPC',      // PERCENT_CPC
    '13': 'Manual CPV',       // MANUAL_CPV
    '14': 'Target CPM',       // TARGET_CPM
    '15': 'Target Imp Share', // TARGET_IMPRESSION_SHARE
    '16': 'Commission',       // COMMISSION
    '17': 'Invalid',          // INVALID
    '18': 'Manual CPA',       // MANUAL_CPA
    '19': 'Fixed CPM',        // FIXED_CPM (video)
    '20': 'Target CPV',       // TARGET_CPV (video) — user sees this on paused campaigns
    '21': 'Target CPC',       // TARGET_CPC
    '22': 'Fixed SOV'         // FIXED_SHARE_OF_VOICE
};

// SearchTermTargetingStatus proto enum → human label
const SEARCH_TERM_STATUS_MAP: Record<string, { label: string; color: string }> = {
    '2': { label: 'ADDED', color: 'text-emerald-400 bg-emerald-500/10' },
    'ADDED': { label: 'ADDED', color: 'text-emerald-400 bg-emerald-500/10' },
    '3': { label: 'EXCLUDED', color: 'text-red-400    bg-red-500/10' },
    'EXCLUDED': { label: 'EXCLUDED', color: 'text-red-400    bg-red-500/10' },
    '4': { label: 'ADDED & EXCL.', color: 'text-amber-400 bg-amber-500/10' },
    'ADDED_EXCLUDED': { label: 'ADDED & EXCL.', color: 'text-amber-400 bg-amber-500/10' },
    '5': { label: 'NONE', color: 'text-slate-400  bg-slate-700' },
    'NONE': { label: 'NONE', color: 'text-slate-400  bg-slate-700' },
};


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
    'SQUARE_LOGO': 'Square Logo',
    'CALL_TO_ACTION_SELECTION': 'Call to Action',
    'STRUCTURED_SNIPPET_HEADER': 'Snippet Header',
    'STRUCTURED_SNIPPET_VALUES': 'Snippet Values',
    'LANDSCAPE_MARKETING_IMAGE': 'Landscape Image',
    'AD_IMAGE': 'Ad Image',
    'BUSINESS_LOGO': 'Business Logo',
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

// PMax asset recommended counts — used for IS banner + asset header color coding
const PMAX_ASSET_THRESHOLDS: Record<string, { min: number; rec: number; label: string }> = {
    'Headline': { min: 3, rec: 8, label: 'Headlines' },
    'Long Headline': { min: 1, rec: 5, label: 'Long Headlines' },
    'Description': { min: 2, rec: 4, label: 'Descriptions' },
    'Marketing Image': { min: 1, rec: 3, label: 'Images' },
    'Square Image': { min: 1, rec: 3, label: 'Sq. Images' },
    'Logo': { min: 1, rec: 1, label: 'Logo' },
    'Video': { min: 0, rec: 1, label: 'Videos' },
    'Portrait Image': { min: 0, rec: 1, label: 'Portrait Imgs' },
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

    const [negativeKeywords, setNegativeKeywords] = useState<NegativeKeyword[]>([]);
    const [keywords, setKeywords] = useState<KeywordWithQS[]>([]);
    const [ads, setAds] = useState<AdWithStrength[]>([]);
    const [assets, setAssets] = useState<AccountAsset[]>([]); // New state for assets
    const [pmaxAssets, setPmaxAssets] = useState<PMaxAsset[]>([]); // New state for PMax assets
    const [listingGroups, setListingGroups] = useState<any[]>([]); // Shopping product groups
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

    // --- Tab Persistence Logic ---
    const searchParams = useSearchParams();
    const pathname = usePathname();

    // 1. Initialize view from URL on mount & track external URL changes
    useEffect(() => {
        const viewParam = searchParams.get('view');
        if (viewParam && ['dashboard', 'insights', 'reports', 'diagnostics', 'ngrams', 'auction_insights'].includes(viewParam)) {
            if (navigation.view !== viewParam) {
                setNavigation(prev => ({ ...prev, view: viewParam as any }));
            }
        } else if (!viewParam && navigation.view !== 'dashboard') {
            setNavigation(prev => ({ ...prev, view: 'dashboard' }));
        }
    }, [searchParams]);

    // 2. Sync state changes to URL
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        let changed = false;

        if (navigation.view && navigation.view !== 'dashboard') {
            if (params.get('view') !== navigation.view) {
                params.set('view', navigation.view);
                changed = true;
            }
        } else {
            if (params.has('view')) {
                params.delete('view');
                changed = true;
            }
        }

        if (changed) {
            const newSearch = params.toString();
            // Prevents immediate re-renders from stale URL searchParams tracking
            router.replace(`${pathname}?${newSearch}`, { scroll: false });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigation.view, pathname, router]); // Exclude searchParams to prevent race condition bounce

    const [language, setLanguage] = useState<'bg' | 'en'>('bg');
    const [deviceBreakdown, setDeviceBreakdown] = useState<DeviceBreakdownType[]>([]);
    const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([]);
    const [hideStopped, setHideStopped] = useState(false); // Filter for Enabled only items
    const [healthData, setHealthData] = useState<any>(null);
    const [loadingHealth, setLoadingHealth] = useState(false);

    // Demand Gen specific state
    const [dgPlacements, setDgPlacements] = useState<PlacementPerformance[]>([]);
    const [dgDemographics, setDgDemographics] = useState<DemographicPerformance[]>([]);
    const [dgTimeAnalysis, setDgTimeAnalysis] = useState<TimeAnalysisPerformance[]>([]);
    const [dgAssets, setDgAssets] = useState<AssetPerformance[]>([]);
    const [dgAudiences, setDgAudiences] = useState<AudiencePerformance[]>([]);
    const [dgView, setDgView] = useState<'performance' | 'placements' | 'audiences' | 'demographics' | 'time' | 'assets'>('performance');

    // Demographics visualization state
    const [demoViewMode, setDemoViewMode] = useState<'chart' | 'table'>('chart');
    const [demoMetricFilter, setDemoMetricFilter] = useState<'cost' | 'conversions' | 'clicks'>('cost');
    const [placementsMetricFilter, setPlacementsMetricFilter] = useState<'cost' | 'conversions' | 'clicks'>('cost');

    // ... existing state ...
    // Display / Video / DG ad group level state
    const [displayPlacements, setDisplayPlacements] = useState<PlacementPerformance[]>([]);
    const [displayAudiences, setDisplayAudiences] = useState<AudiencePerformance[]>([]);
    const [displayDemographics, setDisplayDemographics] = useState<DemographicPerformance[]>([]);
    const [displayAdAssets, setDisplayAdAssets] = useState<any[]>([]);
    const [pmaxView, setPmaxView] = useState<'summary' | 'asset_groups'>('summary');
    const [pmaxListingGroups, setPmaxListingGroups] = useState<any[]>([]);
    const [auditSnapshotDate, setAuditSnapshotDate] = useState<string | null>(null);
    const lastHealthRef = useRef<string | null>(null);

    // Search Terms implementation state
    const [searchTermSortBy, setSearchTermSortBy] = useState<string>('cost');
    const [searchTermSortDirection, setSearchTermSortDirection] = useState<'asc' | 'desc'>('desc');

    const handleSearchTermSort = (column: string) => {
        if (searchTermSortBy === column) {
            setSearchTermSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSearchTermSortBy(column);
            setSearchTermSortDirection('desc');
        }
    };

    // Sync state with URL parameter (from props) and trigger data refresh
    useEffect(() => {
        if (customerId && customerId !== selectedAccountId) {
            console.log(`[Dashboard] Account changed from ${selectedAccountId} to ${customerId} (reactive trigger)`);
            // Explicitly clear all data states to prevent cross-account leakage
            setCampaigns([]);
            setAdGroups([]);
            setKeywords([]);
            setAds([]);
            setNegativeKeywords([]);
            setAssets([]);
            setPmaxAssets([]);
            setAccount(null);
            setStrategicBreakdown(null);
            setHealthData(null);
            setSearchTerms([]);
            setDeviceBreakdown([]);
            // Update the selected account ID - this will trigger fetchCoreData via its dependency
            setSelectedAccountId(customerId);
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
                // Update URL preserving current parameters using router
                const currentParams = new URLSearchParams(searchParams.toString());
                currentParams.set('customerId', newId);
                router.replace(`${pathname}?${currentParams.toString()}`, { scroll: false });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, selectedAccountId]); // keeping deps same to avoid refactor side effects

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
            start: fmtDate(prevStartDate),
            end: fmtDate(prevEndDate)
        };
    };

    const fetchCoreData = async () => {
        console.log(`[fetchCoreData] Called with:`, { selectedAccountId, dateRange });
        setLoading(true);
        setError(null);

        // Guard: If account switch is in progress, ensure we don't have stale data
        // This is a safety clear in case the useEffect hasn't fully propagated or a re-fetch is forced
        if (campaigns.length > 0 && account?.id !== selectedAccountId) {
            console.log(`[fetchCoreData] Safety clear of stale data for account ${account?.id}`);
            setCampaigns([]);
            setAccount(null);
        }

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

    const fetchDGDetails = async (campaignId: string) => {
        setLoading(true);
        try {
            setLoadingMessage("Fetching Demand Gen insights...");
            const params = `customerId=${selectedAccountId}&campaignId=${campaignId}&startDate=${dateRange.start}&endDate=${dateRange.end}`;
            const res = await fetch(`/api/google-ads/dg-details?${params}`);
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            if (data.placements) setDgPlacements(data.placements);
            if (data.demographics) setDgDemographics(data.demographics);
            if (data.timeAnalysis) setDgTimeAnalysis(data.timeAnalysis);
            if (data.assets) setDgAssets(data.assets);
            if (data.audiences) setDgAudiences(data.audiences);
            if (data.adGroups) setAdGroups(data.adGroups);

        } catch (err: any) {
            console.error("Failed to fetch DG details:", err);
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

            // Pass campaignType to avoid an extra getCampaigns() call on the backend
            const currentCampaign = campaigns.find(c => String(c.id) === String(navigation.campaignId));
            const campaignTypeParam = currentCampaign?.advertisingChannelType ? `&campaignType=${currentCampaign.advertisingChannelType}` : '';
            const adGroupParams = navigation.campaignId
                ? `${commonParams}&campaignId=${navigation.campaignId}${campaignTypeParam}`
                : commonParams;

            const agRes = await fetch(`/api/google-ads/ad-groups?${adGroupParams}`);
            const agData = await agRes.json();
            if (agData.error) throw new Error(`Ad Groups Error: ${agData.error}`);
            // Backend returns `adGroups` for Search/Display/Shopping and `assetGroups` for PMax
            const groups = agData.adGroups ?? agData.assetGroups;
            if (groups) setAdGroups(groups);

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
    // campaigns.length is in deps so we fire once campaigns resolve (initial load guard).
    // fetchAdGroupData itself guards against campaigns.length === 0.

    useEffect(() => {
        if (session && navigation.level === 'campaign' && navigation.campaignId && campaigns.length > 0) {
            const camp = campaigns.find(c => String(c.id) === String(navigation.campaignId));
            const isDG = camp?.advertisingChannelType === 'DEMAND_GEN' || camp?.advertisingChannelType === 'DISCOVERY' || camp?.advertisingChannelType === '14';
            if (isDG) {
                fetchDGDetails(navigation.campaignId);
            }
        }
    }, [session, navigation.level, navigation.campaignId, selectedAccountId, dateRange.start, dateRange.end, campaigns.length]);
    // campaigns.length is in deps so we fire once campaigns resolve (initial load guard).
    // fetchAdGroupData itself guards against campaigns.length === 0.

    // Reset view-specific state when campaign changes to prevent state leakage across campaigns
    useEffect(() => {
        setDgView('performance');
        setPmaxView('summary');
    }, [navigation.campaignId]);

    // Fetch ALL ad groups when entering Strategic Insights (for Quality Audit)
    useEffect(() => {
        if (session && navigation.view === 'insights' && campaigns.length > 0) {
            const fetchAllAdGroupsForAudit = async () => {
                try {
                    const statusParam = hideStopped ? '&status=ENABLED' : '';
                    const params = `customerId=${selectedAccountId}&startDate=${dateRange.start}&endDate=${dateRange.end}${statusParam}`;
                    const res = await fetch(`/api/google-ads/ad-groups?${params}`);
                    const data = await res.json();
                    if (data.adGroups ?? data.assetGroups) setAdGroups(data.adGroups ?? data.assetGroups);
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



    const fetchAdGroupDetails = async (adGroupId: string) => {
        if (campaigns.length === 0) return; // Wait for campaigns to load context

        try {
            const currentCampaign = campaigns.find(c => String(c.id) === String(navigation.campaignId));
            const channelType = currentCampaign?.advertisingChannelType || '';

            const isPMax = channelType === 'PERFORMANCE_MAX' ||
                currentCampaign?.name?.toLowerCase().includes('pmax');

            const isShopping = channelType === 'SHOPPING';

            const isUpperFunnel = channelType === 'VIDEO' || channelType === 'DISPLAY' ||
                channelType === 'DEMAND_GEN' || channelType === 'DISCOVERY';

            if (isPMax) {
                // PMax → fetch asset group assets + listing groups in parallel
                setLoadingMessage("Fetching Asset Group Assets...");
                const queryParams = `customerId=${selectedAccountId}&startDate=${dateRange.start}&endDate=${dateRange.end}`;
                const [assetsRes, lgRes] = await Promise.all([
                    fetch(`/api/google-ads/pmax-assets?assetGroupId=${adGroupId}&customerId=${selectedAccountId}`),
                    fetch(`/api/google-ads/pmax-listing-groups?assetGroupId=${adGroupId}&${queryParams}`)
                ]);
                if (!assetsRes.ok) throw new Error('Failed to fetch assets');
                const data = await assetsRes.json();
                setPmaxAssets(data.assets || []);
                if (lgRes.ok) {
                    const lgData = await lgRes.json();
                    setPmaxListingGroups(lgData.listingGroups || []);
                } else {
                    setPmaxListingGroups([]);
                }
                setListingGroups([]);
                setAds([]);
                setKeywords([]);
                return;
            }

            if (isShopping) {
                // Shopping → show product groups (listing groups) instead of keywords
                setLoadingMessage("Fetching Product Groups...");
                const queryParams = `customerId=${selectedAccountId}&startDate=${dateRange.start}&endDate=${dateRange.end}`;
                const lgRes = await fetch(`/api/google-ads/listing-groups?adGroupId=${adGroupId}&${queryParams}`);
                const lgData = await lgRes.json();
                setListingGroups(lgData.listingGroups || []);
                setPmaxAssets([]);
                setAds([]);
                setKeywords([]);
                return;
            }

            if (isUpperFunnel) {
                // Video / Display / Demand Gen → no keywords/ads to show, clear everything
                setListingGroups([]);
                setPmaxAssets([]);
                setAds([]);
                setKeywords([]);
                setNegativeKeywords([]);

                // Fetch Display-specific data for this ad group in parallel
                setLoadingMessage("Fetching Display insights...");
                const baseParams = `customerId=${selectedAccountId}&startDate=${dateRange.start}&endDate=${dateRange.end}`;
                const adGroupParam = `adGroupId=${adGroupId}`;
                const campaignParam = navigation.campaignId ? `&campaignId=${navigation.campaignId}` : '';
                const [placementsRes, audiencesRes, demographicsRes, assetsRes] = await Promise.all([
                    fetch(`/api/google-ads/placements?${baseParams}&${adGroupParam}${campaignParam}`),
                    fetch(`/api/google-ads/audiences?${baseParams}&${adGroupParam}${campaignParam}`),
                    fetch(`/api/google-ads/demographics?${baseParams}&${adGroupParam}${campaignParam}`),
                    fetch(`/api/google-ads/display-ad-assets?${baseParams}&${adGroupParam}`)
                ]);
                const [placementsData, audiencesData, demographicsData, assetsData] = await Promise.all([
                    placementsRes.json(),
                    audiencesRes.json(),
                    demographicsRes.json(),
                    assetsRes.json()
                ]);
                setDisplayPlacements(placementsData.placements || []);
                setDisplayAudiences(audiencesData.audiences || []);
                setDisplayDemographics(demographicsData.demographics || []);
                setDisplayAdAssets(assetsData.assets || []);
                return;
            }

            // Standard Search / DSA / Brand → clear Display-specific state and fetch keywords
            setDisplayPlacements([]);
            setDisplayAudiences([]);
            setDisplayDemographics([]);
            setDisplayAdAssets([]);
            setAds([]);
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
            setAds(adsData.ads || []);
            setListingGroups([]);
            setPmaxAssets([]);
        } catch (error) {
            console.error("Failed to fetch ad group details:", error);
        }
    };

    // -----------------------------------------------------------------
    // Fetch Account Health & N-Grams
    // -----------------------------------------------------------------
    useEffect(() => {
        const fetchHealthData = async () => {
            if ((navigation.view !== 'diagnostics' && navigation.view !== 'ngrams') || !selectedAccountId) return;

            const cacheKey = `${selectedAccountId}_${dateRange.start}_${dateRange.end}`;
            if (lastHealthRef.current === cacheKey && healthData !== null) {
                console.log(`[fetchHealthData] Skipping fetch, already have data for: ${cacheKey}`);
                return;
            }

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
                lastHealthRef.current = cacheKey;
            } catch (err) {
                console.error("Error fetching health data:", err);
            } finally {
                setLoadingHealth(false);
            }
        };

        fetchHealthData();
    }, [navigation.view, selectedAccountId, dateRange]);


    const runAnalysis = async (analysisType?: 'account-overview' | 'category' | 'campaign' | 'adgroup' | 'ngrams', category?: string, model?: string) => {
        let dataToAnalyze: any = getAnalysisContext();
        if (!dataToAnalyze) return;

        let finalAnalysisType: 'account-overview' | 'category' | 'campaign' | 'adgroup' | 'ngrams' | undefined = analysisType;
        if (!finalAnalysisType) {
            if (navigation.view === 'ngrams') {
                finalAnalysisType = 'ngrams';
            } else {
                finalAnalysisType = navigation.level === 'account' ? 'account-overview' : navigation.level;
            }
        }

        // Add language, analysis type, customerId, and dateRange to analysis data
        dataToAnalyze.language = language;
        dataToAnalyze.customerId = selectedAccountId;
        dataToAnalyze.analysisType = finalAnalysisType;
        dataToAnalyze.dateRange = dateRange;
        if (model) dataToAnalyze.model = model;

        // If category-specific analysis, filter campaigns by category
        // Only do this for standard campaign categories (brand, pmax, search_nonbrand etc.)
        const SPECIAL_CATEGORIES = ['Placements', 'Demographics', 'Audiences', 'Time Analysis', 'Assets'];
        if (finalAnalysisType === 'category' && category && !SPECIAL_CATEGORIES.includes(category)) {
            const filteredCampaigns = campaigns.filter(c => getCampaignCategory(c) === category);
            dataToAnalyze = {
                ...dataToAnalyze,
                campaigns: enrichWithSmartBidding(filteredCampaigns),
                strategicBreakdown,
                level: 'strategic_category',
                category,
                language
            };
        } else if (finalAnalysisType === 'category' && category && SPECIAL_CATEGORIES.includes(category)) {
            // For special contextual categories, keep full context but flag the category for the backend
            dataToAnalyze.analysisType = 'category';
            dataToAnalyze.category = category;
        }

        setAnalyzing(true);
        try {
            // --- Enrich with N-Gram Analysis (Account/Campaign Level) ---
            if (navigation.level === 'account' || navigation.level === 'campaign' || finalAnalysisType === 'ngrams') {
                try {
                    setLoadingMessage("Fetching search terms for N-Gram analysis...");
                    const queryParams = `?customerId=${selectedAccountId}&startDate=${dateRange.start}&endDate=${dateRange.end}&aggregate=true`;
                    const stRes = await fetch(`/api/google-ads/search-terms${queryParams}`);
                    if (stRes.ok) {
                        const stData = await stRes.json();
                        if (stData.searchTerms && stData.searchTerms.length > 0) {
                            if (finalAnalysisType === 'ngrams') {
                                // For n-grams specific analysis, pass the raw search terms so API can format them
                                dataToAnalyze.searchTerms = stData.searchTerms;
                            }
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
                    assets,
                    pmaxAssets,
                    placements: displayPlacements.length > 0 ? displayPlacements : dgPlacements,
                    demographics: displayDemographics.length > 0 ? displayDemographics : dgDemographics,
                    audiences: displayAudiences.length > 0 ? displayAudiences : dgAudiences,
                    timeAnalysis: dgTimeAnalysis,
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
                if (isPMax && campaignAdGroups.length > 0) {
                    const pmaxData = (window as any).__pmaxEnrichedData || {};
                    return {
                        campaign: enrichWithSmartBidding(campaign ? [campaign] : [])[0],
                        adGroups: campaignAdGroups,
                        pmaxSearchInsights: pmaxData.searchInsights || [],
                        pmaxAssetGroupDetails: pmaxData.assetGroupDetails || [],
                        pmaxAssets,
                        assets,
                        placements: displayPlacements.length > 0 ? displayPlacements : dgPlacements,
                        demographics: displayDemographics.length > 0 ? displayDemographics : dgDemographics,
                        audiences: displayAudiences.length > 0 ? displayAudiences : dgAudiences,
                        timeAnalysis: dgTimeAnalysis,
                        level: 'campaign'
                    };
                }

                return {
                    campaign: enrichWithSmartBidding(campaign ? [campaign] : [])[0],
                    adGroups: campaignAdGroups,
                    assets,
                    placements: displayPlacements.length > 0 ? displayPlacements : dgPlacements,
                    demographics: displayDemographics.length > 0 ? displayDemographics : dgDemographics,
                    audiences: displayAudiences.length > 0 ? displayAudiences : dgAudiences,
                    timeAnalysis: dgTimeAnalysis,
                    level: 'campaign'
                };
            case 'adgroup':
                const adGroup = adGroups.find(ag => ag.id === navigation.adGroupId);
                return {
                    adGroup,
                    negativeKeywords,
                    keywords,
                    ads,
                    assets: displayAdAssets.length > 0 ? displayAdAssets : dgAssets,
                    placements: displayPlacements.length > 0 ? displayPlacements : dgPlacements,
                    demographics: displayDemographics.length > 0 ? displayDemographics : dgDemographics,
                    audiences: displayAudiences.length > 0 ? displayAudiences : dgAudiences,
                    timeAnalysis: dgTimeAnalysis,
                    level: 'adgroup'
                };
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
            case 'UNKNOWN': return 'Insufficient data to rate this asset. It needs more impressions before Google can evaluate its performance.';
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

    // --- Placements specialized render ---
    const renderPlacements = (data: PlacementPerformance[]) => {
        const totalValue = data.reduce((sum, p) => sum + (p[placementsMetricFilter] || 0), 0);

        // Categorize
        const categories = data.reduce((acc, p) => {
            let cat = 'Other';
            if (p.type?.includes('YOUTUBE')) cat = 'YouTube';
            else if (p.type?.includes('APP') || p.type?.includes('MOBILE')) cat = 'App';
            else if (p.type?.includes('WEBSITE')) cat = 'Website';

            if (!acc[cat]) acc[cat] = { value: 0, count: 0 };
            acc[cat].value += (p[placementsMetricFilter] || 0);
            acc[cat].count += 1;
            return acc;
        }, {} as Record<string, { value: number; count: number }>);

        const sortedByFilter = [...data].sort((a, b) => (b[placementsMetricFilter] || 0) - (a[placementsMetricFilter] || 0));
        const top3 = sortedByFilter.slice(0, 3);

        const getCategoryIcon = (type: string) => {
            if (type.includes('YOUTUBE')) return '📺';
            if (type.includes('APP') || type.includes('MOBILE')) return '📱';
            return '🌐';
        };

        const getCategoryColor = (cat: string) => {
            switch (cat) {
                case 'YouTube': return 'bg-red-500/20 text-red-400';
                case 'Website': return 'bg-indigo-500/20 text-indigo-400';
                case 'App': return 'bg-emerald-500/20 text-emerald-400';
                default: return 'bg-slate-500/20 text-slate-400';
            }
        };

        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center bg-violet-900/10 p-4 border border-violet-500/20 rounded-xl">
                    <div>
                        <h3 className="text-sm font-semibold text-white">Placement Analysis</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Explore AI-driven insights for these placements.</p>
                    </div>
                    <button
                        onClick={() => runAnalysis('category', 'Placements')}
                        className="flex items-center gap-2 bg-violet-600/20 text-violet-400 hover:bg-violet-600 hover:text-white px-3 py-1.5 rounded-lg border border-violet-500/30 transition-all text-xs font-semibold shadow-sm hover:shadow-violet-500/25"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        Analyze Placements
                    </button>
                </div>

                {/* Visual Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Category Distribution */}
                    <div className="col-span-1 md:col-span-2 bg-slate-900/40 rounded-xl p-5 border border-slate-700/50">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-semibold text-white">Spend by Category</h3>
                            <div className="flex gap-1 bg-slate-800 p-1 rounded-lg">
                                {(['cost', 'conversions', 'clicks'] as const).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setPlacementsMetricFilter(m)}
                                        className={`px-2 py-1 text-[10px] font-bold rounded uppercase transition-all ${placementsMetricFilter === m ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-3">
                            {Object.entries(categories)
                                .sort((a, b) => b[1].value - a[1].value)
                                .map(([cat, stats]) => {
                                    const pct = totalValue > 0 ? (stats.value / totalValue) * 100 : 0;
                                    return (
                                        <div key={cat} className="space-y-1">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-slate-300 flex items-center gap-1.5">
                                                    <span className={`w-2 h-2 rounded-full ${getCategoryColor(cat).split(' ')[1]}`}></span>
                                                    {cat} <span className="text-slate-500 text-[10px items-center]">{stats.count}</span>
                                                </span>
                                                <span className="text-slate-400 font-mono">
                                                    {placementsMetricFilter === 'cost' ? fmtEuro(stats.value, 0) : fmtInt(stats.value)}
                                                    <span className="ml-1.5 text-slate-500">({fmtPct(pct)})</span>
                                                </span>
                                            </div>
                                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-500 ${getCategoryColor(cat).split(' ')[1].replace('text-', 'bg-')}`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>

                    {/* Top 3 Spenders */}
                    <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                        {top3.map((p, idx) => (
                            <div key={idx} className="bg-slate-900/40 rounded-xl p-4 border border-slate-700/50 flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-xl">{getCategoryIcon(p.type)}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${idx === 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                                            #{idx + 1}
                                        </span>
                                    </div>
                                    <p className="text-xs font-medium text-slate-200 truncate mb-1" title={p.placement}>
                                        {p.placement}
                                    </p>
                                    <p className="text-[10px] text-slate-500 truncate">{p.description || p.type}</p>
                                </div>
                                <div className="mt-3 pt-3 border-t border-slate-800/50">
                                    <div className="text-lg font-bold text-white font-mono">
                                        {placementsMetricFilter === 'cost' ? fmtEuro(p.cost, 1) : fmtInt(p[placementsMetricFilter])}
                                    </div>
                                    <div className="text-[10px] text-slate-500 uppercase mt-0.5">Top Spender</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Placements Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-700 shadow-sm bg-slate-800/20">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-700/50 text-slate-400 uppercase text-[10px] font-bold">
                            <tr>
                                <th className="px-4 py-3">Placement</th>
                                <th className="px-4 py-3 text-right">Share</th>
                                <th className="px-4 py-3 text-right">Impr.</th>
                                <th className="px-4 py-3 text-right">Clicks</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-300">Cost</th>
                                <th className="px-4 py-3 text-right">CTR</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-300">Conv.</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50 text-slate-300">
                            {data.length === 0 ? (
                                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500 italic">No placement data found for this period.</td></tr>
                            ) : (
                                data.map((p, i) => {
                                    const share = totalValue > 0 ? (p[placementsMetricFilter] / totalValue) * 100 : 0;
                                    return (
                                        <tr key={i} className="hover:bg-slate-700/30 transition-colors group">
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-lg opacity-70 group-hover:opacity-100 transition-opacity">{getCategoryIcon(p.type)}</span>
                                                    <div className="min-w-0">
                                                        <div className="font-medium text-slate-200 truncate max-w-[240px]" title={p.placement}>{p.placement}</div>
                                                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">{p.type.replace('_', ' ')}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 text-right">
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="text-xs font-mono text-slate-400">{fmtPct(share)}</span>
                                                    <div className="w-12 h-1 bg-slate-700 rounded-full overflow-hidden">
                                                        <div className="h-full bg-indigo-500/50" style={{ width: `${share}%` }}></div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 text-right font-mono text-xs">{fmtInt(p.impressions)}</td>
                                            <td className="px-4 py-3.5 text-right font-mono text-xs">{fmtInt(p.clicks)}</td>
                                            <td className="px-4 py-3.5 text-right font-mono text-xs text-slate-200">{fmtEuro(p.cost)}</td>
                                            <td className="px-4 py-3.5 text-right font-mono text-xs text-slate-400">{fmtPct(p.ctr * 100, 2)}</td>
                                            <td className="px-4 py-3.5 text-right font-mono text-xs text-emerald-400 font-medium">{fmtNum(p.conversions)}</td>
                                            <td className="px-4 py-3.5 text-right">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        alert(`Excluding placement: ${p.placement}`);
                                                    }}
                                                    className="text-[10px] uppercase font-bold text-red-400 opacity-60 hover:opacity-100 transition-all bg-red-400/5 px-2 py-1 rounded border border-red-400/20"
                                                >
                                                    Exclude
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderDGPlacements = () => renderPlacements(dgPlacements);

    const renderDGDemographics = () => {
        const categories = {
            AGE: 'Age',
            GENDER: 'Gender',
            PARENTAL_STATUS: 'Parental Status',
            INCOME: 'Household Income'
        };

        if (dgDemographics.length === 0) {
            return (
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-8 text-center text-slate-500 italic">
                    No demographic data found for this period.
                </div>
            );
        }

        // Calculate total spend and conversions for percentage metrics
        const totalSpend = dgDemographics.reduce((sum, d) => sum + d.cost, 0) / 4; // Approx because 4 categories
        const totalConversions = dgDemographics.reduce((sum, d) => sum + d.conversions, 0) / 4;

        // Group data by type
        const grouped = dgDemographics.reduce((acc: Record<string, typeof dgDemographics>, d) => {
            if (!acc[d.type]) acc[d.type] = [];
            acc[d.type].push(d);
            return acc;
        }, {});

        const categoryOrder: (keyof typeof categories)[] = ['AGE', 'GENDER', 'PARENTAL_STATUS', 'INCOME'];

        const getMetricValue = (d: DemographicPerformance) => {
            if (demoMetricFilter === 'cost') return d.cost;
            if (demoMetricFilter === 'conversions') return d.conversions;
            return d.clicks;
        };

        const renderBarChart = (items: DemographicPerformance[]) => {
            const maxValue = Math.max(...items.map(getMetricValue), 1);
            const sortedItems = [...items].sort((a, b) => getMetricValue(b) - getMetricValue(a));

            return (
                <div className="space-y-4 py-4 px-2">
                    {sortedItems.map((d, i) => {
                        const val = getMetricValue(d);
                        const percentage = (val / maxValue) * 100;
                        const spendPercent = totalSpend > 0 ? (d.cost / totalSpend) * 100 : 0;
                        const roas = d.cost > 0 && d.conversionValue > 0 ? d.conversionValue / d.cost : 0;

                        return (
                            <div key={i} className="group flex items-center gap-4">
                                <div className="w-24 text-xs font-medium text-slate-400 truncate" title={d.dimension}>
                                    {d.dimension}
                                </div>
                                <div className="flex-1 h-8 bg-slate-700/30 rounded-full overflow-hidden relative border border-slate-700/50">
                                    <div
                                        className={`h-full transition-all duration-700 ease-out flex items-center px-3 ${demoMetricFilter === 'cost' ? 'bg-indigo-500/40 border-r-2 border-indigo-400' :
                                            demoMetricFilter === 'conversions' ? 'bg-emerald-500/40 border-r-2 border-emerald-400' :
                                                'bg-blue-500/40 border-r-2 border-blue-400'
                                            }`}
                                        style={{ width: `${percentage}%` }}
                                    >
                                        <span className="text-[10px] font-bold text-white whitespace-nowrap drop-shadow-sm">
                                            {demoMetricFilter === 'cost' ? fmtEuro(val) : fmtInt(val)}
                                        </span>
                                    </div>
                                </div>
                                <div className="w-32 flex flex-col items-end gap-0.5">
                                    <div className="text-[11px] text-slate-300 font-mono tracking-tighter">
                                        {fmtInt(d.impressions)} <span className="text-slate-600">imp</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {roas > 0 && (
                                            <span className={`text-[10px] font-bold ${roas > 2 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                {fmtNum(roas, 1)}x <span className="text-[8px] opacity-70">ROAS</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        };

        const renderDonutChart = (items: DemographicPerformance[]) => {
            const totalVal = items.reduce((sum, d) => sum + getMetricValue(d), 0);
            const sortedItems = [...items].sort((a, b) => getMetricValue(b) - getMetricValue(a));

            // Colors for segments
            const colors = ['#6366f1', '#10b981', '#64748b', '#f59e0b', '#3b82f6'];

            let cumulativePercent = 0;
            const size = 120;
            const strokeWidth = 16;
            const radius = (size - strokeWidth) / 2;
            const center = size / 2;
            const circumference = 2 * Math.PI * radius;

            return (
                <div className="flex flex-col h-full py-2">
                    <div className="flex items-center justify-between px-6 gap-8 flex-1">
                        {/* Donut SVG */}
                        <div className="relative w-[120px] h-[120px] flex-shrink-0">
                            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
                                {/* Background circle */}
                                <circle
                                    cx={center}
                                    cy={center}
                                    r={radius}
                                    fill="transparent"
                                    stroke="#1e293b"
                                    strokeWidth={strokeWidth}
                                />
                                {sortedItems.map((d, i) => {
                                    const val = getMetricValue(d);
                                    if (val === 0) return null;
                                    const percent = totalVal > 0 ? val / totalVal : 0;
                                    const strokeDasharray = `${percent * circumference} ${circumference}`;
                                    const strokeDashoffset = -(cumulativePercent * circumference);
                                    cumulativePercent += percent;

                                    return (
                                        <circle
                                            key={i}
                                            cx={center}
                                            cy={center}
                                            r={radius}
                                            fill="transparent"
                                            stroke={colors[i % colors.length]}
                                            strokeWidth={strokeWidth}
                                            strokeDasharray={strokeDasharray}
                                            strokeDashoffset={strokeDashoffset}
                                            className="transition-all duration-1000 ease-in-out"
                                        />
                                    );
                                })}
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                <span className="text-lg font-black text-white leading-none">
                                    {demoMetricFilter === 'cost' ? fmtEuro(totalVal, 0) : fmtInt(totalVal)}
                                </span>
                                <span className="text-[8px] text-slate-500 uppercase tracking-tighter mt-1 font-bold">
                                    total {demoMetricFilter}
                                </span>
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="flex-1 space-y-3">
                            {sortedItems.map((d, i) => {
                                const val = getMetricValue(d);
                                const percent = totalVal > 0 ? (val / totalVal) * 100 : 0;
                                return (
                                    <div key={i} className="flex items-center justify-between gap-3 group">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: colors[i % colors.length] }} />
                                            <span className="text-[11px] font-bold text-slate-400 group-hover:text-slate-200 transition-colors truncate max-w-[80px]">
                                                {d.dimension}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[11px] font-medium text-slate-500 w-8 text-right">
                                                {fmtPct(percent, 0)}
                                            </span>
                                            <span className="text-[11px] font-bold text-slate-300 w-12 text-right">
                                                {demoMetricFilter === 'cost' ? fmtEuro(val, 0) : fmtInt(val)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Footer Metrics */}
                    <div className="mt-6 pt-4 border-t border-slate-700/30 px-6 flex items-center gap-8">
                        {sortedItems.filter(d => d.dimension.toLowerCase() !== 'unknown' && d.dimension.toLowerCase() !== 'undetermined').slice(0, 2).map((d, i) => {
                            const roas = d.cost > 0 && d.conversionValue > 0 ? d.conversionValue / d.cost : 0;
                            const cvr = d.clicks > 0 ? (d.conversions / d.clicks) * 100 : 0;
                            return (
                                <div key={i} className="flex flex-col gap-0.5">
                                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-tight">{d.dimension}</div>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-sm font-black text-slate-200">
                                            {roas > 0 ? fmtX(roas) : fmtPct(cvr)}
                                        </span>
                                        <span className="text-[8px] font-bold text-slate-600 uppercase">
                                            {roas > 0 ? 'ROAS' : 'Conv Rate'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        };

        return (
            <div className="space-y-8 max-w-6xl mx-auto p-4">
                {/* Header Toggles */}
                <div className="flex justify-between items-center bg-violet-900/10 p-4 border border-violet-500/20 rounded-xl mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-white">Demographics Analysis</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Explore AI-driven insights for your audience segments.</p>
                    </div>
                    <button
                        onClick={() => runAnalysis('category', 'Demographics')}
                        className="flex items-center gap-2 bg-violet-600/20 text-violet-400 hover:bg-violet-600 hover:text-white px-3 py-1.5 rounded-lg border border-violet-500/30 transition-all text-xs font-semibold shadow-sm hover:shadow-violet-500/25"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        Analyze Demographics
                    </button>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-800/40 p-2 rounded-2xl border border-slate-700/40 gap-4 mb-2">
                    <div className="flex bg-slate-900/40 p-1 rounded-xl border border-slate-700/30">
                        {(['cost', 'conversions', 'clicks'] as const).map(m => (
                            <button
                                key={m}
                                onClick={() => setDemoMetricFilter(m)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${demoMetricFilter === m ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                                    }`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>

                    <div className="flex bg-slate-900/40 p-1 rounded-xl border border-slate-700/30">
                        <button
                            onClick={() => setDemoViewMode('chart')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${demoViewMode === 'chart' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            📊 Chart
                        </button>
                        <button
                            onClick={() => setDemoViewMode('table')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${demoViewMode === 'table' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            📋 Table
                        </button>
                    </div>
                </div>

                {demoViewMode === 'chart' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {categoryOrder.map(catKey => {
                            const items = grouped[catKey];
                            if (!items || items.length === 0) return null;

                            const isDonutType = catKey === 'GENDER' || catKey === 'PARENTAL_STATUS';

                            return (
                                <div key={catKey} className={`rounded-3xl bg-slate-800/40 border border-slate-700/40 shadow-xl overflow-hidden flex flex-col ${catKey === 'AGE' || catKey === 'INCOME' ? 'col-span-1 md:col-span-2' : ''}`}>
                                    <div className="px-8 py-5 border-b border-slate-700/40 flex justify-between items-center bg-slate-700/10">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">
                                                {catKey === 'AGE' ? '🎂' : catKey === 'GENDER' ? '👥' : catKey === 'PARENTAL_STATUS' ? '👶' : '💰'}
                                            </span>
                                            <h3 className="text-sm font-black text-white tracking-widest uppercase">
                                                {categories[catKey]}
                                            </h3>
                                        </div>
                                    </div>

                                    <div className="flex-1 p-4">
                                        {isDonutType ? renderDonutChart(items) : renderBarChart(items)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {categoryOrder.map(catKey => {
                            const items = grouped[catKey];
                            if (!items || items.length === 0) return null;

                            return (
                                <div key={catKey} className="rounded-2xl bg-slate-800/40 border border-slate-700/50 overflow-hidden shadow-sm">
                                    <div className="px-6 py-3 bg-slate-700/30 border-b border-slate-700/50 flex justify-between items-center font-bold text-xs text-white uppercase tracking-tighter">
                                        {categories[catKey]}
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-slate-900/20 text-slate-400 uppercase text-[10px] tracking-wider">
                                                <tr>
                                                    <th className="px-6 py-3 font-medium">Dimension</th>
                                                    <th className="px-6 py-3 text-right font-medium">Impr.</th>
                                                    <th className="px-6 py-3 text-right font-medium">Clicks</th>
                                                    <th className="px-6 py-3 text-right font-medium">Cost</th>
                                                    <th className="px-6 py-3 text-right font-medium">Conv.</th>
                                                    <th className="px-6 py-3 text-right font-medium">CVR</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/30 text-slate-300">
                                                {items.sort((a, b) => b.cost - a.cost).map((d, i) => (
                                                    <tr key={i} className="hover:bg-slate-700/20 transition-colors">
                                                        <td className="px-6 py-3 font-medium text-slate-200">{d.dimension}</td>
                                                        <td className="px-6 py-3 text-right tabular-nums text-slate-400">{fmtInt(d.impressions)}</td>
                                                        <td className="px-6 py-3 text-right tabular-nums text-slate-400">{fmtInt(d.clicks)}</td>
                                                        <td className="px-6 py-3 text-right tabular-nums text-slate-400">{fmtEuro(d.cost)}</td>
                                                        <td className="px-6 py-3 text-right tabular-nums font-semibold text-emerald-400/80">{fmtNum(d.conversions)}</td>
                                                        <td className="px-6 py-3 text-right tabular-nums text-slate-500">
                                                            {d.clicks > 0 ? fmtPct((d.conversions / d.clicks) * 100) : '0%'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
                }
            </div >
        );
    };

    const renderDGAudiences = () => (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-violet-900/10 p-4 border border-violet-500/20 rounded-xl">
                <div>
                    <h3 className="text-sm font-semibold text-white">Audience Analysis</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Explore AI-driven insights for these audience segments.</p>
                </div>
                <button
                    onClick={() => runAnalysis('category', 'Audiences')}
                    className="flex items-center gap-2 bg-violet-600/20 text-violet-400 hover:bg-violet-600 hover:text-white px-3 py-1.5 rounded-lg border border-violet-500/30 transition-all text-xs font-semibold shadow-sm hover:shadow-violet-500/25"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Analyze Audiences
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3 font-medium">Audience</th>
                            <th className="px-4 py-3 font-medium">Type</th>
                            <th className="px-4 py-3 text-right font-medium">Impr.</th>
                            <th className="px-4 py-3 text-right font-medium">Clicks</th>
                            <th className="px-4 py-3 text-right font-medium">Cost</th>
                            <th className="px-4 py-3 text-right font-medium">ROAS</th>
                            <th className="px-4 py-3 text-right font-medium">Conv.</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700 text-slate-300">
                        {dgAudiences.length === 0 ? (
                            <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500 italic">No audience data found.</td></tr>
                        ) : (
                            dgAudiences.map((a, i) => (
                                <tr key={i} className="hover:bg-slate-700/30 transition-colors">
                                    <td className="px-4 py-4">{a.audienceName}</td>
                                    <td className="px-4 py-4 text-xs text-slate-400 capitalize">{a.audienceType?.toLowerCase().replace(/_/g, ' ') || 'Other'}</td>
                                    <td className="px-4 py-4 text-right">{fmtInt(a.impressions)}</td>
                                    <td className="px-4 py-4 text-right">{fmtInt(a.clicks)}</td>
                                    <td className="px-4 py-4 text-right">{fmtEuro(a.cost)}</td>
                                    <td className="px-4 py-4 text-right">{a.roas ? fmtX(a.roas) : '—'}</td>
                                    <td className="px-4 py-4 text-right">{fmtNum(a.conversions)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderDGTimeAnalysis = () => (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-violet-900/10 p-4 border border-violet-500/20 rounded-xl">
                <div>
                    <h3 className="text-sm font-semibold text-white">Time Analysis</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Explore AI-driven insights for time of day performance.</p>
                </div>
                <button
                    onClick={() => runAnalysis('category', 'Time Analysis')}
                    className="flex items-center gap-2 bg-violet-600/20 text-violet-400 hover:bg-violet-600 hover:text-white px-3 py-1.5 rounded-lg border border-violet-500/30 transition-all text-xs font-semibold shadow-sm hover:shadow-violet-500/25"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Analyze Time
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3 font-medium">Hour of Day</th>
                            <th className="px-4 py-3 text-right font-medium">Impr.</th>
                            <th className="px-4 py-3 text-right font-medium">Clicks</th>
                            <th className="px-4 py-3 text-right font-medium">Cost</th>
                            <th className="px-4 py-3 text-right font-medium">Conv.</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700 text-slate-300">
                        {dgTimeAnalysis.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500 italic">No time analysis data found.</td></tr>
                        ) : (
                            dgTimeAnalysis.map((t, i) => (
                                <tr key={i} className="hover:bg-slate-700/30 transition-colors">
                                    <td className="px-4 py-4">{t.period}:00</td>
                                    <td className="px-4 py-4 text-right">{fmtInt(t.impressions)}</td>
                                    <td className="px-4 py-4 text-right">{fmtInt(t.clicks)}</td>
                                    <td className="px-4 py-4 text-right">{fmtEuro(t.cost)}</td>
                                    <td className="px-4 py-4 text-right">{fmtNum(t.conversions)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderDGAssets = () => (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-violet-900/10 p-4 border border-violet-500/20 rounded-xl">
                <div>
                    <h3 className="text-sm font-semibold text-white">Assets Analysis</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Explore AI-driven insights for your ad assets.</p>
                </div>
                <button
                    onClick={() => runAnalysis('category', 'Assets')}
                    className="flex items-center gap-2 bg-violet-600/20 text-violet-400 hover:bg-violet-600 hover:text-white px-3 py-1.5 rounded-lg border border-violet-500/30 transition-all text-xs font-semibold shadow-sm hover:shadow-violet-500/25"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Analyze Assets
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3 font-medium">Asset</th>
                            <th className="px-4 py-3 font-medium">Type</th>
                            <th className="px-4 py-3 text-right font-medium">Impr.</th>
                            <th className="px-4 py-3 text-right font-medium">CTR</th>
                            <th className="px-4 py-3 text-right font-medium">Perf. Label</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700 text-slate-300">
                        {dgAssets.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500 italic">No asset data found.</td></tr>
                        ) : (
                            dgAssets.map((a, i) => (
                                <tr key={i} className="hover:bg-slate-700/30 transition-colors">
                                    <td className="px-4 py-4 max-w-sm">
                                        {a.imageUrl ? (
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={a.imageUrl}
                                                    alt={a.name || 'Asset preview'}
                                                    className="w-12 h-12 object-cover rounded border border-slate-700 flex-shrink-0"
                                                    loading="lazy"
                                                />
                                                <span className="text-slate-300 text-xs truncate">{a.name || 'Image'}</span>
                                            </div>
                                        ) : a.youtubeVideoId ? (
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={`https://img.youtube.com/vi/${a.youtubeVideoId}/default.jpg`}
                                                    alt={a.name || 'Video preview'}
                                                    className="w-16 h-12 object-cover rounded border border-slate-700 flex-shrink-0"
                                                    loading="lazy"
                                                />
                                                <span className="text-slate-300 text-xs truncate">{a.name || a.youtubeVideoId}</span>
                                            </div>
                                        ) : (
                                            <div className="truncate" title={a.text || a.name || a.id}>
                                                {a.text || a.name || a.id}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-4 text-xs text-slate-400">
                                        <span className="bg-slate-700/50 px-2 py-1 rounded border border-slate-600/50">
                                            {(a.fieldType && ASSET_FIELD_TYPE_LABELS[a.fieldType]) || (a.type && ASSET_FIELD_TYPE_LABELS[a.type]) || a.fieldType || a.type || '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 text-right">{fmtInt(a.impressions)}</td>
                                    <td className="px-4 py-4 text-right">{fmtPct(a.ctr * 100, 2)}</td>
                                    <td className="px-4 py-4 text-right">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${a.performanceLabel === 'EXCELLENT' ? 'bg-emerald-500/20 text-emerald-400' :
                                            a.performanceLabel === 'GOOD' ? 'bg-blue-500/20 text-blue-400' :
                                                a.performanceLabel === 'LOW' ? 'bg-red-500/20 text-red-400' :
                                                    'bg-slate-700 text-slate-400'
                                            }`}>
                                            {a.performanceLabel || 'PENDING'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // --- PMax Summary View ---
    const renderPMaxSummary = () => {
        const camp = campaigns.find(c => String(c.id) === String(navigation.campaignId));
        if (!camp) return null;

        const biddingLabel: Record<string, string> = {
            'TARGET_ROAS': 'Target ROAS',
            'TARGET_CPA': 'Target CPA',
            'MAXIMIZE_CONVERSION_VALUE': 'Max Conv. Value',
            'MAXIMIZE_CONVERSIONS': 'Max Conversions',
            'ENHANCED_CPC': 'Enhanced CPC',
            'MANUAL_CPC': 'Manual CPC',
        };

        return (
            <div className="p-6 space-y-6">
                <div className="flex justify-between items-center bg-violet-900/10 p-4 border border-violet-500/20 rounded-xl">
                    <div>
                        <h3 className="text-sm font-semibold text-white">Campaign AI Insights</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Get a deep performance analysis for this PMax campaign.</p>
                    </div>
                    <button
                        onClick={() => runAnalysis('campaign')}
                        className="flex items-center gap-2 bg-violet-600/20 text-violet-400 hover:bg-violet-600 hover:text-white px-3 py-1.5 rounded-lg border border-violet-500/30 transition-all text-xs font-semibold shadow-sm hover:shadow-violet-500/25"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        Analyze Campaign
                    </button>
                </div>
                {/* KPI Row 1 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-700/30 rounded-lg p-4">
                        <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Spend</div>
                        <div className="text-xl font-bold text-white">{fmtEuro(camp.cost, 0)}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                        <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">ROAS</div>
                        <div className={`text-xl font-bold ${camp.roas != null ? (camp.roas >= (camp.targetRoas || 3) ? 'text-emerald-400' : camp.roas >= 1 ? 'text-amber-400' : 'text-red-400') : 'text-slate-400'}`}>
                            {camp.roas != null ? fmtX(camp.roas) : '—'}
                        </div>
                        {camp.targetRoas ? <div className="text-xs text-slate-500 mt-1">Target: {fmtX(camp.targetRoas)}</div> : null}
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                        <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Conv. Value</div>
                        <div className="text-xl font-bold text-emerald-400">{fmtEuro(camp.conversionValue || 0, 0)}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                        <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Conversions</div>
                        <div className="text-xl font-bold text-white">{fmtNum(camp.conversions)}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                        <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Impressions</div>
                        <div className="text-xl font-bold text-white">{fmtInt(camp.impressions)}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                        <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Clicks</div>
                        <div className="text-xl font-bold text-white">{fmtInt(camp.clicks)}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                        <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">CTR</div>
                        <div className="text-xl font-bold text-white">{fmtPct(camp.ctr * 100, 2)}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4">
                        <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Avg. CPC</div>
                        <div className="text-xl font-bold text-white">{fmtEuro(camp.cpc)}</div>
                    </div>
                </div>

                {/* Bidding + IS Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {camp.biddingStrategyType && (
                        <div className="bg-slate-700/30 rounded-lg p-4">
                            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Bidding Strategy</div>
                            <div className="text-sm font-semibold text-purple-400">{BIDDING_STRATEGY_LABELS[camp.biddingStrategyType] || BIDDING_STRATEGY_LABELS[String(camp.biddingStrategyType).toUpperCase()] || camp.biddingStrategyType}</div>
                        </div>
                    )}
                    {camp.searchImpressionShare != null && (
                        <div className="bg-slate-700/30 rounded-lg p-4">
                            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Search IS</div>
                            <div className={`text-xl font-bold ${getISColor(camp.searchImpressionShare)}`}>
                                {fmtPct(camp.searchImpressionShare * 100)}
                            </div>
                        </div>
                    )}
                    {camp.searchLostISRank != null && (
                        <div className="bg-slate-700/30 rounded-lg p-4">
                            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Lost IS (Rank)</div>
                            <div className={`text-xl font-bold ${camp.searchLostISRank > 0.3 ? 'text-red-400' : 'text-slate-300'}`}>
                                {fmtPct(camp.searchLostISRank * 100)}
                            </div>
                        </div>
                    )}
                    {camp.searchLostISBudget != null && (
                        <div className="bg-slate-700/30 rounded-lg p-4">
                            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Lost IS (Budget)</div>
                            <div className={`text-xl font-bold ${camp.searchLostISBudget > 0.15 ? 'text-amber-400' : 'text-slate-300'}`}>
                                {fmtPct(camp.searchLostISBudget * 100)}
                            </div>
                        </div>
                    )}
                </div>

                {/* Asset Groups quick list */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-300">
                            Asset Groups <span className="text-slate-500 font-normal">({sortedData.length})</span>
                        </h3>
                        <button
                            onClick={() => setPmaxView('asset_groups')}
                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                        >
                            View all →
                        </button>
                    </div>
                    <div className="space-y-2">
                        {sortedData.slice(0, 6).map((ag: any) => {
                            const strength = ag.strength || ag.adStrength || 'UNSPECIFIED';
                            return (
                                <button
                                    key={ag.id}
                                    onClick={() => setNavigation({
                                        level: 'adgroup',
                                        campaignId: navigation.campaignId,
                                        campaignName: navigation.campaignName,
                                        adGroupId: ag.id,
                                        adGroupName: ag.name,
                                    })}
                                    className="w-full flex items-center justify-between bg-slate-700/20 hover:bg-slate-700/50 rounded-lg px-4 py-3 transition-colors cursor-pointer text-left group"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${getAdStrengthColor(strength)}`}>
                                            {AD_STRENGTH_LABEL[strength] || '—'}
                                        </span>
                                        <span className="text-sm text-white truncate group-hover:text-violet-300 transition-colors">{ag.name}</span>
                                    </div>
                                    <div className="flex items-center gap-5 text-xs text-slate-400 flex-shrink-0 ml-4">
                                        <span>{fmtEuro(ag.cost || 0, 0)}</span>
                                        {ag.roas != null && (
                                            <span className={`font-medium ${ag.roas >= 3 ? 'text-emerald-400' : ag.roas >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
                                                {fmtX(ag.roas)}
                                            </span>
                                        )}
                                        <span>{fmtNum(ag.conversions || 0, 1)} conv.</span>
                                        <span className="text-slate-600 group-hover:text-violet-400 transition-colors">→</span>
                                    </div>
                                </button>
                            );
                        })}
                        {sortedData.length > 6 && (
                            <button
                                onClick={() => setPmaxView('asset_groups')}
                                className="text-xs text-slate-500 hover:text-violet-400 transition-colors pl-1"
                            >
                                +{sortedData.length - 6} more asset groups…
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Get current data based on navigation level
    const getCurrentData = () => {
        switch (navigation.level) {
            case 'account':
                return campaigns;
            case 'campaign':
                return adGroups.filter(ag => String(ag.campaignId) === String(navigation.campaignId));
            case 'adgroup':
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
        ? adGroups.find(ag => String(ag.id) === String(navigation.adGroupId))
        : null;

    return (
        <div className="flex h-screen bg-slate-900 overflow-hidden">
            <Sidebar
                campaigns={campaigns}
                adGroups={adGroups}
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
                                        navigation.view === 'diagnostics' ? 'Diagnostics' :
                                            navigation.view === 'ngrams' ? 'N-Grams' :
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
                                        const currentParams = new URLSearchParams(searchParams.toString());
                                        currentParams.set('customerId', newId);
                                        // DO NOT manually call setSelectedAccountId here.
                                        // Rely on the URL change to trigger the reactive useEffect,
                                        // which handles both state clearing and ID updating synchronously.
                                        router.push(`/?${currentParams.toString()}`);
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
                                                const e = new Date(); const s = new Date(); s.setDate(e.getDate() - 30);
                                                setDateRange({ start: fmtDate(s), end: fmtDate(e) });
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
                        </div>
                    </main>
                ) : navigation.view === 'ngrams' ? (
                    <main className="flex-1 overflow-auto p-6 space-y-6">
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <NGramInsights
                                searchTerms={healthData?.searchTerms || []}
                                loading={loadingHealth}
                            />
                        </div>
                    </main>
                ) : (
                    <main className="flex-1 overflow-auto p-6 space-y-6">
                        {/* KPI Cards */}
                        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${(() => { const _c = navigation.level === 'adgroup' && campaigns.find(c => String(c.id) === String(navigation.campaignId)); const _ct = (_c as any)?.advertisingChannelType || ''; return _ct === 'DISPLAY' || _ct === 'VIDEO' || _ct === 'DEMAND_GEN' || _ct === 'DISCOVERY'; })() ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
                            <div className="rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 shadow-lg">
                                <p className="text-sm font-medium text-blue-100">Total Spend</p>
                                <p className="text-2xl font-bold text-white mt-1">{fmtEuro(totalSpend, 0)}</p>
                            </div>
                            <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 shadow-lg">
                                <p className="text-sm font-medium text-emerald-100">Conversions</p>
                                <p className="text-2xl font-bold text-white mt-1">{fmtInt(totalConversions)}</p>
                            </div>
                            <div className="rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 p-5 shadow-lg">
                                <p className="text-sm font-medium text-purple-100">Conv. Value</p>
                                <p className="text-2xl font-bold text-white mt-1">{fmtEuro(totalConversionValue, 0)}</p>
                            </div>
                            <div className={`rounded-xl bg-gradient-to-br p-5 shadow-lg ${totalROAS === 0 ? 'from-slate-600 to-slate-700' : 'from-pink-600 to-pink-700'}`}>
                                <p className={`text-sm font-medium ${totalROAS === 0 ? 'text-slate-300' : 'text-pink-100'}`}>ROAS</p>
                                <p className="text-2xl font-bold text-white mt-1">{fmtX(totalROAS)}</p>
                            </div>
                            <div className="rounded-xl bg-gradient-to-br from-violet-600 to-violet-700 p-5 shadow-lg">
                                <p className="text-sm font-medium text-violet-100">Clicks</p>
                                <p className="text-2xl font-bold text-white mt-1">{fmtInt(totalClicks)}</p>
                            </div>
                            {/* View-through Conv card — Display/Video/DG ad groups only */}
                            {navigation.level === 'adgroup' && (() => { const _c = campaigns.find(c => String(c.id) === String(navigation.campaignId)); const _ct = _c?.advertisingChannelType || ''; return _ct === 'DISPLAY' || _ct === 'VIDEO' || _ct === 'DEMAND_GEN' || _ct === 'DISCOVERY'; })() && (
                                <div className="rounded-xl bg-gradient-to-br from-teal-600 to-teal-700 p-5 shadow-lg">
                                    <p className="text-sm font-medium text-teal-100">View-through Conv.</p>
                                    <p className="text-2xl font-bold text-white mt-1">{fmtInt(currentAdGroup?.viewThroughConversions ?? 0)}</p>
                                    <p className="text-xs text-teal-200/70 mt-1">Saw ad, converted later</p>
                                </div>
                            )}
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
                                                    (campaigns.find(c => String(c.id) === String(navigation.campaignId))?.advertisingChannelType === 'PERFORMANCE_MAX' ||
                                                        campaigns.find(c => String(c.id) === String(navigation.campaignId))?.name.toLowerCase().includes('pmax'))
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
                                                    (navigation.level === 'campaign' && campaigns.find(c => c.id === navigation.campaignId)?.advertisingChannelType === 'PERFORMANCE_MAX') ? 'asset groups' : 'ad groups'
                                            }
                                        </span>
                                    </div>

                                    {/* Campaign-level View Tabs (DG or PMax) */}
                                    {(() => {
                                        const camp = campaigns.find(c => String(c.id) === String(navigation.campaignId));
                                        const isDG = camp?.advertisingChannelType === 'DEMAND_GEN' || camp?.advertisingChannelType === 'DISCOVERY' || camp?.advertisingChannelType === '14';
                                        const isPMaxCamp = camp?.advertisingChannelType === 'PERFORMANCE_MAX' || camp?.advertisingChannelType === '10';

                                        if (isDG && navigation.level === 'campaign') {
                                            const tabs = [
                                                { id: 'performance', label: 'Ad Groups' },
                                                { id: 'placements', label: 'Placements' },
                                                { id: 'audiences', label: 'Audiences' },
                                                { id: 'demographics', label: 'Demographics' },
                                                { id: 'time', label: 'Time Analysis' },
                                                { id: 'assets', label: 'Ads & Assets' }
                                            ];
                                            return (
                                                <div className="flex gap-1 bg-slate-900/50 p-1 rounded-lg border-x border-slate-700/50 w-full px-6 py-2">
                                                    {tabs.map(tab => (
                                                        <button
                                                            key={tab.id}
                                                            onClick={() => setDgView(tab.id as any)}
                                                            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${dgView === tab.id
                                                                ? 'bg-slate-700 text-white shadow-sm'
                                                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                                                }`}
                                                        >
                                                            {tab.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            );
                                        }

                                        if (isPMaxCamp && navigation.level === 'campaign') {
                                            return (
                                                <div className="flex gap-1 bg-slate-900/50 p-1 rounded-lg border-x border-slate-700/50 w-full px-6 py-2">
                                                    {([{ id: 'summary', label: 'Summary' }, { id: 'asset_groups', label: 'Asset Groups' }] as const).map(tab => (
                                                        <button
                                                            key={tab.id}
                                                            onClick={() => setPmaxView(tab.id)}
                                                            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${pmaxView === tab.id
                                                                ? 'bg-slate-700 text-white shadow-sm'
                                                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                                                }`}
                                                        >
                                                            {tab.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            );
                                        }

                                        return null;
                                    })()}

                                    {/* PMax adgroup-level IS diagnostic banner */}
                                    {navigation.level === 'adgroup' && (() => {
                                        const camp = campaigns.find(c => String(c.id) === String(navigation.campaignId));
                                        const isPMax = camp?.advertisingChannelType === 'PERFORMANCE_MAX' || camp?.advertisingChannelType === '10';
                                        if (!isPMax || !camp) return null;

                                        const is = camp.searchImpressionShare;
                                        const lostRank = camp.searchLostISRank;
                                        const lostBudget = camp.searchLostISBudget;
                                        const targetRoas = camp.targetRoas;
                                        const bidding = camp.biddingStrategyType;
                                        const adStrength = currentAdGroup?.adStrength;

                                        // Use global BIDDING_STRATEGY_LABELS (numeric keys from google-ads-api v22 enum)
                                        const biddingLabel = BIDDING_STRATEGY_LABELS[bidding || ''] || bidding || '—';
                                        // 11 = MAXIMIZE_CONVERSION_VALUE (verified from enum + Google Ads UI)
                                        const isMaxConvValue = bidding === 'MAXIMIZE_CONVERSION_VALUE' || bidding === '11';
                                        // 8 = TARGET_ROAS (from google-ads-api v22 enum)
                                        const isTargetRoasBidding = bidding === 'TARGET_ROAS' || bidding === '8';

                                        // Smart diagnosis logic
                                        const highLostRank = lostRank != null && lostRank > 0.3;
                                        const highLostBudget = lostBudget != null && lostBudget > 0.2;
                                        const excellentStrength = adStrength === 'EXCELLENT';

                                        let diagnosisIcon = '';
                                        let diagnosisText = '';
                                        let diagnosisColor = 'text-slate-300';
                                        let showAssetBreakdown = false;

                                        if (highLostBudget && highLostRank) {
                                            diagnosisIcon = '🔴';
                                            diagnosisText = 'Both budget and rank are limiting IS. Increase daily budget AND review Target ROAS.';
                                            diagnosisColor = 'text-red-300';
                                        } else if (highLostBudget) {
                                            diagnosisIcon = '💰';
                                            diagnosisText = 'Budget is the main constraint — impressions cut off when budget runs out. Increase daily budget to capture more potential.';
                                            diagnosisColor = 'text-amber-300';
                                        } else if (highLostRank && excellentStrength) {
                                            diagnosisIcon = '🎯';
                                            diagnosisText = targetRoas
                                                ? `Ad Strength is Excellent, so the quality is not the issue. With Target ROAS set to ${targetRoas.toFixed(2)}x, Smart Bidding skips auctions where predicted ROAS is below the target. Try reducing Target ROAS by 10–20% to allow more participation.`
                                                : isMaxConvValue
                                                    ? `Ad Strength is Excellent. Maximize Conv. Value without a Target ROAS means Google only bids in auctions it predicts will be profitable — the high Lost Rank reflects deliberate selectivity, not a failure. To expand reach, set a Target ROAS below the current achieved ROAS (e.g. ${camp.roas ? Math.round(camp.roas * 0.75) + 'x' : '10–15x'}) — the algorithm will then participate in more auctions at a slightly lower return threshold.`
                                                    : 'Ad Strength is Excellent — rank loss is driven by bidding constraints, not creative quality. Check the bidding strategy settings for this campaign.';
                                            diagnosisColor = 'text-violet-300';
                                        } else if (highLostRank && !excellentStrength) {
                                            diagnosisIcon = '📝';
                                            diagnosisText = 'Improving Ad Strength will increase auction eligibility and reduce rank loss. Add more variety across all asset types:';
                                            diagnosisColor = 'text-amber-300';
                                            showAssetBreakdown = true;
                                        } else if (lostRank != null && lostRank > 0.1) {
                                            diagnosisIcon = '📊';
                                            diagnosisText = 'Moderate rank loss. Monitor over time — could be competitive pressure or temporary bidding calibration.';
                                            diagnosisColor = 'text-slate-400';
                                        }

                                        return (
                                            <div className="mx-6 mt-3 mb-1 rounded-lg bg-amber-500/10 border border-amber-500/20 p-4">
                                                <div className="flex items-start gap-3">
                                                    <span className="text-amber-400 flex-shrink-0 mt-0.5">⚠️</span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white font-medium text-xs mb-2">
                                                            Campaign Impression Share{' '}
                                                            <span className="text-slate-400 font-normal">(asset group–level IS is not available in Google Ads API)</span>
                                                        </p>

                                                        {/* Metrics row with tooltips */}
                                                        <div className="flex items-center gap-4 flex-wrap">
                                                            {is != null && (
                                                                <Tooltip text="Share of eligible auctions where your ads were shown. Low IS means you're missing a significant portion of potential traffic.">
                                                                    <span className="text-xs cursor-help">
                                                                        IS:{' '}
                                                                        <span className={`font-semibold border-b border-dashed border-current ${getISColor(is)}`}>
                                                                            {fmtPct(is * 100)}
                                                                        </span>
                                                                    </span>
                                                                </Tooltip>
                                                            )}
                                                            {lostRank != null && (
                                                                <Tooltip text="Impressions lost because Smart Bidding chose not to enter auctions. With Excellent Ad Strength this is almost always caused by Target ROAS set too high — the algorithm skips any auction where the predicted ROAS is below the target.">
                                                                    <span className={`text-xs cursor-help ${lostRank > 0.3 ? 'text-red-400' : 'text-slate-300'}`}>
                                                                        Lost (Rank):{' '}
                                                                        <span className="font-semibold border-b border-dashed border-current">
                                                                            {fmtPct(lostRank * 100)}
                                                                        </span>
                                                                    </span>
                                                                </Tooltip>
                                                            )}
                                                            {lostBudget != null && (
                                                                <Tooltip text="Impressions lost because the daily budget was exhausted before the day ended. Fix: increase daily budget.">
                                                                    <span className={`text-xs cursor-help ${lostBudget > 0.2 ? 'text-amber-400' : 'text-slate-400'}`}>
                                                                        Lost (Budget):{' '}
                                                                        <span className="font-semibold border-b border-dashed border-current">
                                                                            {fmtPct(lostBudget * 100)}
                                                                        </span>
                                                                    </span>
                                                                </Tooltip>
                                                            )}
                                                            {bidding && (
                                                                <span className="text-xs text-slate-400">
                                                                    Bidding:{' '}
                                                                    <span className="text-slate-200">{biddingLabel}</span>
                                                                </span>
                                                            )}
                                                            <Tooltip text={targetRoas != null
                                                                ? `This campaign targets ${fmtX(targetRoas)} ROAS. If this is significantly above the actual achieved ROAS, Smart Bidding will skip many auctions to protect the target — causing high Lost IS (Rank) even with excellent creative quality.`
                                                                : 'No Target ROAS is set. The campaign uses Maximize Conversion Value, bidding as high as profitable. High Lost IS (Rank) in this mode is usually due to competition, not bidding limits.'
                                                            }>
                                                                <span className="text-xs cursor-help">
                                                                    Target ROAS:{' '}
                                                                    {targetRoas != null ? (
                                                                        <span className="font-semibold text-violet-400 border-b border-dashed border-violet-400/50">
                                                                            {fmtX(targetRoas)}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-slate-500 border-b border-dashed border-slate-500/50">Not set</span>
                                                                    )}
                                                                </span>
                                                            </Tooltip>
                                                        </div>

                                                        {/* Smart diagnosis */}
                                                        {diagnosisText && (
                                                            <div className="mt-2 pt-2 border-t border-amber-500/20">
                                                                <div className="flex items-start gap-2">
                                                                    <span className="flex-shrink-0 text-sm">{diagnosisIcon}</span>
                                                                    <p className={`text-xs leading-relaxed ${diagnosisColor}`}>{diagnosisText}</p>
                                                                </div>
                                                                {showAssetBreakdown && pmaxAssets.length > 0 && (() => {
                                                                    const counts = pmaxAssets.reduce((acc: Record<string, number>, a) => {
                                                                        const lbl = ASSET_FIELD_TYPE_LABELS[a.fieldType] || a.fieldType;
                                                                        acc[lbl] = (acc[lbl] || 0) + 1;
                                                                        return acc;
                                                                    }, {});
                                                                    return (
                                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                                            {Object.entries(PMAX_ASSET_THRESHOLDS).map(([type, { min, rec, label }]) => {
                                                                                const count = counts[type] || 0;
                                                                                const isDanger = count < min;
                                                                                const isWarn = !isDanger && count < rec;
                                                                                const cls = isDanger
                                                                                    ? 'text-red-400 bg-red-500/10 border-red-500/30'
                                                                                    : isWarn
                                                                                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                                                                                        : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
                                                                                const icon = isDanger ? '✗' : isWarn ? '~' : '✓';
                                                                                return (
                                                                                    <span key={type} className={`text-[10px] px-2 py-0.5 rounded border font-mono ${cls}`}>
                                                                                        {icon} {count}/{rec} {label}
                                                                                    </span>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    <div className="overflow-x-auto">
                                        {(navigation.level === 'campaign' && pmaxView === 'summary' && (() => { const _c = campaigns.find(c => String(c.id) === String(navigation.campaignId)); return _c?.advertisingChannelType === 'PERFORMANCE_MAX' || _c?.advertisingChannelType === '10'; })()) ? (
                                            renderPMaxSummary()
                                        ) : (dgView === 'performance' || (() => { const _c = campaigns.find(c => String(c.id) === String(navigation.campaignId)); return _c?.advertisingChannelType === 'PERFORMANCE_MAX' || _c?.advertisingChannelType === '10'; })()) ? (
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
                                                        {/* ... rest of existing table structure ... */}
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
                                                                    <button onClick={() => handleSort('searchLostISBudget')} className="flex items-center gap-1 ml-auto hover:text-white">
                                                                        Lost (Budget)
                                                                        {sortBy === 'searchLostISBudget' && (
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
                                                        {navigation.level === 'campaign' && (() => {
                                                            const camp = campaigns.find(c => String(c.id) === String(navigation.campaignId));
                                                            const ct = camp?.advertisingChannelType || '';
                                                            const isPMax = ct === 'PERFORMANCE_MAX' || camp?.name?.toLowerCase().includes('pmax');
                                                            const isShopping = ct === 'SHOPPING';
                                                            const isUpperFunnel = ct === 'VIDEO' || ct === 'DISPLAY' || ct === 'DEMAND_GEN' || ct === 'DISCOVERY';

                                                            if (isPMax) return (
                                                                <>
                                                                    <th className="px-4 py-3 text-right font-medium">Impr.</th>
                                                                    <th className="px-4 py-3 text-right font-medium">Clicks</th>
                                                                    <th className="px-4 py-3 text-right font-medium">Conv.</th>
                                                                    <th className="px-4 py-3 text-right font-medium">Conv. Value</th>
                                                                    <th className="px-4 py-3 text-right font-medium">ROAS</th>
                                                                    <th className="px-4 py-3 text-right font-medium text-purple-400">IS</th>
                                                                    <th className="px-4 py-3 text-right font-medium text-slate-400">Lost (Rank)</th>
                                                                    <th className="px-4 py-3 text-right font-medium">Ad Strength</th>
                                                                </>
                                                            );
                                                            if (isShopping) return (
                                                                <th className="px-4 py-3 text-right font-medium">Products</th>
                                                            );
                                                            if (isUpperFunnel) return (
                                                                <th className="px-4 py-3 text-right font-medium">Rel. CTR</th>
                                                            );
                                                            // Search / DSA / Brand
                                                            const isDSA = camp?.name?.toLowerCase().includes('dsa') || camp?.advertisingChannelSubType === 'SEARCH_DYNAMIC_ADS';
                                                            return (
                                                                <>
                                                                    <th className="px-4 py-3 text-right font-medium">Impr.</th>
                                                                    <th className="px-4 py-3 text-right font-medium">Clicks</th>
                                                                    <th className="px-4 py-3 text-right font-medium">Conversions</th>
                                                                    <th className="px-4 py-3 text-right font-medium">CVR</th>
                                                                    <th className="px-4 py-3 text-right font-medium">Conv. Value</th>
                                                                    <th className="px-4 py-3 text-right font-medium">IS</th>
                                                                    <th className="px-4 py-3 text-right font-medium">Lost (Rank)</th>
                                                                    <th className="px-4 py-3 text-right font-medium">Lost (Budget)</th>
                                                                    <th className="px-4 py-3 text-right font-medium">Avg QS</th>
                                                                    <th className="px-4 py-3 text-right font-medium">Ad Strength</th>
                                                                    {!isDSA && <th className="px-4 py-3 text-right font-medium">Poor Ads</th>}
                                                                </>
                                                            );
                                                        })()}
                                                        {navigation.level === 'adgroup' && (
                                                            <>
                                                                <th className="px-4 py-3 text-right font-medium">Impr.</th>
                                                                <th className="px-4 py-3 text-right font-medium">Clicks</th>
                                                                <th className="px-4 py-3 text-right font-medium">Conversions</th>
                                                                <th className="px-4 py-3 text-right font-medium">CVR</th>
                                                                <th className="px-4 py-3 text-right font-medium">Conv. Value</th>
                                                                <th className="px-4 py-3 text-right font-medium">ROAS</th>
                                                                <th className="px-4 py-3 text-right font-medium">IS</th>
                                                                <th className="px-4 py-3 text-right font-medium">Lost (Rank)</th>
                                                                <th className="px-4 py-3 text-right font-medium">Ad Strength</th>
                                                            </>
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-700">
                                                    {navigation.level === 'campaign' && (() => {
                                                        const camp = campaigns.find(c => String(c.id) === String(navigation.campaignId));
                                                        if (camp) {
                                                            const ct = camp.advertisingChannelType || '';
                                                            const isPMax = ct === 'PERFORMANCE_MAX' || camp.name?.toLowerCase().includes('pmax');
                                                            return (
                                                                <ParentContextRow
                                                                    name={camp.name}
                                                                    type="Campaign"
                                                                    metrics={camp}
                                                                    colSpan={8}
                                                                    layout={isPMax ? 'pmax' : 'search'}
                                                                />
                                                            );
                                                        }
                                                        return null;
                                                    })()}

                                                    {navigation.level === 'adgroup' && currentAdGroup && (() => {
                                                        const _camp = campaigns.find(c => String(c.id) === String(navigation.campaignId));
                                                        const _isPMax = _camp?.advertisingChannelType === 'PERFORMANCE_MAX' || _camp?.advertisingChannelType === '10';
                                                        // For PMax: asset groups don't have IS data from API; fall back to campaign-level IS
                                                        const _metrics = (_isPMax && _camp) ? {
                                                            ...currentAdGroup,
                                                            searchImpressionShare: currentAdGroup.searchImpressionShare ?? _camp.searchImpressionShare,
                                                            searchLostISRank: currentAdGroup.searchLostISRank ?? _camp.searchLostISRank,
                                                        } : currentAdGroup;
                                                        return (
                                                            <ParentContextRow
                                                                name={currentAdGroup.name}
                                                                type="Ad Group"
                                                                metrics={_metrics}
                                                                colSpan={8}
                                                                layout="adgroup"
                                                            />
                                                        );
                                                    })()}

                                                    {sortedData.map((item: any) => (
                                                        <tr
                                                            key={item.id}
                                                            className="hover:bg-slate-700/30 transition-colors cursor-pointer"
                                                            onClick={() => {
                                                                // Standard navigation

                                                                if (navigation.level === 'account') {
                                                                    setDgView('performance');
                                                                    setPmaxView('summary');
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
                                                                    format={(v) => fmtEuro(v, 0)}
                                                                    invertColor={true}
                                                                />
                                                            </td>
                                                            <td className="px-4 py-4 text-right">
                                                                <span className={`font-medium ${item.ctr >= 0.05 ? 'text-emerald-400' :
                                                                    item.ctr >= 0.02 ? 'text-amber-400' : 'text-red-400'
                                                                    }`}>
                                                                    {fmtPct(item.ctr * 100, 2)}
                                                                </span>
                                                            </td>
                                                            {navigation.level === 'account' && (
                                                                <>
                                                                    <td className="px-4 py-4 text-right text-slate-200">
                                                                        <MetricCell
                                                                            value={item.conversions || 0}
                                                                            previous={item.previous?.conversions}
                                                                            format={(v) => fmtNum(v)}
                                                                        />
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right text-slate-400">
                                                                        {item.clicks > 0 ? fmtPct((item.conversions || 0) / item.clicks * 100, 2) : '0.00%'}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right">
                                                                        {item.conversionValue != null && item.conversionValue > 0 ? (
                                                                            <span className="text-slate-200">{fmtEuro(item.conversionValue, 0)}</span>
                                                                        ) : (
                                                                            <span className="text-slate-500">—</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right">
                                                                        <div className="flex flex-col items-end">
                                                                            {item.roas != null ? (
                                                                                <span className={`font-medium ${item.roas >= 3 ? 'text-emerald-400' : item.roas >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
                                                                                    {fmtX(item.roas)}
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
                                                                                            {arrow} {fmtNum(Math.abs(delta), 0)}%
                                                                                        </span>
                                                                                    );
                                                                                })()
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right">
                                                                        {item.searchLostISBudget != null && item.searchLostISBudget > 0.15 ? (
                                                                            <span className="text-red-400 font-medium">
                                                                                {fmtPct(item.searchLostISBudget * 100)}
                                                                            </span>
                                                                        ) : item.searchLostISBudget != null ? (
                                                                            <span className="text-slate-400">
                                                                                {fmtPct(item.searchLostISBudget * 100)}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-500">—</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right">
                                                                        {item.searchLostISRank != null && item.searchLostISRank > 0.15 ? (
                                                                            <span className="text-red-400 font-medium">
                                                                                {fmtPct(item.searchLostISRank * 100)}
                                                                            </span>
                                                                        ) : item.searchLostISRank != null ? (
                                                                            <span className="text-slate-400">
                                                                                {fmtPct(item.searchLostISRank * 100)}
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
                                                            {navigation.level === 'campaign' && (() => {
                                                                const camp = campaigns.find(c => String(c.id) === String(navigation.campaignId));
                                                                const ct = camp?.advertisingChannelType || '';
                                                                const isPMax = ct === 'PERFORMANCE_MAX' || camp?.name?.toLowerCase().includes('pmax');
                                                                const isShopping = ct === 'SHOPPING';
                                                                const isUpperFunnel = ct === 'VIDEO' || ct === 'DISPLAY' || ct === 'DEMAND_GEN' || ct === 'DISCOVERY';

                                                                if (isPMax) return (
                                                                    <>
                                                                        <td className="px-4 py-4 text-right text-slate-300 font-mono text-xs">
                                                                            {fmtInt((item as any).impressions ?? 0)}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right text-slate-300 font-mono text-xs">
                                                                            {fmtInt((item as any).clicks ?? 0)}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right text-slate-300 font-mono text-xs">
                                                                            {fmtNum((item as any).conversions ?? 0)}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right">
                                                                            {(item as any).conversionValue > 0 ? (
                                                                                <span className="text-emerald-400 font-mono text-xs font-semibold">
                                                                                    {fmtEuro((item as any).conversionValue as number, 0)}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-slate-500 text-xs">—</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right">
                                                                            {(item as any).roas != null ? (
                                                                                <span className={`font-mono text-xs font-semibold ${(item as any).roas >= 3 ? 'text-emerald-400' :
                                                                                    (item as any).roas >= 1 ? 'text-amber-400' : 'text-red-400'
                                                                                    }`}>
                                                                                    {fmtX((item as any).roas as number)}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-slate-500 text-xs">—</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right">
                                                                            {(() => {
                                                                                const is = (item as any).searchImpressionShare ?? camp?.searchImpressionShare;
                                                                                return is != null ? (
                                                                                    <span className={`font-mono text-xs font-medium ${getISColor(is)}`}>
                                                                                        {fmtPct(is * 100)}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-slate-500 text-xs">—</span>
                                                                                );
                                                                            })()}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right">
                                                                            {(() => {
                                                                                const lost = (item as any).searchLostISRank ?? camp?.searchLostISRank;
                                                                                return lost != null ? (
                                                                                    <span className={`font-mono text-xs font-medium ${lost > 0.3 ? 'text-red-400' : 'text-slate-400'}`}>
                                                                                        {fmtPct(lost * 100)}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-slate-500 text-xs">—</span>
                                                                                );
                                                                            })()}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right">
                                                                            {(() => {
                                                                                const s = (item as any).strength || (item as any).adStrength || 'UNSPECIFIED';
                                                                                const label = AD_STRENGTH_LABEL[s] ?? s;
                                                                                const tooltip = s === 'UNRATED'
                                                                                    ? 'Няма достатъчно данни за оценка на Ad Strength'
                                                                                    : undefined;
                                                                                const badge = (
                                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getAdStrengthColor(s)}`} title={tooltip ?? s}>
                                                                                        {label}
                                                                                    </span>
                                                                                );
                                                                                return tooltip
                                                                                    ? <Tooltip text={tooltip}>{badge}</Tooltip>
                                                                                    : badge;
                                                                            })()}
                                                                        </td>
                                                                    </>
                                                                );

                                                                if (isShopping) return (
                                                                    <td className="px-4 py-4 text-right">
                                                                        <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">Shopping</span>
                                                                    </td>
                                                                );

                                                                if (isUpperFunnel) return (
                                                                    <td className="px-4 py-4 text-right">
                                                                        {item.relativeCtr != null ? (
                                                                            <span className={`font-medium ${item.relativeCtr >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                                                {fmtX(item.relativeCtr)}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-500">—</span>
                                                                        )}
                                                                    </td>
                                                                );

                                                                // Search / DSA / Brand — show Impr. + Clicks + Conversions + CVR + Conv.Value + IS + Lost Rank + QS + Ad Strength + Poor Ads
                                                                const isDSARow = camp?.name?.toLowerCase().includes('dsa') || camp?.advertisingChannelSubType === 'SEARCH_DYNAMIC_ADS';
                                                                return (
                                                                    <>
                                                                        <td className="px-4 py-4 text-right text-slate-300">
                                                                            {fmtInt(item.impressions || 0)}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right text-slate-300">
                                                                            {fmtInt(item.clicks || 0)}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right text-slate-300">
                                                                            {fmtNum(item.conversions || 0, 1)}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right text-slate-400 text-xs">
                                                                            {item.clicks > 0 ? fmtPct(item.conversions / item.clicks * 100, 2) : '—'}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right">
                                                                            {(item as any).conversionValue > 0 ? (
                                                                                <span className="text-emerald-400 font-medium">{fmtEuro((item as any).conversionValue as number, 0)}</span>
                                                                            ) : <span className="text-slate-500">—</span>}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right">
                                                                            {item.searchImpressionShare != null ? (
                                                                                <span className={`font-medium ${getISColor(item.searchImpressionShare)}`}>
                                                                                    {fmtPct(item.searchImpressionShare * 100)}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-slate-500">—</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right">
                                                                            {item.searchLostISRank != null ? (
                                                                                <span className={`font-medium ${item.searchLostISRank > 0.3 ? 'text-red-400' : 'text-slate-400'}`}>
                                                                                    {fmtPct(item.searchLostISRank * 100)}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-slate-500">—</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right">
                                                                            {(() => {
                                                                                const budgetLost = (item as any).searchLostISBudget ?? camp?.searchLostISBudget;
                                                                                return budgetLost != null ? (
                                                                                    <span className={`font-medium ${budgetLost > 0.15 ? 'text-red-400' : 'text-slate-400'}`}>
                                                                                        {fmtPct(budgetLost * 100)}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-slate-500">—</span>
                                                                                );
                                                                            })()}
                                                                        </td>
                                                                        <td className="px-4 py-4 text-right">
                                                                            {item.avgQualityScore !== null && item.avgQualityScore <= 6 ? (
                                                                                <Tooltip text={getQSValueTip(item.avgQualityScore)}>
                                                                                    <span className={`font-medium ${getQSColor(item.avgQualityScore)} border-b border-dashed ${item.avgQualityScore <= 4 ? 'border-red-400/40' : 'border-amber-400/40'}`}>
                                                                                        {fmtNum(item.avgQualityScore, 1)}
                                                                                    </span>
                                                                                </Tooltip>
                                                                            ) : (
                                                                                <span className={`font-medium ${getQSColor(item.avgQualityScore)}`}>
                                                                                    {fmtNum(item.avgQualityScore, 1)}
                                                                                </span>
                                                                            )}
                                                                            {item.keywordsWithLowQS > 0 && (
                                                                                <Tooltip text={`${item.keywordsWithLowQS} keyword${item.keywordsWithLowQS > 1 ? 's' : ''} with Quality Score below 5. Click into this ad group to see which keywords need attention.`}>
                                                                                    <span className="ml-1 text-xs text-red-400 border-b border-dashed border-red-400/40">
                                                                                        ({item.keywordsWithLowQS} low)
                                                                                    </span>
                                                                                </Tooltip>
                                                                            )}
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
                                                                        {!isDSARow && (
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
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                            {navigation.level === 'adgroup' && (
                                                                <>
                                                                    <td className="px-4 py-4 text-right text-slate-300">
                                                                        {fmtInt(item.impressions || 0)}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right text-slate-300">
                                                                        {fmtInt(item.clicks || 0)}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right text-slate-200 font-mono text-sm">
                                                                        {fmtNum(item.conversions || 0, 1)}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right text-slate-400 text-xs">
                                                                        {item.clicks > 0 ? fmtPct(item.conversions / item.clicks * 100, 2) : '—'}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right">
                                                                        {(item as any).conversionValue > 0 ? (
                                                                            <span className="text-emerald-400 font-medium">{fmtEuro((item as any).conversionValue as number, 0)}</span>
                                                                        ) : <span className="text-slate-500">—</span>}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right text-slate-200 font-mono text-sm">
                                                                        {fmtX(item.roas)}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right">
                                                                        {item.searchImpressionShare != null ? (
                                                                            <span className={`font-medium ${getISColor(item.searchImpressionShare)}`}>
                                                                                {fmtPct(item.searchImpressionShare * 100)}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-500">—</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right">
                                                                        {item.searchLostISRank != null ? (
                                                                            <span className={`font-medium ${item.searchLostISRank > 0.3 ? 'text-red-400' : 'text-slate-400'}`}>
                                                                                {fmtPct(item.searchLostISRank * 100)}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-500">—</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right">
                                                                        {(() => {
                                                                            const s = (item as any).strength || (item as any).adStrength || 'UNSPECIFIED';
                                                                            return (
                                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getAdStrengthColor(s)}`}>
                                                                                    {AD_STRENGTH_LABEL[s] ?? s}
                                                                                </span>
                                                                            );
                                                                        })()}
                                                                    </td>
                                                                </>
                                                            )}
                                                        </tr>
                                                    ))}
                                                    {sortedData.length === 0 && (
                                                        <tr>
                                                            <td colSpan={11} className="px-6 py-12 text-center text-slate-500">
                                                                No data found.
                                                            </td>
                                                        </tr>
                                                    )}

                                                </tbody>
                                            </table>
                                        ) : dgView === 'placements' ? (
                                            <div className="p-6">{renderDGPlacements()}</div>
                                        ) : dgView === 'audiences' ? (
                                            <div className="p-6">{renderDGAudiences()}</div>
                                        ) : dgView === 'demographics' ? (
                                            <div className="p-6">{renderDGDemographics()}</div>
                                        ) : dgView === 'time' ? (
                                            <div className="p-6">{renderDGTimeAnalysis()}</div>
                                        ) : dgView === 'assets' ? (
                                            <div className="p-6">{renderDGAssets()}</div>
                                        ) : null}
                                    </div>
                                </div>

                                {/* Ad Group Detail Sections */}
                                {navigation.level === 'adgroup' && currentAdGroup && (
                                    <>
                                        {/* ── Display / Video / DG ad group sections ─────────────────── */}
                                        {(() => {
                                            const _camp = campaigns.find(c => String(c.id) === String(navigation.campaignId));
                                            const _ct = _camp?.advertisingChannelType || '';
                                            const _isUF = _ct === 'DISPLAY' || _ct === 'VIDEO' || _ct === 'DEMAND_GEN' || _ct === 'DISCOVERY';
                                            if (!_isUF) return null;
                                            return (
                                                <>
                                                    {/* Placements */}
                                                    <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden mb-6 p-6">
                                                        <div className="flex justify-between items-center mb-6">
                                                            <div>
                                                                <h2 className="text-xl font-bold text-white">Placements Performance</h2>
                                                                <p className="text-sm text-slate-400 mt-1">Where your ads are being shown across the Google Display Network and YouTube</p>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded border border-slate-600">
                                                                    {displayPlacements.length} Total Placements
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {renderPlacements(displayPlacements)}
                                                    </div>

                                                    {/* Audiences */}
                                                    <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden mb-6">
                                                        <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                                                            <div>
                                                                <h2 className="font-semibold text-white">Audiences</h2>
                                                                <p className="text-xs text-slate-400 mt-0.5">Audience segments targeted in this ad group</p>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">{displayAudiences.length} audiences</span>
                                                                <button
                                                                    onClick={() => runAnalysis('category', 'Audiences')}
                                                                    className="flex items-center gap-2 bg-violet-600/20 text-violet-400 hover:bg-violet-600 hover:text-white px-3 py-1.5 rounded-lg border border-violet-500/30 transition-all text-[11px] font-semibold"
                                                                >
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                                    Analyze
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left text-sm">
                                                                <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                                                                    <tr>
                                                                        <th className="px-4 py-3 font-medium">Audience</th>
                                                                        <th className="px-4 py-3 font-medium">Type</th>
                                                                        <th className="px-4 py-3 text-right font-medium">Impr.</th>
                                                                        <th className="px-4 py-3 text-right font-medium">Clicks</th>
                                                                        <th className="px-4 py-3 text-right font-medium">Cost</th>
                                                                        <th className="px-4 py-3 text-right font-medium">Conv.</th>
                                                                        <th className="px-4 py-3 text-right font-medium">Conv. Value</th>
                                                                        <th className="px-4 py-3 text-right font-medium">ROAS</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-700 text-slate-300">
                                                                    {displayAudiences.length === 0 ? (
                                                                        <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500 italic">No audience data for this period.</td></tr>
                                                                    ) : displayAudiences.map((a, i) => (
                                                                        <tr key={i} className="hover:bg-slate-700/30 transition-colors">
                                                                            <td className="px-4 py-3 text-slate-200">{a.audienceName}</td>
                                                                            <td className="px-4 py-3"><span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded">{a.audienceType || 'AUDIENCE'}</span></td>
                                                                            <td className="px-4 py-3 text-right">{fmtInt(a.impressions)}</td>
                                                                            <td className="px-4 py-3 text-right">{fmtInt(a.clicks)}</td>
                                                                            <td className="px-4 py-3 text-right">{fmtEuro(a.cost)}</td>
                                                                            <td className="px-4 py-3 text-right">{fmtNum(a.conversions, 1)}</td>
                                                                            <td className="px-4 py-3 text-right">{fmtEuro(a.conversionValue)}</td>
                                                                            <td className="px-4 py-3 text-right">{fmtX(a.roas)}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>

                                                    {/* Demographics */}
                                                    {displayDemographics.length > 0 && (
                                                        <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden mb-6">
                                                            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                                                                <div>
                                                                    <h2 className="font-semibold text-white">Demographics</h2>
                                                                    <p className="text-xs text-slate-400 mt-0.5">Age and gender breakdown for this ad group</p>
                                                                </div>
                                                                <button
                                                                    onClick={() => runAnalysis('category', 'Demographics')}
                                                                    className="flex items-center gap-2 bg-violet-600/20 text-violet-400 hover:bg-violet-600 hover:text-white px-3 py-1.5 rounded-lg border border-violet-500/30 transition-all text-[11px] font-semibold"
                                                                >
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                                    Analyze
                                                                </button>
                                                            </div>
                                                            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-700">
                                                                {/* Age */}
                                                                <div className="overflow-x-auto">
                                                                    <table className="w-full text-left text-sm">
                                                                        <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                                                                            <tr>
                                                                                <th className="px-4 py-3 font-medium">Age</th>
                                                                                <th className="px-4 py-3 text-right font-medium">Impr.</th>
                                                                                <th className="px-4 py-3 text-right font-medium">Clicks</th>
                                                                                <th className="px-4 py-3 text-right font-medium">Cost</th>
                                                                                <th className="px-4 py-3 text-right font-medium">Conv.</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-slate-700 text-slate-300">
                                                                            {displayDemographics.filter(d => d.type === 'AGE').map((d, i) => (
                                                                                <tr key={i} className="hover:bg-slate-700/30 transition-colors">
                                                                                    <td className="px-4 py-3 text-slate-200">{d.dimension}</td>
                                                                                    <td className="px-4 py-3 text-right">{fmtInt(d.impressions)}</td>
                                                                                    <td className="px-4 py-3 text-right">{fmtInt(d.clicks)}</td>
                                                                                    <td className="px-4 py-3 text-right">{fmtEuro(d.cost)}</td>
                                                                                    <td className="px-4 py-3 text-right">{fmtNum(d.conversions, 1)}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                                {/* Gender */}
                                                                <div className="overflow-x-auto">
                                                                    <table className="w-full text-left text-sm">
                                                                        <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                                                                            <tr>
                                                                                <th className="px-4 py-3 font-medium">Gender</th>
                                                                                <th className="px-4 py-3 text-right font-medium">Impr.</th>
                                                                                <th className="px-4 py-3 text-right font-medium">Clicks</th>
                                                                                <th className="px-4 py-3 text-right font-medium">Cost</th>
                                                                                <th className="px-4 py-3 text-right font-medium">Conv.</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-slate-700 text-slate-300">
                                                                            {displayDemographics.filter(d => d.type === 'GENDER').map((d, i) => (
                                                                                <tr key={i} className="hover:bg-slate-700/30 transition-colors">
                                                                                    <td className="px-4 py-3 text-slate-200">{d.dimension}</td>
                                                                                    <td className="px-4 py-3 text-right">{fmtInt(d.impressions)}</td>
                                                                                    <td className="px-4 py-3 text-right">{fmtInt(d.clicks)}</td>
                                                                                    <td className="px-4 py-3 text-right">{fmtEuro(d.cost)}</td>
                                                                                    <td className="px-4 py-3 text-right">{fmtNum(d.conversions, 1)}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Ad Assets */}
                                                    <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden mb-6">
                                                        <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                                                            <div>
                                                                <h2 className="font-semibold text-white">Ad Assets</h2>
                                                                <p className="text-xs text-slate-400 mt-0.5">Responsive Display Ad creative elements</p>
                                                            </div>
                                                            <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">{displayAdAssets.length} assets</span>
                                                        </div>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left text-sm">
                                                                <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                                                                    <tr>
                                                                        <th className="px-4 py-3 font-medium">Type</th>
                                                                        <th className="px-4 py-3 font-medium">Content</th>
                                                                        <th className="px-4 py-3 font-medium">Performance</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-700 text-slate-300">
                                                                    {displayAdAssets.length === 0 ? (
                                                                        <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500 italic">No ad asset data for this period.</td></tr>
                                                                    ) : displayAdAssets.map((asset, i) => {
                                                                        const perfLabel = PERFORMANCE_LABEL_LABELS[asset.performanceLabel] || asset.performanceLabel || 'Pending';
                                                                        const perfColor = asset.performanceLabel === 'BEST' ? 'bg-emerald-500/20 text-emerald-400'
                                                                            : asset.performanceLabel === 'GOOD' ? 'bg-blue-500/20 text-blue-400'
                                                                                : asset.performanceLabel === 'LOW' ? 'bg-red-500/20 text-red-400'
                                                                                    : asset.performanceLabel === 'LEARNING' ? 'bg-purple-500/20 text-purple-400'
                                                                                        : 'bg-slate-600/40 text-slate-400';
                                                                        const fieldLabel = ASSET_FIELD_TYPE_LABELS[asset.fieldType] || asset.fieldType;
                                                                        return (
                                                                            <tr key={i} className="hover:bg-slate-700/30 transition-colors">
                                                                                <td className="px-4 py-3">
                                                                                    <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">{fieldLabel}</span>
                                                                                </td>
                                                                                <td className="px-4 py-3 max-w-sm">
                                                                                    {asset.text ? (
                                                                                        <span className="text-slate-200">{asset.text}</span>
                                                                                    ) : asset.imageUrl ? (
                                                                                        <a href={asset.imageUrl} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline text-xs truncate block max-w-xs">{asset.name || asset.imageUrl}</a>
                                                                                    ) : asset.youtubeVideoId ? (
                                                                                        <span className="text-slate-400 text-xs">YouTube: {asset.youtubeVideoId}</span>
                                                                                    ) : (
                                                                                        <span className="text-slate-500 italic">{asset.name || '—'}</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-4 py-3">
                                                                                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${perfColor}`}>{perfLabel}</span>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                        {/* ── end Display sections ─────────────────────────────────── */}

                                        {/* Shopping: Listing Groups / Product Groups */}
                                        {listingGroups.length > 0 && (
                                            <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden mb-6">
                                                <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                                                    <div>
                                                        <h2 className="font-semibold text-white">Product Groups</h2>
                                                        <p className="text-xs text-slate-400 mt-0.5">Shopping listing groups within this ad group</p>
                                                    </div>
                                                    <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">
                                                        {listingGroups.length} groups
                                                    </span>
                                                </div>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left text-sm">
                                                        <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                                                            <tr>
                                                                <th className="px-4 py-3 font-medium">Dimension</th>
                                                                <th className="px-4 py-3 font-medium">Value</th>
                                                                <th className="px-4 py-3 font-medium">Type</th>
                                                                <th className="px-4 py-3 text-right font-medium">Impr.</th>
                                                                <th className="px-4 py-3 text-right font-medium">Clicks</th>
                                                                <th className="px-4 py-3 text-right font-medium">Cost</th>
                                                                <th className="px-4 py-3 text-right font-medium">Conv.</th>
                                                                <th className="px-4 py-3 text-right font-medium">ROAS</th>
                                                                <th className="px-4 py-3 text-right font-medium">IS</th>
                                                                <th className="px-4 py-3 text-right font-medium">Lost (Rank)</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-700">
                                                            {currentAdGroup && (
                                                                <ParentContextRow
                                                                    name={currentAdGroup.name}
                                                                    type="Ad Group"
                                                                    metrics={currentAdGroup}
                                                                    colSpan={10}
                                                                    layout="listing_group"
                                                                />
                                                            )}

                                                            {listingGroups.map((lg: any, idx: number) => (
                                                                <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                                                                    <td className="px-4 py-3 text-slate-300 text-xs font-medium">{lg.dimension}</td>
                                                                    <td className="px-4 py-3 text-slate-400 text-xs">{lg.caseValue || <span className="italic text-slate-500">All</span>}</td>
                                                                    <td className="px-4 py-3">
                                                                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${lg.type === 'SUBDIVISION' ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-600/50 text-slate-400'
                                                                            }`}>{lg.type}</span>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right text-slate-300">{fmtInt(lg.impressions)}</td>
                                                                    <td className="px-4 py-3 text-right text-slate-300">{fmtInt(lg.clicks)}</td>
                                                                    <td className="px-4 py-3 text-right text-slate-200">{fmtEuro(lg.cost)}</td>
                                                                    <td className="px-4 py-3 text-right text-slate-300">{fmtNum(lg.conversions)}</td>
                                                                    <td className="px-4 py-3 text-right">
                                                                        {lg.roas != null ? (
                                                                            <span className={`font-medium ${lg.roas >= 3 ? 'text-emerald-400' : lg.roas >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
                                                                                {fmtX(lg.roas)}
                                                                            </span>
                                                                        ) : <span className="text-slate-500">—</span>}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right">
                                                                        {lg.searchImpressionShare != null ? (
                                                                            <span className={`font-medium ${getISColor(lg.searchImpressionShare)}`}>
                                                                                {fmtPct(lg.searchImpressionShare * 100)}
                                                                            </span>
                                                                        ) : <span className="text-slate-500">—</span>}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right">
                                                                        {lg.searchLostISRank != null ? (
                                                                            <span className={`font-medium ${lg.searchLostISRank > 0.3 ? 'text-red-400' : 'text-slate-400'}`}>
                                                                                {fmtPct(lg.searchLostISRank * 100)}
                                                                            </span>
                                                                        ) : <span className="text-slate-500">—</span>}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {pmaxAssets.length > 0 ? (
                                            <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden mb-6">
                                                <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                                                    <div>
                                                        <h2 className="font-semibold text-white">Asset Group Assets</h2>
                                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                            {(() => {
                                                                const counts = pmaxAssets.reduce((acc: Record<string, number>, a) => {
                                                                    const lbl = ASSET_FIELD_TYPE_LABELS[a.fieldType] || a.fieldType;
                                                                    acc[lbl] = (acc[lbl] || 0) + 1;
                                                                    return acc;
                                                                }, {});
                                                                // Show threshold-aware pills for known types, plain pills for others
                                                                const knownTypes = new Set(Object.keys(PMAX_ASSET_THRESHOLDS));
                                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                                const pills: any[] = [];
                                                                // Known types first (with color coding)
                                                                Object.entries(PMAX_ASSET_THRESHOLDS).forEach(([type, { min, rec, label }]) => {
                                                                    const count = counts[type] || 0;
                                                                    if (count === 0 && min === 0) return; // skip optional missing
                                                                    const isDanger = count < min;
                                                                    const isWarn = !isDanger && count < rec;
                                                                    const cls = isDanger
                                                                        ? 'text-red-400 bg-red-500/10 border border-red-500/30'
                                                                        : isWarn
                                                                            ? 'text-amber-400 bg-amber-500/10 border border-amber-500/30'
                                                                            : 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
                                                                    const icon = isDanger ? '✗' : isWarn ? '~' : '✓';
                                                                    pills.push(
                                                                        <span key={type} className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${cls}`}>
                                                                            {icon} {count}/{rec} {label}
                                                                        </span>
                                                                    );
                                                                });
                                                                // Other types (no threshold) — plain
                                                                Object.entries(counts).forEach(([type, count]) => {
                                                                    if (knownTypes.has(type)) return;
                                                                    pills.push(
                                                                        <span key={type} className="text-[10px] text-slate-400 bg-slate-700/60 px-2 py-0.5 rounded-full">
                                                                            {count} {type}
                                                                        </span>
                                                                    );
                                                                });
                                                                return pills;
                                                            })()}
                                                        </div>
                                                    </div>
                                                    <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded flex-shrink-0">
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
                                                            {currentAdGroup && (
                                                                <ParentContextRow
                                                                    name={currentAdGroup.name}
                                                                    type="Asset Group"
                                                                    metrics={currentAdGroup}
                                                                    colSpan={4}
                                                                    layout="pmax_assets"
                                                                />
                                                            )}
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
                                                                        {(asset.performanceLabel === 'LOW' || asset.performanceLabel === 'PENDING' || asset.performanceLabel === 'LEARNING' || asset.performanceLabel === 'UNKNOWN' || !asset.performanceLabel) ? (
                                                                            <Tooltip text={getPMaxPerfTip(asset.performanceLabel || 'UNKNOWN')}>
                                                                                <span className={`px-2 py-1 rounded text-xs font-bold border-b border-dashed ${asset.performanceLabel === 'LOW' ? 'bg-red-500/20 text-red-400 border-red-400/40' : 'bg-slate-600/50 text-slate-400 border-slate-400/40'}`}>
                                                                                    {PERFORMANCE_LABEL_LABELS[asset.performanceLabel || 'UNKNOWN'] || 'Pending'}
                                                                                </span>
                                                                            </Tooltip>
                                                                        ) : (
                                                                            <span className={`px-2 py-1 rounded text-xs font-bold ${(asset.performanceLabel === 'BEST' || asset.performanceLabel === 'GOOD') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600/50 text-slate-400'}`}>
                                                                                {PERFORMANCE_LABEL_LABELS[asset.performanceLabel] || asset.performanceLabel}
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
                                                {/* Keywords with QS — hidden for Display/Video/DG; DSA banner shown for DSA; table for Search */}
                                                {!(() => { const _c = campaigns.find(c => String(c.id) === String(navigation.campaignId)); const _ct = _c?.advertisingChannelType || ''; return _ct === 'DISPLAY' || _ct === 'VIDEO' || _ct === 'DEMAND_GEN' || _ct === 'DISCOVERY'; })() && ((() => {
                                                    const _c = campaigns.find(c => String(c.id) === String(navigation.campaignId));
                                                    const _isDSA = _c?.name?.toLowerCase().includes('dsa') || _c?.advertisingChannelSubType === 'SEARCH_DYNAMIC_ADS';
                                                    return _isDSA;
                                                })() ? (
                                                    <div className="rounded-xl bg-slate-800 border border-slate-700 p-5 mb-4">
                                                        <div className="flex items-start gap-3">
                                                            <span className="text-slate-400 text-lg leading-none mt-0.5">ℹ️</span>
                                                            <div>
                                                                <h3 className="font-medium text-white mb-1">Dynamic Search Ads — no standard keywords</h3>
                                                                <p className="text-sm text-slate-400">DSA campaigns target searches automatically based on your website content. Check the <span className="text-violet-400">Search Terms</span> section below for actual query data.</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
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
                                                                        <th className="px-4 py-3 text-right font-medium">Cost</th>
                                                                        <th className="px-4 py-3 text-right font-medium">Clicks</th>
                                                                        <th className="px-4 py-3 text-right font-medium">Conv.</th>
                                                                        <th className="px-4 py-3 text-right font-medium">CPA</th>
                                                                        <th className="px-4 py-3 text-right font-medium">IS</th>
                                                                        <th className="px-4 py-3 text-right font-medium">Lost (Rank)</th>
                                                                        <th className="px-4 py-3 text-center font-medium">QS</th>
                                                                        <th className="px-4 py-3 text-center font-medium">Exp. CTR</th>
                                                                        <th className="px-4 py-3 text-center font-medium">Ad Rel.</th>
                                                                        <th className="px-4 py-3 text-center font-medium">LP Exp.</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-700">
                                                                    {currentAdGroup && (
                                                                        <tr className="bg-slate-700/40 border-b-2 border-slate-600/50 italic font-medium">
                                                                            <td className="px-4 py-2 text-slate-300 text-xs">
                                                                                Ad Group: {currentAdGroup.name} (All)
                                                                            </td>
                                                                            <td className="px-4 py-2 text-right text-slate-300 text-xs">{fmtEuro(currentAdGroup.cost)}</td>
                                                                            <td className="px-4 py-2 text-right text-slate-300 text-xs">{fmtInt(currentAdGroup.clicks)}</td>
                                                                            <td className="px-4 py-2 text-right text-slate-300 text-xs">{fmtNum(currentAdGroup.conversions, 1)}</td>
                                                                            <td className="px-4 py-2 text-right text-slate-300 text-xs">{currentAdGroup.cpa != null ? fmtEuro(currentAdGroup.cpa) : '—'}</td>
                                                                            <td className="px-4 py-2 text-right">
                                                                                {currentAdGroup.searchImpressionShare != null ? (
                                                                                    <span className={`font-bold ${getISColor(currentAdGroup.searchImpressionShare)}`}>
                                                                                        {fmtPct(currentAdGroup.searchImpressionShare * 100)}
                                                                                    </span>
                                                                                ) : '—'}
                                                                            </td>
                                                                            <td className="px-4 py-2 text-right text-slate-400 text-xs">
                                                                                {currentAdGroup.searchLostISRank != null ? fmtPct(currentAdGroup.searchLostISRank * 100) : '—'}
                                                                            </td>
                                                                            <td className="px-4 py-2 text-center text-slate-300 font-bold">
                                                                                {fmtNum(currentAdGroup.avgQualityScore, 1)}
                                                                            </td>
                                                                            <td colSpan={3}></td>
                                                                        </tr>
                                                                    )}
                                                                    {keywords.map((kw) => (
                                                                        <tr key={kw.id} className="hover:bg-slate-700/30">
                                                                            <td className="px-4 py-3 text-white">
                                                                                <span className="text-xs text-slate-500 mr-1">[{kw.matchType}]</span>
                                                                                {kw.text}
                                                                            </td>
                                                                            <td className="px-4 py-3 text-right text-slate-300 text-sm">
                                                                                {kw.cost > 0 ? fmtEuro(kw.cost) : <span className="text-slate-600">—</span>}
                                                                            </td>
                                                                            <td className="px-4 py-3 text-right text-slate-300 text-sm">
                                                                                {kw.clicks > 0 ? fmtInt(kw.clicks) : <span className="text-slate-600">—</span>}
                                                                            </td>
                                                                            <td className="px-4 py-3 text-right text-slate-300 text-sm">
                                                                                {kw.conversions != null ? (kw.conversions === 0 ? '0' : fmtNum(kw.conversions, 1)) : <span className="text-slate-600">—</span>}
                                                                            </td>
                                                                            <td className="px-4 py-3 text-right text-slate-300 text-sm">
                                                                                {kw.conversions > 0 && kw.cost > 0 ? fmtEuro(kw.cost / kw.conversions) : <span className="text-slate-600">—</span>}
                                                                            </td>
                                                                            <td className="px-4 py-3 text-right">
                                                                                {kw.searchImpressionShare != null ? (
                                                                                    <span className={`font-medium ${getISColor(kw.searchImpressionShare)}`}>
                                                                                        {fmtPct(kw.searchImpressionShare * 100)}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-slate-500 text-xs">—</span>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-4 py-3 text-right">
                                                                                {kw.searchLostISRank != null ? (
                                                                                    <span className={`font-medium text-sm ${kw.searchLostISRank > 0.3 ? 'text-red-400' : 'text-slate-400'}`}>
                                                                                        {fmtPct(kw.searchLostISRank * 100)}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-slate-500 text-xs">—</span>
                                                                                )}
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
                                                                            <td colSpan={11} className="px-6 py-8 text-center text-slate-500">
                                                                                No keywords found.
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                ))}
                                                {/* end of DSA/Display keywords conditional */}

                                                {/* Ads with Strength — shown for Search/DSA campaigns (not upper-funnel/PMax/Shopping) */}
                                                {!(() => { const _c = campaigns.find(c => String(c.id) === String(navigation.campaignId)); const _ct = _c?.advertisingChannelType || ''; return _ct === 'DISPLAY' || _ct === 'VIDEO' || _ct === 'DEMAND_GEN' || _ct === 'DISCOVERY' || _ct === 'PERFORMANCE_MAX' || _ct === 'SHOPPING'; })() && (
                                                    <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden">
                                                        <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                                                            <h2 className="font-semibold text-white">Ads & Ad Strength</h2>
                                                            <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">{ads.length} ads</span>
                                                        </div>
                                                        <div className="p-4 space-y-4">
                                                            {ads.map((ad) => {
                                                                const AD_TYPE_LABEL: Record<string, string> = {
                                                                    RESPONSIVE_SEARCH_AD: 'Responsive Search Ad',
                                                                    RESPONSIVE_DISPLAY_AD: 'Responsive Display Ad',
                                                                    DEMAND_GEN_MULTI_ASSET_AD: 'Demand Gen Multi-Asset',
                                                                    DEMAND_GEN_CAROUSEL_AD: 'Demand Gen Carousel',
                                                                    DEMAND_GEN_VIDEO_RESPONSIVE_AD: 'Demand Gen Video',
                                                                    DISCOVERY_MULTI_ASSET_AD: 'Discovery Multi-Asset',
                                                                    DISCOVERY_CAROUSEL_AD: 'Discovery Carousel',
                                                                    SHOPPING_PRODUCT_AD: 'Shopping Product',
                                                                };
                                                                const typeLabel = AD_TYPE_LABEL[ad.type] || ad.type;
                                                                const isRDA = ad.type === 'RESPONSIVE_DISPLAY_AD';
                                                                const maxH = isRDA ? 5 : 15;
                                                                const maxD = isRDA ? 5 : 4;
                                                                const minH = isRDA ? 5 : 10;
                                                                const minD = isRDA ? 5 : 3;
                                                                const adImpr = ad.impressions ?? 0;
                                                                const adClicks = ad.clicks ?? 0;
                                                                const adCtr = ad.ctr ?? 0;
                                                                const adCost = ad.cost ?? 0;
                                                                const adConv = ad.conversions ?? 0;
                                                                const adRoas = ad.roas ?? null;
                                                                const adDescs = ad.descriptions ?? [];
                                                                const adUrl = ad.finalUrls?.[0] ?? '';
                                                                return (
                                                                    <div key={ad.id} className="bg-slate-700/30 rounded-lg p-4 border border-slate-700">
                                                                        {/* Header: status + strength + type */}
                                                                        <div className="flex flex-wrap items-center gap-2 mb-3">
                                                                            {ad.status && (
                                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ad.status === 'ENABLED' ? 'bg-emerald-900/50 text-emerald-400' : ad.status === 'PAUSED' ? 'bg-amber-900/50 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                                                                                    {ad.status}
                                                                                </span>
                                                                            )}
                                                                            {(ad.adStrength === 'POOR' || ad.adStrength === 'AVERAGE') ? (
                                                                                <Tooltip text={getAdStrengthTip(ad.adStrength, ad.headlinesCount, ad.descriptionsCount, ad.type)}>
                                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border-b border-dashed ${ad.adStrength === 'POOR' ? 'border-red-400/40' : 'border-amber-400/40'} ${getAdStrengthColor(ad.adStrength)}`}>
                                                                                        {ad.adStrength}
                                                                                    </span>
                                                                                </Tooltip>
                                                                            ) : (
                                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getAdStrengthColor(ad.adStrength)}`}>
                                                                                    {ad.adStrength}
                                                                                </span>
                                                                            )}
                                                                            <span className="text-xs text-slate-500">{typeLabel}</span>
                                                                            {/* Metrics row */}
                                                                            <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                                                                                <span>Impr: <strong className="text-slate-200">{fmtInt(adImpr)}</strong></span>
                                                                                <span>Clicks: <strong className="text-slate-200">{fmtInt(adClicks)}</strong></span>
                                                                                <span>CTR: <strong className="text-slate-200">{fmtPct(adCtr * 100, 2)}</strong></span>
                                                                                <span>Cost: <strong className="text-slate-200">{fmtEuro(adCost)}</strong></span>
                                                                                <span>Conv: <strong className="text-slate-200">{adConv === 0 ? '0' : fmtNum(adConv, 1)}</strong></span>
                                                                                <span>ROAS: <strong className={adRoas ? 'text-emerald-400' : 'text-slate-400'}>{fmtX(adRoas)}</strong></span>
                                                                            </div>
                                                                        </div>
                                                                        {/* Headlines */}
                                                                        <div className="mb-2">
                                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Headlines</span>
                                                                                {ad.headlinesCount < minH ? (
                                                                                    <Tooltip text={`Add more headlines (currently ${ad.headlinesCount}/${maxH}). Aim for at least ${minH} unique headlines with diverse messaging and keywords.`}>
                                                                                        <span className="text-xs text-amber-400 border-b border-dashed border-amber-400/40">{ad.headlinesCount}/{maxH}</span>
                                                                                    </Tooltip>
                                                                                ) : (
                                                                                    <span className="text-xs text-slate-500">{ad.headlinesCount}/{maxH}</span>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex flex-wrap gap-1.5">
                                                                                {ad.headlines.map((h, i) => (
                                                                                    <span key={i} className="text-xs bg-slate-600/50 text-slate-300 px-2 py-1 rounded">{h}</span>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                        {/* Descriptions */}
                                                                        {adDescs.length > 0 && (
                                                                            <div className="mb-2">
                                                                                <div className="flex items-center gap-2 mb-1.5">
                                                                                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Descriptions</span>
                                                                                    {ad.descriptionsCount < minD ? (
                                                                                        <Tooltip text={`Add more descriptions (currently ${ad.descriptionsCount}/${maxD}). Each description should highlight a unique benefit or call-to-action.`}>
                                                                                            <span className="text-xs text-amber-400 border-b border-dashed border-amber-400/40">{ad.descriptionsCount}/{maxD}</span>
                                                                                        </Tooltip>
                                                                                    ) : (
                                                                                        <span className="text-xs text-slate-500">{ad.descriptionsCount}/{maxD}</span>
                                                                                    )}
                                                                                </div>
                                                                                <div className="space-y-1">
                                                                                    {adDescs.map((d, i) => (
                                                                                        <div key={i} className="text-xs bg-slate-600/30 text-slate-300 px-3 py-2 rounded border-l-2 border-slate-600">{d}</div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        {/* Final URL */}
                                                                        {adUrl && (
                                                                            <div className="text-xs text-slate-500 mt-2">
                                                                                URL: <span className="text-slate-400">{adUrl.length > 90 ? adUrl.slice(0, 90) + '…' : adUrl}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                            {ads.length === 0 && (
                                                                <p className="text-slate-500 text-sm text-center py-6">No ads found for this ad group.</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                                {/* /Ads with Strength */}

                                                {/* Negative Keywords — hidden for Display/Video/DG */}
                                                {!(() => { const _c = campaigns.find(c => String(c.id) === String(navigation.campaignId)); const _ct = _c?.advertisingChannelType || ''; return _ct === 'DISPLAY' || _ct === 'VIDEO' || _ct === 'DEMAND_GEN' || _ct === 'DISCOVERY'; })() && (
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
                                                )}

                                                {/* Search Terms for Ad Group — hidden for Display/Video/DG */}
                                                {!(() => { const _c = campaigns.find(c => String(c.id) === String(navigation.campaignId)); const _ct = _c?.advertisingChannelType || ''; return _ct === 'DISPLAY' || _ct === 'VIDEO' || _ct === 'DEMAND_GEN' || _ct === 'DISCOVERY'; })() && (
                                                    <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden mt-6">
                                                        <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                                                            <h2 className="font-semibold text-white">Search Terms</h2>
                                                            <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">
                                                                {searchTerms.filter(st =>
                                                                    String(st.adGroupId) === String(navigation.adGroupId) ||
                                                                    (String(st.campaignId) === String(navigation.campaignId) && st.searchTerm?.includes('[PMax Insight]'))
                                                                ).length} terms
                                                            </span>
                                                        </div>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-sm text-left text-slate-300">
                                                                <thead className="bg-slate-900/50 text-slate-400 uppercase text-xs">
                                                                    <tr>
                                                                        <th className="px-6 py-3 font-medium cursor-pointer user-select-none hover:text-white" onClick={() => handleSearchTermSort('searchTerm')}>
                                                                            <div className="flex items-center gap-1">
                                                                                Search Term
                                                                                {searchTermSortBy === 'searchTerm' && (
                                                                                    <span className="text-emerald-400">{searchTermSortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                                )}
                                                                            </div>
                                                                        </th>
                                                                        <th className="px-4 py-3 text-right font-medium cursor-pointer user-select-none hover:text-white" onClick={() => handleSearchTermSort('clicks')}>
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                Clicks
                                                                                {searchTermSortBy === 'clicks' && (
                                                                                    <span className="text-emerald-400">{searchTermSortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                                )}
                                                                            </div>
                                                                        </th>
                                                                        <th className="px-4 py-3 text-right font-medium cursor-pointer user-select-none hover:text-white" onClick={() => handleSearchTermSort('impressions')}>
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                Impr.
                                                                                {searchTermSortBy === 'impressions' && (
                                                                                    <span className="text-emerald-400">{searchTermSortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                                )}
                                                                            </div>
                                                                        </th>
                                                                        <th className="px-4 py-3 text-right font-medium cursor-pointer user-select-none hover:text-white" onClick={() => handleSearchTermSort('ctr')}>
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                CTR
                                                                                {searchTermSortBy === 'ctr' && (
                                                                                    <span className="text-emerald-400">{searchTermSortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                                )}
                                                                            </div>
                                                                        </th>
                                                                        <th className="px-4 py-3 text-right font-medium cursor-pointer user-select-none hover:text-white" onClick={() => handleSearchTermSort('cost')}>
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                Cost
                                                                                {searchTermSortBy === 'cost' && (
                                                                                    <span className="text-emerald-400">{searchTermSortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                                )}
                                                                            </div>
                                                                        </th>
                                                                        <th className="px-4 py-3 text-right font-medium cursor-pointer user-select-none hover:text-white" onClick={() => handleSearchTermSort('conversions')}>
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                Conv.
                                                                                {searchTermSortBy === 'conversions' && (
                                                                                    <span className="text-emerald-400">{searchTermSortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                                )}
                                                                            </div>
                                                                        </th>
                                                                        <th className="px-4 py-3 text-right font-medium cursor-pointer user-select-none hover:text-white" onClick={() => handleSearchTermSort('cpa')}>
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                CPA
                                                                                {searchTermSortBy === 'cpa' && (
                                                                                    <span className="text-emerald-400">{searchTermSortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                                )}
                                                                            </div>
                                                                        </th>
                                                                        <th className="px-4 py-3 text-right font-medium cursor-pointer user-select-none hover:text-white" onClick={() => handleSearchTermSort('roas')}>
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                ROAS
                                                                                {searchTermSortBy === 'roas' && (
                                                                                    <span className="text-emerald-400">{searchTermSortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                                )}
                                                                            </div>
                                                                        </th>
                                                                        <th className="px-4 py-3 text-right font-medium cursor-pointer user-select-none hover:text-white" onClick={() => handleSearchTermSort('conversionRate')}>
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                CVR
                                                                                {searchTermSortBy === 'conversionRate' && (
                                                                                    <span className="text-emerald-400">{searchTermSortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                                )}
                                                                            </div>
                                                                        </th>
                                                                        <th className="px-4 py-3 text-right font-medium cursor-pointer user-select-none hover:text-white" onClick={() => handleSearchTermSort('conversionValue')}>
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                Conv. Value
                                                                                {searchTermSortBy === 'conversionValue' && (
                                                                                    <span className="text-emerald-400">{searchTermSortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                                )}
                                                                            </div>
                                                                        </th>
                                                                        <th className="px-4 py-3 text-right font-medium cursor-pointer user-select-none hover:text-white" onClick={() => handleSearchTermSort('averageCpc')}>
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                Avg. CPC
                                                                                {searchTermSortBy === 'averageCpc' && (
                                                                                    <span className="text-emerald-400">{searchTermSortDirection === 'asc' ? '↑' : '↓'}</span>
                                                                                )}
                                                                            </div>
                                                                        </th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-700">
                                                                    {searchTerms
                                                                        .filter(st =>
                                                                            String(st.adGroupId) === String(navigation.adGroupId) ||
                                                                            (String(st.campaignId) === String(navigation.campaignId) && st.searchTerm?.includes('[PMax Insight]'))
                                                                        )
                                                                        .sort((a, b) => {
                                                                            let valA: number | string = 0;
                                                                            let valB: number | string = 0;

                                                                            // Handle calculated fields
                                                                            if (searchTermSortBy === 'cpa') {
                                                                                // For CPA, 0 conversions means infinite cost per conversion. 
                                                                                // We usually want low CPA at the top for ASC, but high CPA (bad) for DESC?
                                                                                // Let's standardise: 0 conversions = Infinity
                                                                                valA = a.conversions > 0 ? a.cost / a.conversions : Infinity;
                                                                                valB = b.conversions > 0 ? b.cost / b.conversions : Infinity;
                                                                            } else if (searchTermSortBy === 'roas') {
                                                                                valA = a.cost > 0 ? a.conversionValue / a.cost : 0;
                                                                                valB = b.cost > 0 ? b.conversionValue / b.cost : 0;
                                                                            } else if (searchTermSortBy === 'searchTerm') {
                                                                                valA = (a.searchTerm || '').toLowerCase();
                                                                                valB = (b.searchTerm || '').toLowerCase();
                                                                            } else {
                                                                                // Direct property access
                                                                                valA = (a as any)[searchTermSortBy];
                                                                                valB = (b as any)[searchTermSortBy];
                                                                            }

                                                                            // Sort logic
                                                                            if (typeof valA === 'string' && typeof valB === 'string') {
                                                                                return searchTermSortDirection === 'asc'
                                                                                    ? valA.localeCompare(valB)
                                                                                    : valB.localeCompare(valA);
                                                                            }

                                                                            const numA = Number(valA) || 0;
                                                                            const numB = Number(valB) || 0;

                                                                            // Handle Infinity for CPA
                                                                            if (numA === Infinity && numB === Infinity) return 0;
                                                                            if (numA === Infinity) return searchTermSortDirection === 'asc' ? 1 : -1;
                                                                            if (numB === Infinity) return searchTermSortDirection === 'asc' ? -1 : 1;

                                                                            return searchTermSortDirection === 'asc' ? numA - numB : numB - numA;
                                                                        })
                                                                        .slice(0, 50) // Show top 50 by spend
                                                                        .map((term, idx) => (
                                                                            <tr key={idx} className="hover:bg-slate-700/50 transition-colors">
                                                                                <td className="px-6 py-3">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="font-medium text-white max-w-md truncate" title={term.searchTerm}>
                                                                                            {term.searchTerm}
                                                                                        </span>
                                                                                        {term.matchType && term.matchType !== 'BROAD' && (
                                                                                            <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${term.matchType === 'EXACT' ? 'bg-blue-500/20 text-blue-400' : term.matchType === 'PHRASE' ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-600 text-slate-400'}`}>
                                                                                                {term.matchType}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    {(() => {
                                                                                        const s = SEARCH_TERM_STATUS_MAP[String(term.searchTermStatus)] ||
                                                                                            { label: String(term.searchTermStatus) || '—', color: 'text-slate-500 bg-slate-700' };
                                                                                        return s.label !== 'NONE' && s.label !== '—' ? (
                                                                                            <span className={`inline-flex mt-1 px-1.5 py-0.5 rounded text-xs font-medium ${s.color}`}>
                                                                                                {s.label}
                                                                                            </span>
                                                                                        ) : null;
                                                                                    })()}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right">{fmtInt(term.clicks)}</td>
                                                                                <td className="px-4 py-3 text-right">{fmtInt(term.impressions)}</td>
                                                                                <td className="px-4 py-3 text-right">
                                                                                    <span className={term.ctr >= 0.05 ? 'text-emerald-400' : ''}>
                                                                                        {fmtPct(term.ctr * 100, 2)}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right">{fmtEuro(term.cost)}</td>
                                                                                <td className="px-4 py-3 text-right">
                                                                                    {term.conversions > 0 ? (
                                                                                        <span className="text-white font-medium">{fmtNum(term.conversions, 1)}</span>
                                                                                    ) : (
                                                                                        <span className="text-slate-600">0</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right">
                                                                                    {term.conversions > 0 ? (
                                                                                        fmtEuro(term.cost / term.conversions)
                                                                                    ) : (
                                                                                        <span className="text-slate-600">—</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right">
                                                                                    {term.cost > 0 ? (
                                                                                        <span className={`font-medium ${term.conversionValue / term.cost >= 4 ? 'text-emerald-400' : term.conversionValue / term.cost < 1 ? 'text-red-400' : 'text-amber-400'}`}>
                                                                                            {fmtX(term.conversionValue / term.cost)}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-slate-600">—</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right text-slate-400 text-xs">
                                                                                    {term.clicks > 0 ? fmtPct((term.conversionRate || (term.conversions / term.clicks)) * 100, 2) : '—'}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right">
                                                                                    {term.conversionValue > 0 ? (
                                                                                        <span className="text-emerald-400 text-xs">{fmtEuro(term.conversionValue)}</span>
                                                                                    ) : <span className="text-slate-600">—</span>}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right text-slate-300 text-xs">
                                                                                    {term.averageCpc > 0 ? fmtEuro(term.averageCpc) : '—'}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    {searchTerms.filter(st =>
                                                                        String(st.adGroupId) === String(navigation.adGroupId) ||
                                                                        (String(st.campaignId) === String(navigation.campaignId) && st.searchTerm?.includes('[PMax Insight]'))
                                                                    ).length === 0 && (
                                                                            <tr>
                                                                                <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                                                                                    No search terms found for this ad group.
                                                                                </td>
                                                                            </tr>
                                                                        )}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* PMax Listing Groups — Product Coverage */}
                                        {pmaxListingGroups.length > 0 && (
                                            <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden mb-6">
                                                <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                                                    <div>
                                                        <h2 className="font-semibold text-white">Product Coverage</h2>
                                                        <p className="text-xs text-slate-400 mt-0.5">Listing group breakdown for this asset group</p>
                                                    </div>
                                                    <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded flex-shrink-0">
                                                        {pmaxListingGroups.length} groups
                                                    </span>
                                                </div>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left text-sm">
                                                        <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                                                            <tr>
                                                                <th className="px-4 py-3 font-medium">Dimension</th>
                                                                <th className="px-4 py-3 font-medium">Value</th>
                                                                <th className="px-4 py-3 text-center font-medium">Type</th>
                                                                <th className="px-4 py-3 text-right font-medium">Impr.</th>
                                                                <th className="px-4 py-3 text-right font-medium">Clicks</th>
                                                                <th className="px-4 py-3 text-right font-medium">Cost</th>
                                                                <th className="px-4 py-3 text-right font-medium">Conv.Value</th>
                                                                <th className="px-4 py-3 text-right font-medium">ROAS</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-700">
                                                            {pmaxListingGroups.map((lg: any) => (
                                                                <tr key={lg.id} className="hover:bg-slate-700/30">
                                                                    <td className="px-4 py-3 text-slate-300 text-xs capitalize">
                                                                        {lg.dimension || '—'}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-white text-sm">
                                                                        {lg.value || <span className="text-slate-500 italic">All products</span>}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${lg.type === 'SUBDIVISION' ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-600/50 text-slate-300'}`}>
                                                                            {lg.type === 'SUBDIVISION' ? 'Group' : 'Unit'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right text-slate-300 text-xs">
                                                                        {lg.impressions > 0 ? fmtInt(lg.impressions) : '—'}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right text-slate-300 text-xs">
                                                                        {lg.clicks > 0 ? fmtInt(lg.clicks) : '—'}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right text-slate-300 text-xs">
                                                                        {lg.cost > 0 ? fmtEuro(lg.cost) : '—'}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right text-sm">
                                                                        {lg.conversionValue > 0 ? (
                                                                            <span className="text-emerald-400">{fmtEuro(lg.conversionValue)}</span>
                                                                        ) : '—'}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right text-sm">
                                                                        {lg.roas != null ? (
                                                                            <span className={lg.roas >= 2 ? 'text-emerald-400 font-semibold' : lg.roas >= 1 ? 'text-amber-400' : 'text-red-400'}>
                                                                                {fmtX(lg.roas)}
                                                                            </span>
                                                                        ) : '—'}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                        {/* end PMax Listing Groups */}

                                    </>
                                )}
                            </div>

                        </div>

                    </main>
                )
                }
                <BackgroundReportIndicator
                    onNavigateToReports={() => setNavigation({ level: 'account', view: 'reports' })}
                    currentView={navigation.view || 'dashboard'}
                />
            </div >
        </div >
    );
}
