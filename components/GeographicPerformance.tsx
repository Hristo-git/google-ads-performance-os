"use client";

import { useState, useEffect, useMemo } from "react";

interface GeoData {
    campaignId: string;
    countryId: string;
    locationType: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    roas: number | null;
    cpa: number | null;
}

interface RegionalData {
    locationId: string;
    locationName: string;
    locationType: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    roas: number | null;
    cpa: number | null;
}

interface GeographicPerformanceProps {
    customerId: string;
    dateRange: { start: string; end: string };
}

const COUNTRY_NAMES: Record<string, string> = {
    '2100': 'Bulgaria',
    '2642': 'Romania',
    '2300': 'Greece',
    '2807': 'North Macedonia',
    '2498': 'Moldova',
    '2276': 'Germany',
    '2826': 'United Kingdom',
    '2250': 'France',
    '2380': 'Italy',
    '2724': 'Spain',
    '2528': 'Netherlands',
    '2056': 'Belgium',
    '2040': 'Austria',
    '2756': 'Switzerland',
    '2616': 'Poland',
    '2203': 'Czech Republic',
    '2348': 'Hungary',
    '2703': 'Slovakia',
    '2191': 'Croatia',
    '2705': 'Slovenia',
    '2840': 'United States',
    '2124': 'Canada',
    '2036': 'Australia',
};

const TYPE_BADGES: Record<string, string> = {
    'Country': 'bg-blue-500/20 text-blue-400',
    'Region': 'bg-violet-500/20 text-violet-400',
    'City': 'bg-emerald-500/20 text-emerald-400',
    'Municipality': 'bg-amber-500/20 text-amber-400',
    'Province': 'bg-cyan-500/20 text-cyan-400',
};

