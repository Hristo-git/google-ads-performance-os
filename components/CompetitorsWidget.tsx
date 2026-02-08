"use client";

import { useState, useEffect, useMemo } from "react";

interface AuctionInsight {
    campaignId: string;
    competitor: string;
    impressionShare: number | null;
    overlapRate: number | null;
    outrankingShare: number | null;
    positionAboveRate: number | null;
    topOfPageRate: number | null;
    absTopOfPageRate: number | null;
}

interface CompetitorsWidgetProps {
    customerId: string;
    campaignId?: string;
    dateRange: { start: string; end: string };
    language?: 'bg' | 'en';
}

export default function CompetitorsWidget({
    customerId,
    campaignId,
    dateRange,
    language = 'bg'
}: CompetitorsWidgetProps) {
    const [insights, setInsights] = useState<AuctionInsight[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (!campaignId) return;

        const fetchInsights = async () => {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams({
                    customerId,
                    campaignId,
                    startDate: dateRange.start,
                    endDate: dateRange.end
                });
                const res = await fetch(`/api/google-ads/auction-insights?${params}`);
                const data = await res.json();

                if (data.error) {
                    setError(data.error);
                } else if (data.auctionInsights) {
                    setInsights(data.auctionInsights);
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load insights');
            } finally {
                setLoading(false);
            }
        };

        fetchInsights();
    }, [customerId, campaignId, dateRange.start, dateRange.end]);

    // Aggregate by competitor
    const aggregatedInsights = useMemo(() => {
        const byCompetitor: Record<string, AuctionInsight> = {};

        insights.forEach(insight => {
            if (!byCompetitor[insight.competitor]) {
                byCompetitor[insight.competitor] = { ...insight };
            }
        });

        return Object.values(byCompetitor)
            .filter(i => i.competitor !== 'Unknown')
            .sort((a, b) => (b.impressionShare || 0) - (a.impressionShare || 0))
            .slice(0, 10);
    }, [insights]);

    const formatPercent = (val: number | null) => {
        if (val === null || val === undefined) return '—';
        return `${(val * 100).toFixed(1)}%`;
    };

    const getCompetitorColor = (outrankingShare: number | null, positionAbove: number | null) => {
        const threat = (positionAbove || 0) - (outrankingShare || 0);
        if (threat > 0.2) return 'text-red-400'; // They beat us often
        if (threat < -0.2) return 'text-emerald-400'; // We beat them often
        return 'text-amber-400'; // Close competition
    };

    if (!campaignId) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">
                    🎯 {language === 'en' ? 'Auction Insights' : 'Конкуренти'}
                </h3>
                <p className="text-xs text-slate-500">
                    {language === 'en' ? 'Select a campaign to view competitor data' : 'Изберете кампания за данни за конкурентите'}
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-1/3 mb-3"></div>
                <div className="space-y-2">
                    <div className="h-3 bg-slate-700 rounded w-full"></div>
                    <div className="h-3 bg-slate-700 rounded w-4/5"></div>
                    <div className="h-3 bg-slate-700 rounded w-3/5"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-red-900/30">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">🎯 Auction Insights</h3>
                <p className="text-xs text-red-400">{error}</p>
            </div>
        );
    }

    if (aggregatedInsights.length === 0) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">
                    🎯 {language === 'en' ? 'Auction Insights' : 'Конкуренти'}
                </h3>
                <p className="text-xs text-slate-500">
                    {language === 'en' ? 'No competitor data available' : 'Няма данни за конкуренти'}
                </p>
            </div>
        );
    }

    return (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-300">
                    🎯 {language === 'en' ? 'Auction Insights' : 'Конкуренти'}
                </h3>
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-[10px] text-violet-400 hover:text-violet-300"
                >
                    {expanded ? (language === 'en' ? 'Collapse' : 'Свий') : (language === 'en' ? 'Expand' : 'Разшири')}
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-slate-500 border-b border-slate-700">
                            <th className="text-left py-1.5 font-medium">{language === 'en' ? 'Competitor' : 'Конкурент'}</th>
                            <th className="text-right py-1.5 font-medium">IS</th>
                            <th className="text-right py-1.5 font-medium">{language === 'en' ? 'Overlap' : 'Overlap'}</th>
                            {expanded && (
                                <>
                                    <th className="text-right py-1.5 font-medium">{language === 'en' ? 'Outranking' : 'Outrank'}</th>
                                    <th className="text-right py-1.5 font-medium">{language === 'en' ? 'Top Rate' : 'Top %'}</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {aggregatedInsights.map((insight, idx) => (
                            <tr
                                key={idx}
                                className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                            >
                                <td className={`py-1.5 font-medium truncate max-w-[120px] ${getCompetitorColor(insight.outrankingShare, insight.positionAboveRate)}`}>
                                    {insight.competitor}
                                </td>
                                <td className="text-right text-slate-300">
                                    {formatPercent(insight.impressionShare)}
                                </td>
                                <td className="text-right text-slate-400">
                                    {formatPercent(insight.overlapRate)}
                                </td>
                                {expanded && (
                                    <>
                                        <td className="text-right text-slate-400">
                                            {formatPercent(insight.outrankingShare)}
                                        </td>
                                        <td className="text-right text-slate-400">
                                            {formatPercent(insight.topOfPageRate)}
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Legend */}
            <div className="mt-2 flex gap-3 text-[9px] text-slate-500">
                <span className="text-emerald-400">● {language === 'en' ? 'We beat them' : 'Ние ги бием'}</span>
                <span className="text-amber-400">● {language === 'en' ? 'Close' : 'Близко'}</span>
                <span className="text-red-400">● {language === 'en' ? 'They beat us' : 'Те ни бият'}</span>
            </div>
        </div>
    );
}
