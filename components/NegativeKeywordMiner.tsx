"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

interface SearchTermRow {
    searchTerm: string;
    campaignId: string;
    campaignName: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
}

interface NegativeKeywordMinerProps {
    customerId: string;
    dateRange: { start: string; end: string };
}

interface WastefulTerm {
    searchTerm: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    cpc: number;
    ctr: number;
    campaigns: string[];
    campaignIds: string[];
    monthlyCost: number;
    confidence: 'high' | 'medium' | 'low';
}

type ScopeFilter = 'all' | 'account' | 'campaign';
type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low';
type SortKey = 'cost' | 'clicks' | 'impressions' | 'monthlyCost' | 'cpc' | 'ctr' | 'conversions' | 'conversionValue';

const BRAND_TERMS = ['videnov', 'vellea', 'videhov', 'виденов'];

export default function NegativeKeywordMiner({ customerId, dateRange }: NegativeKeywordMinerProps) {
    const [rawData, setRawData] = useState<SearchTermRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [sortBy, setSortBy] = useState<SortKey>('cost');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [minCost, setMinCost] = useState(1);
    const [minClicks, setMinClicks] = useState(3);
    const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
    const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
    const [copied, setCopied] = useState(false);
    const [showTop, setShowTop] = useState(100);
    const [showConverting, setShowConverting] = useState(false);

    const periodDays = useMemo(() => {
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    }, [dateRange.start, dateRange.end]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setRawData([]); // Clear previous data immediately
            setError(null);
            try {
                const params = new URLSearchParams({
                    customerId,
                    startDate: dateRange.start,
                    endDate: dateRange.end,
                    aggregate: 'true'  // No date/device segmentation = more terms coverage
                });
                const res = await fetch(`/api/google-ads/search-terms?${params}`);
                const json = await res.json();
                if (json.error) {
                    setError(json.error);
                } else {
                    setRawData(json.searchTerms || []);
                    setSelected(new Set());
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load search terms');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [customerId, dateRange.start, dateRange.end]);

    // Compute average CPA and CTR from all terms for confidence scoring
    const { avgCPA, avgCTR } = useMemo(() => {
        const byTerm: Record<string, { cost: number; conversions: number; clicks: number; impressions: number }> = {};
        rawData.forEach(item => {
            const rawTerm = item.searchTerm.includes('[PMax Insight]')
                ? item.searchTerm.replace('[PMax Insight] ', '')
                : item.searchTerm;
            const key = rawTerm.toLowerCase().trim();
            if (!byTerm[key]) byTerm[key] = { cost: 0, conversions: 0, clicks: 0, impressions: 0 };
            byTerm[key].cost += item.cost;
            byTerm[key].conversions += item.conversions;
            byTerm[key].clicks += item.clicks;
            byTerm[key].impressions += item.impressions;
        });
        const all = Object.values(byTerm);
        const converting = all.filter(t => t.conversions > 0);
        const totalCost = converting.reduce((s, t) => s + t.cost, 0);
        const totalConv = converting.reduce((s, t) => s + t.conversions, 0);
        const cpa = totalConv > 0 ? totalCost / totalConv : 50;

        const totalClicks = all.reduce((s, t) => s + t.clicks, 0);
        const totalImpressions = all.reduce((s, t) => s + t.impressions, 0);
        const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

        return { avgCPA: cpa, avgCTR: ctr };
    }, [rawData]);

    // Aggregate and score search terms
    const wastefulTerms = useMemo((): WastefulTerm[] => {
        const byTerm: Record<string, {
            searchTerm: string;
            impressions: number;
            clicks: number;
            cost: number;
            conversions: number;
            conversionValue: number;
            campaigns: Set<string>;
            campaignIds: Set<string>;
        }> = {};

        rawData.forEach(item => {
            const rawTerm = item.searchTerm.includes('[PMax Insight]')
                ? item.searchTerm.replace('[PMax Insight] ', '')
                : item.searchTerm;
            const key = rawTerm.toLowerCase().trim();
            if (!byTerm[key]) {
                byTerm[key] = {
                    searchTerm: rawTerm,
                    impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0,
                    campaigns: new Set(),
                    campaignIds: new Set()
                };
            }
            byTerm[key].impressions += item.impressions;
            byTerm[key].clicks += item.clicks;
            byTerm[key].cost += item.cost;
            byTerm[key].conversions += item.conversions;
            byTerm[key].conversionValue += item.conversionValue;
            if (item.campaignName) byTerm[key].campaigns.add(item.campaignName);
            if (item.campaignId) byTerm[key].campaignIds.add(item.campaignId);
        });

        return Object.values(byTerm)
            .filter(t => {
                // exclude brand terms for safety
                if (BRAND_TERMS.some(brand => t.searchTerm.includes(brand))) return false;
                if (t.cost < minCost || t.clicks < minClicks) return false;
                // In default mode show only 0-conversion terms; toggle shows all
                if (!showConverting && t.conversions > 0) return false;
                return true;
            })
            .map(t => {
                const cpc = t.clicks > 0 ? t.cost / t.clicks : 0;
                const ctr = t.impressions > 0 ? t.clicks / t.impressions : 0;
                const monthlyCost = periodDays > 0 ? (t.cost / periodDays) * 30 : 0;

                // Smarter confidence scoring:
                // - High CTR (above avg) suggests the term IS relevant but just didn't convert in this period
                // - Short periods (< 14 days) with high CTR should downgrade confidence
                // - Very high clicks + low CPC = likely a broad/relevant term
                const isHighCTR = ctr > avgCTR * 1.2; // CTR 20% above average = relevant term
                const isShortPeriod = periodDays < 14;
                const isHighVolume = t.clicks >= 20;

                let confidence: 'high' | 'medium' | 'low';
                // Terms with conversions are shown for context only — always mark as low
                if (t.conversions > 0) {
                    confidence = 'low';
                } else if (isHighCTR && isShortPeriod) {
                    // High CTR in short period = likely relevant, just needs more data
                    confidence = 'low';
                } else if (isHighCTR && isHighVolume) {
                    // High CTR + high volume = popular relevant term, not wasteful
                    confidence = 'low';
                } else if (t.cost >= avgCPA * 2) {
                    // Spent 2x CPA with 0 conversions = more likely wasteful
                    confidence = 'high';
                } else if (t.cost >= avgCPA) {
                    confidence = isHighCTR ? 'low' : 'medium';
                } else if (t.clicks >= 5) {
                    confidence = 'medium';
                } else {
                    confidence = 'low';
                }

                return {
                    searchTerm: t.searchTerm,
                    impressions: t.impressions,
                    clicks: t.clicks,
                    cost: t.cost,
                    conversions: t.conversions,
                    conversionValue: t.conversionValue,
                    cpc,
                    ctr,
                    campaigns: Array.from(t.campaigns),
                    campaignIds: Array.from(t.campaignIds),
                    monthlyCost,
                    confidence,
                };
            });
    }, [rawData, minCost, minClicks, periodDays, avgCPA, avgCTR, showConverting]);

    const accountLevel = useMemo(() => wastefulTerms.filter(t => t.campaigns.length >= 2), [wastefulTerms]);
    const campaignLevel = useMemo(() => wastefulTerms.filter(t => t.campaigns.length === 1), [wastefulTerms]);

    const highConfCount = useMemo(() => wastefulTerms.filter(t => t.confidence === 'high').length, [wastefulTerms]);
    const medConfCount = useMemo(() => wastefulTerms.filter(t => t.confidence === 'medium').length, [wastefulTerms]);
    const lowConfCount = useMemo(() => wastefulTerms.filter(t => t.confidence === 'low').length, [wastefulTerms]);

    const displayData = useMemo(() => {
        let data = scopeFilter === 'account' ? accountLevel
            : scopeFilter === 'campaign' ? campaignLevel
                : wastefulTerms;

        if (confidenceFilter !== 'all') {
            data = data.filter(t => t.confidence === confidenceFilter);
        }

        const sorted = [...data];
        sorted.sort((a, b) => {
            const aVal = a[sortBy];
            const bVal = b[sortBy];
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });

        return sorted.slice(0, showTop);
    }, [wastefulTerms, accountLevel, campaignLevel, scopeFilter, confidenceFilter, sortBy, sortDir, showTop]);

    const totalWastedCost = wastefulTerms.reduce((sum, t) => sum + t.cost, 0);
    const totalMonthlyWaste = wastefulTerms.reduce((sum, t) => sum + t.monthlyCost, 0);
    const selectedTerms = wastefulTerms.filter(t => selected.has(t.searchTerm.toLowerCase().trim()));
    const selectedCost = selectedTerms.reduce((sum, t) => sum + t.cost, 0);
    const selectedMonthlySavings = selectedTerms.reduce((sum, t) => sum + t.monthlyCost, 0);

    const toggleSelect = useCallback((term: string) => {
        const key = term.toLowerCase().trim();
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelected(new Set(displayData.map(t => t.searchTerm.toLowerCase().trim())));
    }, [displayData]);

    const deselectAll = useCallback(() => {
        setSelected(new Set());
    }, []);

    const handleSort = (key: SortKey) => {
        if (sortBy === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            setSortDir('desc');
        }
    };

    const copyToClipboard = useCallback(() => {
        const terms = selectedTerms.map(t => t.searchTerm).join('\n');
        navigator.clipboard.writeText(terms).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [selectedTerms]);

    const exportCSV = useCallback(() => {
        const header = 'Search Term,Impressions,Clicks,CTR,Cost,CPC,Conversions,Revenue,Monthly Cost Est.,Confidence,Campaigns,Scope';
        const rows = selectedTerms.map(t =>
            `"${t.searchTerm.replace(/"/g, '""')}",${t.impressions},${t.clicks},${(t.ctr * 100).toFixed(1)}%,${t.cost.toFixed(2)},${t.cpc.toFixed(2)},${t.conversions},${t.conversionValue.toFixed(2)},${t.monthlyCost.toFixed(2)},${t.confidence},"${t.campaigns.join('; ')}",${t.campaigns.length >= 2 ? 'Account' : 'Campaign'}`
        );
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `negative-keywords-${dateRange.start}-to-${dateRange.end}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }, [selectedTerms, dateRange]);

    const CONFIDENCE_STYLES = {
        high: { badge: 'bg-red-500/20 text-red-400', dot: 'bg-red-400', label: 'High' },
        medium: { badge: 'bg-amber-500/20 text-amber-400', dot: 'bg-amber-400', label: 'Medium' },
        low: { badge: 'bg-slate-500/20 text-slate-400', dot: 'bg-slate-400', label: 'Low' },
    };

    if (loading) {
        return (
            <div className="rounded-xl bg-slate-800 border border-slate-700 p-12 flex flex-col items-center justify-center">
                <div className="relative w-12 h-12 mb-4">
                    <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-red-500 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p className="text-slate-400 text-sm">Analyzing search terms for negative keyword candidates...</p>
                <p className="text-slate-500 text-xs mt-1">Period: {periodDays} days</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-xl bg-slate-800 border border-red-900/30 p-6">
                <p className="text-red-400 text-sm">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-lg p-3 bg-red-500/10 border border-red-500/20">
                    <div className="text-xs text-red-400 font-medium">Wasted Spend ({periodDays}d)</div>
                    <div className="text-xl font-bold text-white mt-1">
                        &euro;{totalWastedCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-xs text-red-400/60 mt-0.5">
                        {wastefulTerms.filter(t => t.conversions === 0).length} terms ({minClicks}+ clicks, 0 conv.)
                        {showConverting && ` + ${wastefulTerms.filter(t => t.conversions > 0).length} converting`}
                    </div>
                </div>
                <div className="rounded-lg p-3 bg-amber-500/10 border border-amber-500/20">
                    <div className="text-xs text-amber-400 font-medium">Est. Monthly Waste</div>
                    <div className="text-xl font-bold text-white mt-1">
                        &euro;{totalMonthlyWaste.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo
                    </div>
                    <div className="text-xs text-amber-400/60 mt-0.5">
                        Avg CPA: &euro;{avgCPA.toFixed(1)}
                    </div>
                </div>
                <div className="rounded-lg p-3 bg-red-500/10 border border-red-500/20 cursor-pointer hover:border-red-400/40 transition-colors"
                    onClick={() => setConfidenceFilter(confidenceFilter === 'high' ? 'all' : 'high')}>
                    <div className="text-xs text-red-400 font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-400"></span>
                        High Confidence
                    </div>
                    <div className="text-xl font-bold text-white mt-1">{highConfCount}</div>
                    <div className="text-xs text-red-400/60 mt-0.5">
                        Cost &ge; 2x CPA, low CTR
                    </div>
                </div>
                <div className="rounded-lg p-3 bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:border-amber-400/40 transition-colors"
                    onClick={() => setConfidenceFilter(confidenceFilter === 'medium' ? 'all' : 'medium')}>
                    <div className="text-xs text-amber-400 font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                        Medium Confidence
                    </div>
                    <div className="text-xl font-bold text-white mt-1">{medConfCount}</div>
                    <div className="text-xs text-amber-400/60 mt-0.5">
                        5+ clicks, normal CTR
                    </div>
                </div>
                <div className="rounded-lg p-3 bg-slate-700/30 border border-slate-600 cursor-pointer hover:border-slate-500 transition-colors"
                    onClick={() => setConfidenceFilter(confidenceFilter === 'low' ? 'all' : 'low')}>
                    <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                        Low / Review
                    </div>
                    <div className="text-xl font-bold text-white mt-1">{lowConfCount}</div>
                    <div className="text-xs text-slate-400/60 mt-0.5">
                        High CTR / short period / few clicks
                    </div>
                </div>
            </div>

            {/* Short Period Warning */}
            {periodDays < 14 && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-400 flex items-start gap-2">
                    <span className="text-lg leading-none mt-[-2px]">&#9888;</span>
                    <div>
                        <span className="font-bold">Short analysis period ({periodDays} days).</span>{' '}
                        Core business terms may show 0 conversions simply because the period is too short.
                        Use <b>30+ days</b> for accurate negative keyword identification. Terms with high CTR are automatically downgraded in confidence.
                    </div>
                </div>
            )}

            {/* Info Banner */}
            <div className="rounded-lg bg-slate-800 border border-slate-700 p-3 text-xs text-slate-400">
                <span className="text-slate-300 font-medium">How confidence works:</span>{' '}
                <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"></span> High</span> = spent 2x+ CPA (&euro;{(avgCPA * 2).toFixed(0)}+) with 0 conversions and below-average CTR.{' '}
                <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span> Medium</span> = spent 1x CPA or 5+ clicks with normal CTR.{' '}
                <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"></span> Low / Review</span> = few clicks, high CTR (likely relevant), or short period — review before adding.
                <br className="mt-1" />
                <span className="text-emerald-400 font-medium">Safety:</span> Brand terms ({BRAND_TERMS.join(', ')}) are automatically excluded.
            </div>

            {/* Selection Actions Bar */}
            {selected.size > 0 && (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-4">
                        <span className="text-emerald-400 text-sm font-medium">
                            {selected.size} terms selected
                        </span>
                        <span className="text-slate-400 text-xs">
                            Savings: <span className="text-emerald-400 font-bold">&euro;{selectedMonthlySavings.toFixed(0)}/mo</span>
                            {' '}(&euro;{selectedCost.toFixed(0)} in period)
                        </span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={copyToClipboard}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 text-white hover:bg-slate-600 transition-colors"
                        >
                            {copied ? 'Copied!' : 'Copy List'}
                        </button>
                        <button
                            onClick={exportCSV}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                        >
                            Export CSV
                        </button>
                    </div>
                </div>
            )}

            {/* Controls + Table */}
            <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Scope Filter */}
                        <div className="flex bg-slate-700/50 rounded-lg p-0.5">
                            {([['all', 'All'], ['account', 'Account-Level'], ['campaign', 'Campaign-Level']] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    onClick={() => setScopeFilter(value)}
                                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${scopeFilter === value
                                        ? 'bg-violet-600 text-white'
                                        : 'text-slate-400 hover:text-white'
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {/* Confidence Filter */}
                        {confidenceFilter !== 'all' && (
                            <button
                                onClick={() => setConfidenceFilter('all')}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${CONFIDENCE_STYLES[confidenceFilter].badge} border border-current/20`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${CONFIDENCE_STYLES[confidenceFilter].dot}`}></span>
                                {CONFIDENCE_STYLES[confidenceFilter].label} only
                                <span className="ml-1 opacity-60">&times;</span>
                            </button>
                        )}

                        {/* Min Cost */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500">Min cost:</span>
                            <select
                                value={minCost}
                                onChange={(e) => setMinCost(Number(e.target.value))}
                                className="bg-slate-700 border border-slate-600 text-slate-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-violet-500"
                            >
                                <option value={0.5}>&euro;0.50</option>
                                <option value={1}>&euro;1</option>
                                <option value={2}>&euro;2</option>
                                <option value={5}>&euro;5</option>
                                <option value={10}>&euro;10</option>
                                <option value={20}>&euro;20</option>
                            </select>
                        </div>

                        {/* Min Clicks */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500">Min clicks:</span>
                            <select
                                value={minClicks}
                                onChange={(e) => setMinClicks(Number(e.target.value))}
                                className="bg-slate-700 border border-slate-600 text-slate-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-violet-500"
                            >
                                <option value={1}>1+</option>
                                <option value={2}>2+</option>
                                <option value={3}>3+</option>
                                <option value={5}>5+</option>
                                <option value={10}>10+</option>
                            </select>
                        </div>

                        {/* Show Converting Toggle */}
                        <button
                            onClick={() => setShowConverting(!showConverting)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-colors border ${showConverting
                                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400'
                                : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:text-white'
                                }`}
                        >
                            {showConverting ? 'All Terms' : '0 Conv. Only'}
                        </button>

                        {/* Show Top */}
                        <select
                            value={showTop}
                            onChange={(e) => setShowTop(Number(e.target.value))}
                            className="bg-slate-700 border border-slate-600 text-slate-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-violet-500"
                        >
                            <option value={50}>Top 50</option>
                            <option value={100}>Top 100</option>
                            <option value={200}>Top 200</option>
                            <option value={500}>All</option>
                        </select>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={selectAll}
                            className="px-2 py-1 rounded text-xs text-slate-400 hover:text-white transition-colors"
                        >
                            Select all visible
                        </button>
                        {selected.size > 0 && (
                            <button
                                onClick={deselectAll}
                                className="px-2 py-1 rounded text-xs text-slate-400 hover:text-white transition-colors"
                            >
                                Clear selection
                            </button>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                            <tr>
                                <th className="px-3 py-3 w-8">
                                    <input
                                        type="checkbox"
                                        checked={selected.size > 0 && displayData.every(t => selected.has(t.searchTerm.toLowerCase().trim()))}
                                        onChange={(e) => e.target.checked ? selectAll() : deselectAll()}
                                        className="rounded border-slate-500 bg-slate-700 text-violet-500 focus:ring-violet-500 cursor-pointer"
                                    />
                                </th>
                                <th className="px-3 py-3 font-medium">Search Term</th>
                                <th className="px-3 py-3 font-medium">Confidence</th>
                                <th className="px-3 py-3 font-medium">Scope</th>
                                <th className="px-3 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('impressions')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Impr. {sortBy === 'impressions' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-3 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('clicks')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Clicks {sortBy === 'clicks' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-3 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('ctr')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        CTR {sortBy === 'ctr' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-3 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('cost')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Cost {sortBy === 'cost' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-3 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('cpc')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        CPC {sortBy === 'cpc' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-3 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('conversions')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Conv. {sortBy === 'conversions' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-3 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('conversionValue')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Revenue {sortBy === 'conversionValue' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-3 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('monthlyCost')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Est./Mo {sortBy === 'monthlyCost' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-3 py-3 font-medium">Campaigns</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {displayData.map((item, idx) => {
                                const key = item.searchTerm.toLowerCase().trim();
                                const isSelected = selected.has(key);
                                const isAccountScope = item.campaigns.length >= 2;
                                const confStyle = CONFIDENCE_STYLES[item.confidence];
                                const hasConv = item.conversions > 0;
                                return (
                                    <tr
                                        key={idx}
                                        onClick={() => toggleSelect(item.searchTerm)}
                                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-violet-500/10' : hasConv ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : 'hover:bg-slate-700/30'}`}
                                    >
                                        <td className="px-3 py-2.5">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSelect(item.searchTerm)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="rounded border-slate-500 bg-slate-700 text-violet-500 focus:ring-violet-500 cursor-pointer"
                                            />
                                        </td>
                                        <td className="px-3 py-2.5 text-white font-medium max-w-[280px]">
                                            <span className="truncate block" title={item.searchTerm}>{item.searchTerm}</span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${confStyle.badge}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${confStyle.dot}`}></span>
                                                {confStyle.label}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${isAccountScope
                                                ? 'bg-violet-500/20 text-violet-400'
                                                : 'bg-blue-500/20 text-blue-400'
                                                }`}>
                                                {isAccountScope ? 'Account' : 'Campaign'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-slate-400 text-xs">
                                            {item.impressions.toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-slate-300">
                                            {item.clicks.toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
                                            <span className={`text-xs font-medium ${item.ctr > avgCTR * 1.2 ? 'text-emerald-400' : item.ctr > avgCTR * 0.8 ? 'text-slate-300' : 'text-slate-500'}`}>
                                                {(item.ctr * 100).toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-red-400 font-medium">
                                            &euro;{item.cost.toFixed(2)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-slate-400">
                                            &euro;{item.cpc.toFixed(2)}
                                        </td>
                                        <td className={`px-3 py-2.5 text-right font-medium ${hasConv ? 'text-emerald-400' : 'text-slate-600'}`}>
                                            {item.conversions > 0 ? item.conversions.toFixed(1) : item.conversions}
                                        </td>
                                        <td className={`px-3 py-2.5 text-right text-xs ${item.conversionValue > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                                            {item.conversionValue > 0 ? `\u20AC${item.conversionValue.toFixed(2)}` : '\u2014'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-amber-400 text-xs">
                                            &euro;{item.monthlyCost.toFixed(1)}/mo
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-400 text-xs max-w-[160px]">
                                            <span className="truncate block" title={item.campaigns.join(', ')}>
                                                {item.campaigns.length > 2
                                                    ? `${item.campaigns[0]} +${item.campaigns.length - 1} more`
                                                    : item.campaigns.join(', ')}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {displayData.length === 0 && (
                        <div className="p-12 text-center text-slate-400">
                            <p>No zero-conversion search terms found with current filters.</p>
                            <p className="text-xs mt-1 text-slate-500">Try lowering the minimum cost or clicks threshold.</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-slate-700 flex justify-between items-center text-xs text-slate-500">
                    <span>
                        Showing {displayData.length} of {wastefulTerms.length} wasteful terms
                        ({accountLevel.length} account, {campaignLevel.length} campaign)
                    </span>
                    <span>
                        Period: {dateRange.start} to {dateRange.end} ({periodDays} days)
                    </span>
                </div>
            </div>
        </div>
    );
}