export default function GeographicPerformance({ customerId, dateRange }: GeographicPerformanceProps) {
    const [countryData, setCountryData] = useState<GeoData[]>([]);
    const [regionalData, setRegionalData] = useState<RegionalData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [citiesError, setCitiesError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<string>('cost');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [viewMode, setViewMode] = useState<'countries' | 'cities'>('countries');
    const [typeFilter, setTypeFilter] = useState<string>('all');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            setCitiesError(null);
            try {
                const params = new URLSearchParams({
                    customerId,
                    startDate: dateRange.start,
                    endDate: dateRange.end
                });
                const res = await fetch(`/api/google-ads/geographic?${params}`);
                const json = await res.json();
                if (json.error) {
                    setError(json.error);
                } else {
                    setCountryData(json.geographic || []);
                    setRegionalData(json.regional || []);
                    if (json.regionalError) {
                        setCitiesError(json.regionalError);
                    }
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load geographic data');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [customerId, dateRange.start, dateRange.end]);

    interface DisplayRow {
        name: string;
        locationType: string;
        impressions: number;
        clicks: number;
        cost: number;
        conversions: number;
        conversionValue: number;
        roas: number | null;
        cpa: number | null;
        ctr: number;
    }

    // Aggregate country-level data
    const countryAggregated = useMemo((): DisplayRow[] => {
        const byCountry: Record<string, { countryId: string; impressions: number; clicks: number; cost: number; conversions: number; conversionValue: number }> = {};

        countryData.forEach(item => {
            const key = item.countryId;
            if (!byCountry[key]) {
                byCountry[key] = { countryId: key, impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 };
            }
            byCountry[key].impressions += item.impressions;
            byCountry[key].clicks += item.clicks;
            byCountry[key].cost += item.cost;
            byCountry[key].conversions += item.conversions;
            byCountry[key].conversionValue += item.conversionValue;
        });

        return Object.values(byCountry).map(item => ({
            name: COUNTRY_NAMES[item.countryId] || `Country ${item.countryId}`,
            locationType: 'Country',
            impressions: item.impressions,
            clicks: item.clicks,
            cost: item.cost,
            conversions: item.conversions,
            conversionValue: item.conversionValue,
            roas: item.cost > 0 ? item.conversionValue / item.cost : null,
            cpa: item.conversions > 0 ? item.cost / item.conversions : null,
            ctr: item.impressions > 0 ? item.clicks / item.impressions : 0,
        }));
    }, [countryData]);

    // Aggregate regional data by location
    const regionAggregated = useMemo((): DisplayRow[] => {
        const byLocation: Record<string, { locationName: string; locationType: string; impressions: number; clicks: number; cost: number; conversions: number; conversionValue: number }> = {};

        regionalData.forEach(item => {
            const key = item.locationId;
            if (!byLocation[key]) {
                byLocation[key] = {
                    locationName: item.locationName,
                    locationType: item.locationType,
                    impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0
                };
            }
            byLocation[key].impressions += item.impressions;
            byLocation[key].clicks += item.clicks;
            byLocation[key].cost += item.cost;
            byLocation[key].conversions += item.conversions;
            byLocation[key].conversionValue += item.conversionValue;
        });

        return Object.values(byLocation).map(item => ({
            name: item.locationName,
            locationType: item.locationType,
            impressions: item.impressions,
            clicks: item.clicks,
            cost: item.cost,
            conversions: item.conversions,
            conversionValue: item.conversionValue,
            roas: item.cost > 0 ? item.conversionValue / item.cost : null,
            cpa: item.conversions > 0 ? item.cost / item.conversions : null,
            ctr: item.impressions > 0 ? item.clicks / item.impressions : 0,
        }));
    }, [regionalData]);

    // Available location types for filtering
    const locationTypes = useMemo(() => {
        const types = new Set(regionAggregated.map(r => r.locationType));
        return Array.from(types).sort();
    }, [regionAggregated]);

    // Current view data (sorted and filtered)
    const displayData = useMemo(() => {
        let data = viewMode === 'countries' ? countryAggregated : regionAggregated;

        if (viewMode === 'cities' && typeFilter !== 'all') {
            data = data.filter(item => item.locationType === typeFilter);
        }

        const sorted = [...data];
        sorted.sort((a, b) => {
            const aVal = (a as any)[sortBy] ?? -Infinity;
            const bVal = (b as any)[sortBy] ?? -Infinity;
            if (sortBy === 'name') {
                return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
            }
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });

        return sorted;
    }, [viewMode, countryAggregated, regionAggregated, typeFilter, sortBy, sortDir]);

    const totalCost = displayData.reduce((sum, item) => sum + item.cost, 0);

    const handleSort = (col: string) => {
        if (sortBy === col) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(col);
            setSortDir('desc');
        }
    };

    const getRoasColor = (roas: number | null) => {
        if (roas === null) return 'text-slate-500';
        if (roas >= 3) return 'text-emerald-400';
        if (roas >= 1) return 'text-amber-400';
        return 'text-red-400';
    };

    if (loading) {
        return (
            <div className="rounded-xl bg-slate-800 border border-slate-700 p-12 flex flex-col items-center justify-center">
                <div className="relative w-12 h-12 mb-4">
                    <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-violet-500 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p className="text-slate-400 text-sm">Loading geographic data...</p>
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

    if (countryAggregated.length === 0 && regionAggregated.length === 0) {
        return (
            <div className="rounded-xl bg-slate-800 border border-slate-700 p-12 text-center">
                <p className="text-slate-400">No geographic data available for the selected period.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Cities error/debug info */}
            {citiesError && (
                <div className="rounded-xl bg-slate-800 border border-amber-900/30 p-4">
                    <p className="text-amber-400 text-sm font-medium">Cities query error:</p>
                    <p className="text-amber-300/70 text-xs mt-1 font-mono">{citiesError}</p>
                </div>
            )}

            {/* Top Locations Summary (top 5 by cost) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {displayData.slice(0, 5).map((region, idx) => (
                    <div
                        key={`top-${idx}`}
                        className="rounded-lg p-3 bg-slate-700/30 border border-slate-600"
                    >
                        <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs font-medium text-slate-400 truncate">{region.name}</span>
                            {viewMode === 'cities' && region.locationType !== 'Country' && (
                                <span className={`text-[9px] px-1 py-0.5 rounded ${TYPE_BADGES[region.locationType] || 'bg-slate-600/50 text-slate-400'}`}>
                                    {region.locationType}
                                </span>
                            )}
                        </div>
                        <div className="text-lg font-bold text-white">
                            &euro;{region.cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-slate-500">
                                {totalCost > 0 ? ((region.cost / totalCost) * 100).toFixed(1) : 0}% of spend
                            </span>
                            <span className={`text-xs font-medium ${getRoasColor(region.roas)}`}>
                                {region.roas !== null ? `${region.roas.toFixed(2)}x` : '\u2014'}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Detail Table */}
            <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700 flex flex-wrap justify-between items-center gap-3">
                    <h2 className="font-semibold text-white">Geographic Performance</h2>
                    <div className="flex items-center gap-3">
                        {/* View Mode Toggle */}
                        <div className="flex bg-slate-700/50 rounded-lg p-0.5 border border-slate-600/50">
                            <button
                                onClick={() => { setViewMode('countries'); setTypeFilter('all'); }}
                                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'countries'
                                    ? 'bg-violet-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                Countries
                            </button>
                            <button
                                onClick={() => setViewMode('cities')}
                                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'cities'
                                    ? 'bg-violet-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                Cities
                            </button>
                        </div>

                        {/* Type Filter (only in cities view) */}
                        {viewMode === 'cities' && locationTypes.length > 1 && (
                            <select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                className="bg-slate-700 border border-slate-600 text-slate-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-violet-500"
                            >
                                <option value="all">All types</option>
                                {locationTypes.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        )}

                        <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">
                            {displayData.length} {viewMode === 'countries' ? 'countries' : 'cities'}
                        </span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3 font-medium">
                                    <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-white">
                                        Location {sortBy === 'name' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                {viewMode === 'cities' && (
                                    <th className="px-4 py-3 font-medium">Type</th>
                                )}
                                <th className="px-4 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('impressions')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Impressions {sortBy === 'impressions' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-4 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('clicks')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Clicks {sortBy === 'clicks' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-4 py-3 text-right font-medium">CTR</th>
                                <th className="px-4 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('cost')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Cost {sortBy === 'cost' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-4 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('conversions')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Conv. {sortBy === 'conversions' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-4 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('roas')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        ROAS {sortBy === 'roas' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                                <th className="px-4 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('cpa')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        CPA {sortBy === 'cpa' && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                                    </button>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {displayData.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                                    <td className="px-4 py-3 text-white font-medium">{item.name}</td>
                                    {viewMode === 'cities' && (
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_BADGES[item.locationType] || 'bg-slate-600/50 text-slate-400'}`}>
                                                {item.locationType}
                                            </span>
                                        </td>
                                    )}
                                    <td className="px-4 py-3 text-right text-slate-300">
                                        {item.impressions.toLocaleString('en-US')}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-300">
                                        {item.clicks.toLocaleString('en-US')}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-400">
                                        {(item.ctr * 100).toFixed(2)}%
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-200">
                                        &euro;{item.cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-200">
                                        {item.conversions.toLocaleString('en-US', { maximumFractionDigits: 1 })}
                                    </td>
                                    <td className={`px-4 py-3 text-right font-medium ${getRoasColor(item.roas)}`}>
                                        {item.roas !== null ? `${item.roas.toFixed(2)}x` : '\u2014'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-300">
                                        {item.cpa !== null ? `\u20AC${item.cpa.toFixed(2)}` : '\u2014'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
