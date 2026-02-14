'use client';

import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, TrendingUp } from 'lucide-react';

interface AuctionInsightsRow {
    domain: string;
    impressionShare: number;
    overlapRate: number;
    outrankingShare: number;
    positionAboveRate: number;
    topRate: number;
    absTopRate: number;
}

interface AuctionInsightsProps {
    customerId?: string;
    dateRange?: { start: string; end: string };
    campaignIds?: string[];
}

export function AuctionInsights({ customerId, dateRange, campaignIds }: AuctionInsightsProps) {
    const [data, setData] = useState<AuctionInsightsRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!customerId) return;

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                // Default date range to last 30 days if not provided
                const effectiveDateRange = dateRange || {
                    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    end: new Date().toISOString().split('T')[0]
                };

                const res = await fetch('/api/df/auction-insights', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerId,
                        dateRange: effectiveDateRange,
                        campaignIds
                    })
                });

                if (!res.ok) {
                    try {
                        const json = await res.json();
                        throw new Error(json.error || 'Failed to fetch auction insights');
                    } catch (e) {
                        throw new Error('Failed to fetch auction insights');
                    }
                }

                const result = await res.json();
                if (result.error) throw new Error(result.error);

                setData(result.data || []);
            } catch (err: any) {
                console.error("Error loading auction insights:", err);
                setError(err.message || 'Failed to load data');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [customerId, dateRange?.start, dateRange?.end, JSON.stringify(campaignIds)]);

    if (loading) {
        return (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 flex justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <div className="flex items-center gap-3 text-red-400 bg-red-400/10 p-4 rounded-lg border border-red-400/20">
                    <AlertCircle className="h-5 w-5" />
                    <div>
                        <h3 className="font-semibold">Error Loading</h3>
                        <p className="text-sm opacity-90">{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-800 mb-4">
                    <TrendingUp className="h-6 w-6 text-slate-500" />
                </div>
                <h3 className="text-lg font-medium text-slate-200">No Auction Insights Data</h3>
                <p className="text-slate-500 mt-2 max-w-md mx-auto">
                    No auction insights data available for this period. Try adjusting the date range.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-800">
                <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-violet-500" />
                    Auction Insights
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                    Competitive landscape data.
                </p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-950/50 text-slate-400 uppercase text-xs border-b border-slate-800">
                        <tr>
                            <th className="px-6 py-4 font-medium">Domain</th>
                            <th className="px-6 py-4 text-right font-medium">Impression Share</th>
                            <th className="px-6 py-4 text-right font-medium">Overlap Rate</th>
                            <th className="px-6 py-4 text-right font-medium">Outranking Share</th>
                            <th className="px-6 py-4 text-right font-medium">Position Above Rate</th>
                            <th className="px-6 py-4 text-right font-medium">Top Rate</th>
                            <th className="px-6 py-4 text-right font-medium">Abs. Top Rate</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {data.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-200">{row.domain}</td>
                                <td className="px-6 py-4 text-right text-slate-300">{(row.impressionShare * 100).toFixed(1)}%</td>
                                <td className="px-6 py-4 text-right text-slate-300">{(row.overlapRate * 100).toFixed(1)}%</td>
                                <td className="px-6 py-4 text-right text-slate-300">{(row.outrankingShare * 100).toFixed(1)}%</td>
                                <td className="px-6 py-4 text-right text-slate-300">{(row.positionAboveRate * 100).toFixed(1)}%</td>
                                <td className="px-6 py-4 text-right text-slate-300">{(row.topRate * 100).toFixed(1)}%</td>
                                <td className="px-6 py-4 text-right text-slate-300">{(row.absTopRate * 100).toFixed(1)}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
