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
    campaigns: string[];   // campaign names
    campaignIds: string[]; // campaign IDs
    monthlyCost: number;   // estimated monthly cost based on period
}

type ScopeFilter = 'all' | 'account' | 'campaign';
type SortKey = 'cost' | 'clicks' | 'impressions' | 'monthlyCost';

export default function NegativeKeywordMiner({ customerId, dateRange }: NegativeKeywordMinerProps) {
    const [rawData, setRawData] = useState<SearchTermRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [sortBy, setSortBy] = useState<SortKey>('cost');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [minCost, setMinCost] = useState(1);
    const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
    const [copied, setCopied] = useState(false);
    const [showTop, setShowTop] = useState(100);

    // Calculate period length in days for monthly projection
    const periodDays = useMemo(() => {
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const diff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
        return diff;
    }, [dateRange.start, dateRange.end]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams({
                    customerId,
                    startDate: dateRange.start,
                    endDate: dateRange.end
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

    // Aggregate search terms: group identical terms across campaigns/dates
    const wastefulTerms = useMemo((): WastefulTerm[] => {
        const byTerm: Record<string, {
            searchTerm: string;
            impressions: number;
            clicks: number;
            cost: number;
            conversions: number;
            campaigns: Set<string>;
            campaignIds: Set<string>;
        }> = {};

        rawData.forEach(item => {
            // Skip PMax insights (no cost data, not actionable for negatives)
            if (item.searchTerm.includes('[PMax Insight]')) return;

            const key = item.searchTerm.toLowerCase().trim();
            if (!byTerm[key]) {
                byTerm[key] = {
                    searchTerm: item.searchTerm,
                    impressions: 0, clicks: 0, cost: 0, conversions: 0,
                    campaigns: new Set(),
                    campaignIds: new Set()
                };
            }
            byTerm[key].impressions += item.impressions;
            byTerm[key].clicks += item.clicks;
            byTerm[key].cost += item.cost;
            byTerm[key].conversions += item.conversions;
            if (item.campaignName) byTerm[key].campaigns.add(item.campaignName);
            if (item.campaignId) byTerm[key].campaignIds.add(item.campaignId);
        });

        return Object.values(byTerm)
            .filter(t => t.conversions === 0 && t.cost >= minCost)
            .map(t => ({
                searchTerm: t.searchTerm,
                impressions: t.impressions,
                clicks: t.clicks,
                cost: t.cost,
                conversions: t.conversions,
                campaigns: Array.from(t.campaigns),
                campaignIds: Array.from(t.campaignIds),
                monthlyCost: periodDays > 0 ? (t.cost / periodDays) * 30 : 0,
            }));
    }, [rawData, minCost, periodDays]);

    // Split into account-level (appears in 2+ campaigns) vs campaign-level (1 campaign)
    const accountLevel = useMemo(() => wastefulTerms.filter(t => t.campaigns.length >= 2), [wastefulTerms]);
    const campaignLevel = useMemo(() => wastefulTerms.filter(t => t.campaigns.length === 1), [wastefulTerms]);

    const displayData = useMemo(() => {
        let data = scopeFilter === 'account' ? accountLevel
            : scopeFilter === 'campaign' ? campaignLevel
            : wastefulTerms;

        data.sort((a, b) => {
            const aVal = a[sortBy];
            const bVal = b[sortBy];
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });

        return data.slice(0, showTop);
    }, [wastefulTerms, accountLevel, campaignLevel, scopeFilter, sortBy, sortDir, showTop]);

    // Summary stats
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
        const header = 'Search Term,Cost,Monthly Cost Est.,Clicks,Impressions,Campaigns,Scope';
        const rows = selectedTerms.map(t =>
            `"${t.searchTerm.replace(/"/g, '""')}",${t.cost.toFixed(2)},${t.monthlyCost.toFixed(2)},${t.clicks},${t.impressions},"${t.campaigns.join('; ')}",${t.campaigns.length >= 2 ? 'Account' : 'Campaign'}`
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-lg p-3 bg-red-500/10 border border-red-500/20">
                    <div className="text-xs text-red-400 font-medium">Wasted Spend ({periodDays}d)</div>
                    <div className="text-xl font-bold text-white mt-1">
                        &euro;{totalWastedCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-xs text-red-400/60 mt-0.5">
                        {wastefulTerms.length} zero-conversion terms
                    </div>
                </div>
                <div className="rounded-lg p-3 bg-amber-500/10 border border-amber-500/20">
                    <div className="text-xs text-amber-400 font-medium">Est. Monthly Waste</div>
                    <div className="text-xl font-bold text-white mt-1">
                        &euro;{totalMonthlyWaste.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo
                    </div>
                    <div className="text-xs text-amber-400/60 mt-0.5">
                        Projected from {periodDays}-day data
                    </div>
                </div>
                <div className="rounded-lg p-3 bg-violet-500/10 border border-violet-500/20">
                    <div className="text-xs text-violet-400 font-medium">Account-Level Negatives</div>
                    <div className="text-xl font-bold text-white mt-1">{accountLevel.length}</div>
                    <div className="text-xs text-violet-400/60 mt-0.5">
                        Appears in 2+ campaigns
                    </div>
                </div>
                <div className="rounded-lg p-3 bg-blue-500/10 border border-blue-500/20">
                    <div className="text-xs text-blue-400 font-medium">Campaign-Level Negatives</div>
                    <div className="text-xl font-bold text-white mt-1">{campaignLevel.length}</div>
                    <div className="text-xs text-blue-400/60 mt-0.5">
                        Specific to 1 campaign
                    </div>
                </div>
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

            {/* Controls */}
            <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
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

                        {/* Min Cost Filter */}
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
                                <th className="px-3 py-3 font-medium">Scope</th>
                                <th className="px-3 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('cost')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Cost {sortBy === 'cost' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-3 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('monthlyCost')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Est./Mo {sortBy === 'monthlyCost' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-3 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('clicks')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Clicks {sortBy === 'clicks' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-3 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('impressions')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Impr. {sortBy === 'impressions' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
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
                                return (
                                    <tr
                                        key={idx}
                                        onClick={() => toggleSelect(item.searchTerm)}
                                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-violet-500/10' : 'hover:bg-slate-700/30'}`}
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
                                        <td className="px-3 py-2.5 text-white font-medium max-w-[300px]">
                                            <span className="truncate block" title={item.searchTerm}>{item.searchTerm}</span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${isAccountScope
                                                ? 'bg-violet-500/20 text-violet-400'
                                                : 'bg-blue-500/20 text-blue-400'
                                            }`}>
                                                {isAccountScope ? 'Account' : 'Campaign'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-red-400 font-medium">
                                            &euro;{item.cost.toFixed(2)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-amber-400 text-xs">
                                            &euro;{item.monthlyCost.toFixed(1)}/mo
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-slate-300">
                                            {item.clicks.toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-slate-400">
                                            {item.impressions.toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-400 text-xs max-w-[200px]">
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
                            <p>No zero-conversion search terms found above &euro;{minCost} threshold.</p>
                            <p className="text-xs mt-1 text-slate-500">Try lowering the minimum cost filter.</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-slate-700 flex justify-between items-center text-xs text-slate-500">
                    <span>
                        Showing {displayData.length} of {wastefulTerms.length} wasteful terms
                        ({accountLevel.length} account-level, {campaignLevel.length} campaign-level)
                    </span>
                    <span>
                        Period: {dateRange.start} to {dateRange.end} ({periodDays} days)
                    </span>
                </div>
            </div>
        </div>
    );
}
