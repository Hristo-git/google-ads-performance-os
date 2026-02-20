"use client";

import { SearchTerm } from "@/types/google-ads";
import { useState } from "react";
import { ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";

interface EnhancedSearchTermsProps {
    data: SearchTerm[];
}

export default function EnhancedSearchTerms({ data }: EnhancedSearchTermsProps) {
    const [groupByTerm, setGroupByTerm] = useState(false);
    const [brandKeywords, setBrandKeywords] = useState('');
    const [brandFilter, setBrandFilter] = useState<'all' | 'branded' | 'non-branded'>('all');

    // Sorting State
    const [sortBy, setSortBy] = useState<keyof SearchTerm>('cost');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const [deviceFilter, setDeviceFilter] = useState<string | null>(null);
    const [showTop, setShowTop] = useState(20);

    if (!data || data.length === 0) {
        return (
            <div className="rounded-xl bg-slate-800 border border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-2">Search Terms</h3>
                <p className="text-slate-400 text-sm">No search terms data available.</p>
            </div>
        );
    }

    const handleSort = (key: keyof SearchTerm) => {
        if (sortBy === key) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            setSortOrder('desc');
        }
    };

    // Helper to check if term is branded
    const isBranded = (term: string) => {
        if (!brandKeywords.trim()) return false;
        const keywords = brandKeywords.toLowerCase().split(',').map(k => k.trim()).filter(k => k);
        const lowerTerm = term.toLowerCase();
        return keywords.some(k => lowerTerm.includes(k));
    };

    // 1. Filter by Device
    let processedData = deviceFilter
        ? data.filter(item => (item.device ?? '') === deviceFilter)
        : data;

    // 2. Filter by Brand
    if (brandFilter !== 'all') {
        processedData = processedData.filter(item => {
            const branded = isBranded(item.searchTerm);
            return brandFilter === 'branded' ? branded : !branded;
        });
    }

    const preAggregationCount = processedData.length;

    // 3. Group by Unique Term (Aggregation)
    if (groupByTerm) {
        const aggregatedMap = new Map<string, SearchTerm>();

        processedData.forEach(item => {
            const key = item.searchTerm.toLowerCase().trim(); // Case insensitive grouping
            if (!aggregatedMap.has(key)) {
                aggregatedMap.set(key, { ...item }); // Clone initial item
            } else {
                const existing = aggregatedMap.get(key)!;
                // Sum Metrics
                existing.clicks += item.clicks;
                existing.impressions += item.impressions;
                existing.cost += item.cost;
                existing.conversions += item.conversions;
                existing.conversionValue += item.conversionValue;
                // Recalculate Rates
                existing.ctr = existing.impressions > 0 ? existing.clicks / existing.impressions : 0;
                existing.averageCpc = existing.clicks > 0 ? existing.cost / existing.clicks : 0;
                existing.conversionRate = existing.clicks > 0 ? existing.conversions / existing.clicks : 0;

                // Keep device only if same, else mark mixed
                if ((existing.device ?? '') !== (item.device ?? '')) existing.device = 'MIXED';
            }
        });
        processedData = Array.from(aggregatedMap.values());
    }

    // 4. Sort
    const sortedData = [...processedData].sort((a, b) => {
        let valA: any = a[sortBy];
        let valB: any = b[sortBy];

        // Handle string comparison for searchTerm
        if (typeof valA === 'string' && typeof valB === 'string') {
            return sortOrder === 'asc'
                ? valA.localeCompare(valB)
                : valB.localeCompare(valA);
        }

        // Handle numeric comparison
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    const displayData = sortedData.slice(0, showTop);

    // Get unique devices for filter
    const devices = Array.from(new Set(data.map(item => item.device)));

    const getDeviceIcon = (device: string) => {
        switch (device) {
            case 'MOBILE': return '📱';
            case 'DESKTOP': return '💻';
            case 'TABLET': return '📋';
            case 'MIXED': return '🔄';
            default: return '📊';
        }
    };

    // Calculate Totals
    const totals = processedData.reduce((acc, item) => ({
        impressions: acc.impressions + item.impressions,
        clicks: acc.clicks + item.clicks,
        cost: acc.cost + item.cost,
        conversions: acc.conversions + item.conversions,
        conversionValue: acc.conversionValue + item.conversionValue,
    }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 });

    const totalCtr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
    const totalAvgCpc = totals.clicks > 0 ? totals.cost / totals.clicks : 0;
    const totalConvRate = totals.clicks > 0 ? totals.conversions / totals.clicks : 0;

    return (
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-6">
            <div className="flex flex-col gap-6 mb-6">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-white">Search Terms Performance</h3>

                    {/* Brand Keywords Input */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Brand Keywords:</span>
                        <input
                            type="text"
                            value={brandKeywords}
                            onChange={(e) => setBrandKeywords(e.target.value)}
                            placeholder="e.g. videnov, виденов"
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder-slate-500 w-48"
                        />
                    </div>
                </div>

                {/* Controls Row */}
                <div className="flex flex-wrap gap-4 justify-between items-end bg-slate-700/30 p-4 rounded-lg">
                    {/* Left Controls: Filters & Grouping */}
                    <div className="flex flex-wrap gap-4 items-center">
                        {/* Device Filter */}
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Device</label>
                            <div className="flex rounded bg-slate-700 p-0.5">
                                <button
                                    onClick={() => setDeviceFilter(null)}
                                    className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${!deviceFilter ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                >
                                    All
                                </button>
                                {devices.map(device => (
                                    <button
                                        key={device}
                                        onClick={() => setDeviceFilter(device ?? null)}
                                        className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${deviceFilter === device ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        {getDeviceIcon(device ?? '')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Brand Filter */}
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Brand Filter</label>
                            <div className="flex rounded bg-slate-700 p-0.5">
                                {(['all', 'branded', 'non-branded'] as const).map(filter => (
                                    <button
                                        key={filter}
                                        onClick={() => setBrandFilter(filter)}
                                        className={`px-3 py-1 rounded text-xs font-semibold capitalize transition-colors ${brandFilter === filter ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        {filter}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Grouping Toggle */}
                        <div className="flex items-center gap-2 h-full pt-4">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-10 h-5 rounded-full relative transition-colors ${groupByTerm ? 'bg-blue-500' : 'bg-slate-600'}`}>
                                    <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${groupByTerm ? 'translate-x-5' : ''}`} />
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={groupByTerm}
                                        onChange={(e) => setGroupByTerm(e.target.checked)}
                                    />
                                </div>
                                <span className={`text-xs font-medium ${groupByTerm ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>
                                    Group Duplicates
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Right Controls: Limit only (Sort moved to headers) */}
                    <div className="flex gap-3">
                        <select
                            value={showTop}
                            onChange={(e) => setShowTop(Number(e.target.value))}
                            className="bg-slate-700 border border-slate-600 text-white px-3 py-1.5 rounded text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none"
                        >
                            <option value={20}>Top 20</option>
                            <option value={50}>Top 50</option>
                            <option value={100}>Top 100</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-700">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-700/50 border-b border-slate-700">
                            <th className="text-left py-3 px-3 text-slate-400 font-semibold w-1/3">
                                <button
                                    className="flex items-center gap-1 hover:text-slate-300 transition-colors w-full text-left"
                                    onClick={() => handleSort('searchTerm')}
                                    type="button"
                                >
                                    Search Term
                                    {sortBy === 'searchTerm' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                </button>
                            </th>
                            {!groupByTerm && <th className="text-center py-3 px-2 text-slate-400 font-semibold">Device</th>}
                            <th className="text-right p-0">
                                <button
                                    className="flex items-center gap-1 hover:text-slate-300 transition-colors w-full justify-end py-3 px-2"
                                    onClick={() => handleSort('impressions')}
                                    type="button"
                                >
                                    Impr.
                                    {sortBy === 'impressions' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                </button>
                            </th>
                            <th className="text-right p-0">
                                <button
                                    className="flex items-center gap-1 hover:text-slate-300 transition-colors w-full justify-end py-3 px-2"
                                    onClick={() => handleSort('clicks')}
                                    type="button"
                                >
                                    Clicks
                                    {sortBy === 'clicks' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                </button>
                            </th>
                            <th className="text-right p-0">
                                <button
                                    className="flex items-center gap-1 hover:text-slate-300 transition-colors w-full justify-end py-3 px-2"
                                    onClick={() => handleSort('ctr')}
                                    type="button"
                                >
                                    CTR
                                    {sortBy === 'ctr' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                </button>
                            </th>
                            <th className="text-right p-0">
                                <button
                                    className="flex items-center gap-1 hover:text-slate-300 transition-colors w-full justify-end py-3 px-2"
                                    onClick={() => handleSort('averageCpc')}
                                    type="button"
                                >
                                    Avg CPC
                                    {sortBy === 'averageCpc' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                </button>
                            </th>
                            <th className="text-right p-0">
                                <button
                                    className="flex items-center gap-1 hover:text-slate-300 transition-colors w-full justify-end py-3 px-2"
                                    onClick={() => handleSort('cost')}
                                    type="button"
                                >
                                    Cost
                                    {sortBy === 'cost' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                </button>
                            </th>
                            <th className="text-right p-0">
                                <button
                                    className="flex items-center gap-1 hover:text-slate-300 transition-colors w-full justify-end py-3 px-2"
                                    onClick={() => handleSort('conversions')}
                                    type="button"
                                >
                                    Conv.
                                    {sortBy === 'conversions' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                </button>
                            </th>
                            <th className="text-right p-0">
                                <button
                                    className="flex items-center gap-1 hover:text-slate-300 transition-colors w-full justify-end py-3 px-2"
                                    onClick={() => handleSort('conversionRate')}
                                    type="button"
                                >
                                    Conv Rate
                                    {sortBy === 'conversionRate' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                </button>
                            </th>
                            <th className="text-right p-0">
                                <button
                                    className="flex items-center gap-1 hover:text-slate-300 transition-colors w-full justify-end py-3 px-2"
                                    onClick={() => handleSort('conversionValue')}
                                    type="button"
                                >
                                    Conv Value
                                    {sortBy === 'conversionValue' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                </button>
                            </th>
                        </tr>
                        {/* Totals Row */}
                        <tr className="bg-slate-700/80 font-bold border-b border-slate-600 text-white">
                            <td className="py-3 px-3 text-left pl-4">
                                Total ({processedData.length})
                            </td>
                            {!groupByTerm && <td className="py-3 px-2 text-center">-</td>}
                            <td className="py-3 px-2 text-right font-mono text-xs">{totals.impressions.toLocaleString()}</td>
                            <td className="py-3 px-2 text-right font-mono text-xs">{totals.clicks.toLocaleString()}</td>
                            <td className="py-3 px-2 text-right font-mono text-xs">{(totalCtr * 100).toFixed(2)}%</td>
                            <td className="py-3 px-2 text-right font-mono text-xs">€{totalAvgCpc.toFixed(2)}</td>
                            <td className="py-3 px-2 text-right font-mono text-xs">€{totals.cost.toFixed(2)}</td>
                            <td className="py-3 px-2 text-right font-mono text-xs text-green-400">{totals.conversions.toFixed(1)}</td>
                            <td className="py-3 px-2 text-right font-mono text-xs">{(totalConvRate * 100).toFixed(2)}%</td>
                            <td className="py-3 px-2 text-right font-mono text-xs text-emerald-400">€{totals.conversionValue.toFixed(2)}</td>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {displayData.map((item, idx) => (
                            <tr
                                key={idx}
                                className="hover:bg-slate-700/30 transition-colors group"
                            >
                                <td className="py-2.5 px-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-medium truncate max-w-[200px] lg:max-w-xs block" title={item.searchTerm}>
                                            {item.searchTerm.replace(/\[PMax Insight\]/g, '').trim()}
                                        </span>
                                        {item.searchTerm.includes('[PMax Insight]') && (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 whitespace-nowrap">
                                                PMAX
                                            </span>
                                        )}
                                        {isBranded(item.searchTerm) && (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                                                BRAND
                                            </span>
                                        )}
                                    </div>
                                </td>
                                {!groupByTerm && (
                                    <td className="py-2.5 px-2 text-center">
                                        <span className="text-lg opacity-80 group-hover:opacity-100 transition-opacity" title={item.device}>
                                            {getDeviceIcon(item.device ?? '')}
                                        </span>
                                    </td>
                                )}
                                <td className="py-2.5 px-2 text-right text-slate-300 font-mono text-xs">
                                    {item.impressions.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-2 text-right text-slate-300 font-mono text-xs">
                                    {item.clicks.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-2 text-right text-slate-300 font-mono text-xs">
                                    {(item.ctr * 100).toFixed(2)}%
                                </td>
                                <td className="py-2.5 px-2 text-right text-slate-300 font-mono text-xs">
                                    €{item.averageCpc.toFixed(2)}
                                </td>
                                <td className="py-2.5 px-2 text-right font-semibold text-white font-mono text-xs">
                                    €{item.cost.toFixed(2)}
                                </td>
                                <td className={`py-2.5 px-2 text-right font-mono text-xs font-bold ${item.conversions > 0 ? 'text-green-400' : 'text-slate-600'}`}>
                                    {item.conversions.toFixed(1)}
                                </td>
                                <td className="py-2.5 px-2 text-right text-slate-300 font-mono text-xs">
                                    {(item.conversionRate * 100).toFixed(2)}%
                                </td>
                                <td className={`py-2.5 px-2 text-right font-mono text-xs font-bold ${item.conversionValue > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                                    €{item.conversionValue.toFixed(2)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Summary Footer */}
            <div className="mt-4 flex flex-wrap justify-between items-center text-xs text-slate-400 px-2">
                <div>
                    Showing {displayData.length} of {processedData.length} terms
                    {groupByTerm && <span className="ml-1 text-slate-500">(aggregated from {preAggregationCount} rows)</span>}
                </div>
            </div>
        </div>
    );
}
