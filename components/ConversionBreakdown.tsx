"use client";

import { useState, useEffect, useMemo } from "react";

interface ConversionAction {
    campaignId: string;
    campaignName: string;
    conversionAction: string;
    conversionCategory: string;
    conversions: number;
    conversionValue: number;
    allConversions: number;
    allConversionValue: number;
}

interface ConversionBreakdownProps {
    customerId: string;
    dateRange: { start: string; end: string };
}

const CATEGORY_LABELS: Record<string, string> = {
    'DEFAULT': 'Default',
    'PURCHASE': 'Purchase',
    'SIGNUP': 'Sign Up',
    'LEAD': 'Lead',
    'PAGE_VIEW': 'Page View',
    'DOWNLOAD': 'Download',
    'ADD_TO_CART': 'Add to Cart',
    'BEGIN_CHECKOUT': 'Begin Checkout',
    'SUBSCRIBE_PAID': 'Paid Subscription',
    'PHONE_CALL_LEAD': 'Phone Call',
    'IMPORTED_LEAD': 'Imported Lead',
    'SUBMIT_LEAD_FORM': 'Lead Form',
    'BOOK_APPOINTMENT': 'Appointment',
    'REQUEST_QUOTE': 'Request Quote',
    'GET_DIRECTIONS': 'Directions',
    'OUTBOUND_CLICK': 'Outbound Click',
    'CONTACT': 'Contact',
    'ENGAGEMENT': 'Engagement',
    'STORE_VISIT': 'Store Visit',
    'STORE_SALE': 'Store Sale',
    'QUALIFIED_LEAD': 'Qualified Lead',
    'CONVERTED_LEAD': 'Converted Lead',
    'UNKNOWN': 'Other',
    'UNSPECIFIED': 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
    'PURCHASE': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'SIGNUP': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'LEAD': 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    'ADD_TO_CART': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'BEGIN_CHECKOUT': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'PHONE_CALL_LEAD': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    'IMPORTED_LEAD': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    'CONTACT': 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    'ENGAGEMENT': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    'STORE_VISIT': 'bg-lime-500/20 text-lime-400 border-lime-500/30',
    'STORE_SALE': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'GET_DIRECTIONS': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    'QUALIFIED_LEAD': 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    'CONVERTED_LEAD': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

export default function ConversionBreakdown({ customerId, dateRange }: ConversionBreakdownProps) {
    const [data, setData] = useState<ConversionAction[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'conversions' | 'conversionValue' | 'conversionAction'>('conversions');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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
                const res = await fetch(`/api/google-ads/conversion-actions?${params}`);
                const json = await res.json();
                if (json.error) {
                    setError(json.error);
                } else {
                    setData(json.conversionActions || []);
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load conversion data');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [customerId, dateRange.start, dateRange.end]);

    // Aggregate by conversion action
    const aggregated = useMemo(() => {
        const byAction: Record<string, { action: string; category: string; conversions: number; value: number; campaigns: Set<string> }> = {};

        data.forEach(item => {
            const key = item.conversionAction;
            if (!byAction[key]) {
                byAction[key] = {
                    action: item.conversionAction,
                    category: item.conversionCategory,
                    conversions: 0,
                    value: 0,
                    campaigns: new Set()
                };
            }
            byAction[key].conversions += item.conversions;
            byAction[key].value += item.conversionValue;
            byAction[key].campaigns.add(item.campaignId);
        });

        const result = Object.values(byAction).map(item => ({
            ...item,
            campaignCount: item.campaigns.size
        }));

        result.sort((a, b) => {
            if (sortBy === 'conversionAction') {
                return sortDir === 'asc' ? a.action.localeCompare(b.action) : b.action.localeCompare(a.action);
            }
            const aVal = sortBy === 'conversions' ? a.conversions : a.value;
            const bVal = sortBy === 'conversions' ? b.conversions : b.value;
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });

        return result;
    }, [data, sortBy, sortDir]);

    // Category summary
    const categorySummary = useMemo(() => {
        const byCategory: Record<string, { conversions: number; value: number }> = {};
        aggregated.forEach(item => {
            const cat = item.category;
            if (!byCategory[cat]) byCategory[cat] = { conversions: 0, value: 0 };
            byCategory[cat].conversions += item.conversions;
            byCategory[cat].value += item.value;
        });
        return Object.entries(byCategory)
            .map(([category, data]) => ({ category, ...data }))
            .sort((a, b) => b.conversions - a.conversions);
    }, [aggregated]);

    const totalConversions = aggregated.reduce((sum, item) => sum + item.conversions, 0);
    const totalValue = aggregated.reduce((sum, item) => sum + item.value, 0);

    const handleSort = (col: typeof sortBy) => {
        if (sortBy === col) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(col);
            setSortDir('desc');
        }
    };

    if (loading) {
        return (
            <div className="rounded-xl bg-slate-800 border border-slate-700 p-12 flex flex-col items-center justify-center">
                <div className="relative w-12 h-12 mb-4">
                    <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-violet-500 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p className="text-slate-400 text-sm">Loading conversion data...</p>
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

    if (aggregated.length === 0) {
        return (
            <div className="rounded-xl bg-slate-800 border border-slate-700 p-12 text-center">
                <p className="text-slate-400">No conversion data available for the selected period.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Category Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {categorySummary.slice(0, 5).map(cat => (
                    <div
                        key={cat.category}
                        className={`rounded-lg p-3 border ${CATEGORY_COLORS[cat.category] || 'bg-slate-700/50 border-slate-600 text-slate-300'}`}
                    >
                        <div className="text-xs font-medium mb-1">
                            {CATEGORY_LABELS[cat.category] || cat.category}
                        </div>
                        <div className="text-lg font-bold text-white">
                            {cat.conversions.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-xs opacity-70">
                            {totalConversions > 0 ? ((cat.conversions / totalConversions) * 100).toFixed(1) : 0}%
                        </div>
                        {cat.value > 0 && (
                            <div className="text-xs mt-1 text-slate-400">
                                &euro;{cat.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Totals Bar */}
            <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <div>
                        <span className="text-xs text-slate-500 uppercase">Total Conversions</span>
                        <p className="text-lg font-bold text-white">{totalConversions.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                    </div>
                    <div>
                        <span className="text-xs text-slate-500 uppercase">Total Value</span>
                        <p className="text-lg font-bold text-white">&euro;{totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                    </div>
                    <div>
                        <span className="text-xs text-slate-500 uppercase">Actions</span>
                        <p className="text-lg font-bold text-white">{aggregated.length}</p>
                    </div>
                </div>
            </div>

            {/* Detail Table */}
            <div className="rounded-xl bg-slate-800 border border-slate-700 shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-700/50 text-slate-300 uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3 font-medium">
                                    <button onClick={() => handleSort('conversionAction')} className="flex items-center gap-1 hover:text-white">
                                        Conversion Action
                                        {sortBy === 'conversionAction' && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                    </button>
                                </th>
                                <th className="px-4 py-3 font-medium">Category</th>
                                <th className="px-4 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('conversions')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Conversions
                                        {sortBy === 'conversions' && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                    </button>
                                </th>
                                <th className="px-4 py-3 text-right font-medium">
                                    <button onClick={() => handleSort('conversionValue')} className="flex items-center gap-1 ml-auto hover:text-white">
                                        Value
                                        {sortBy === 'conversionValue' && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                    </button>
                                </th>
                                <th className="px-4 py-3 text-right font-medium">% of Total</th>
                                <th className="px-4 py-3 text-right font-medium">Campaigns</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {aggregated.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                                    <td className="px-4 py-3 text-white font-medium">{item.action}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[item.category] || 'bg-slate-600/50 text-slate-400'}`}>
                                            {CATEGORY_LABELS[item.category] || item.category}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-200">
                                        {item.conversions.toLocaleString('en-US', { maximumFractionDigits: 1 })}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-200">
                                        &euro;{item.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-400">
                                        {totalConversions > 0 ? ((item.conversions / totalConversions) * 100).toFixed(1) : 0}%
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-400">
                                        {item.campaignCount}
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
