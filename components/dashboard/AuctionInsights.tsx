'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertCircle, TrendingUp } from 'lucide-react';
import { AuctionInsightsRow } from '@/lib/google-sheets';

export function AuctionInsights() {
    const [data, setData] = useState<AuctionInsightsRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const res = await fetch('/api/auction-insights');
                const json = await res.json();

                if (!res.ok) {
                    throw new Error(json.error || 'Failed to fetch data');
                }

                setData(json.data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

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
                        <h3 className="font-semibold">Error Loading Auction Insights</h3>
                        <p className="text-sm opacity-90">{error}</p>
                    </div>
                </div>
                <p className="text-slate-400 text-sm mt-4">
                    Ensure the Google Sheet is shared with the service account and the ID is correct.
                </p>
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
                    We couldn't find any data in the connected Google Sheet. Please ensure the Google Ads Script has run and populated the sheet.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-800">
                <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-violet-500" />
                    Auction Insights (Competitors)
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                    Competitive landscape data from the last 30 days.
                </p>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-400 uppercase bg-slate-950/50 border-b border-slate-800">
                        <tr>
                            <th className="px-6 py-4 font-medium">Domain</th>
                            <th className="px-6 py-4 font-medium text-right">Impression Share</th>
                            <th className="px-6 py-4 font-medium text-right">Overlap Rate</th>
                            <th className="px-6 py-4 font-medium text-right">Outranking Share</th>
                            <th className="px-6 py-4 font-medium text-right">Pos. Above Rate</th>
                            <th className="px-6 py-4 font-medium text-right">Top of Page</th>
                            <th className="px-6 py-4 font-medium text-right">Abs. Top</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {data.map((row, i) => (
                            <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-200">{row.domain}</td>
                                <td className="px-6 py-4 text-right text-slate-300">{(row.impressionShare * 100).toFixed(1)}%</td>
                                <td className="px-6 py-4 text-right text-slate-300">{(row.overlapRate * 100).toFixed(1)}%</td>
                                <td className="px-6 py-4 text-right text-slate-300">{(row.outrankingShare * 100).toFixed(1)}%</td>
                                <td className="px-6 py-4 text-right text-slate-300">{(row.positionAboveRate * 100).toFixed(1)}%</td>
                                <td className="px-6 py-4 text-right text-slate-300">{(row.topOfPageRate * 100).toFixed(1)}%</td>
                                <td className="px-6 py-4 text-right text-slate-300">{(row.absTopOfPageRate * 100).toFixed(1)}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
