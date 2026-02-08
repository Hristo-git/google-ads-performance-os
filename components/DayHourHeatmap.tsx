"use client";

import { useState, useEffect, useMemo } from "react";

interface HourData {
    campaignId: string;
    hour: number;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    roas: number | null;
    cpa: number | null;
}

interface DayData {
    campaignId: string;
    dayOfWeek: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    roas: number | null;
    cpa: number | null;
}

interface DayHourHeatmapProps {
    customerId: string;
    dateRange: { start: string; end: string };
    language?: 'bg' | 'en';
    campaignIds?: string[];
}

const DAYS_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_LABELS: Record<string, Record<string, string>> = {
    bg: { MONDAY: 'Пон', TUESDAY: 'Вт', WEDNESDAY: 'Ср', THURSDAY: 'Чет', FRIDAY: 'Пет', SATURDAY: 'Съб', SUNDAY: 'Нед' },
    en: { MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun' }
};

export default function DayHourHeatmap({
    customerId,
    dateRange,
    language = 'bg',
    campaignIds
}: DayHourHeatmapProps) {
    const [hourData, setHourData] = useState<HourData[]>([]);
    const [dayData, setDayData] = useState<DayData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [metric, setMetric] = useState<'roas' | 'conversions' | 'cpa'>('roas');
    const [view, setView] = useState<'hour' | 'day'>('hour');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const baseParams = new URLSearchParams({
                    customerId,
                    startDate: dateRange.start,
                    endDate: dateRange.end
                });
                if (campaignIds?.length) {
                    baseParams.set('campaignIds', campaignIds.join(','));
                }

                const [hourRes, dayRes] = await Promise.all([
                    fetch(`/api/google-ads/hour-of-day?${baseParams}`),
                    fetch(`/api/google-ads/day-of-week?${baseParams}`)
                ]);

                const hourJson = await hourRes.json();
                const dayJson = await dayRes.json();

                if (hourJson.hourOfDayPerformance) setHourData(hourJson.hourOfDayPerformance);
                if (dayJson.dayOfWeekPerformance) setDayData(dayJson.dayOfWeekPerformance);
            } catch (err: any) {
                setError(err.message || 'Failed to load data');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [customerId, dateRange.start, dateRange.end, campaignIds]);

    // Aggregate hourly data
    const hourlyAggregated = useMemo(() => {
        const byHour: Record<number, { cost: number; conversions: number; conversionValue: number }> = {};

        hourData.forEach(row => {
            if (!byHour[row.hour]) {
                byHour[row.hour] = { cost: 0, conversions: 0, conversionValue: 0 };
            }
            byHour[row.hour].cost += row.cost;
            byHour[row.hour].conversions += row.conversions;
            byHour[row.hour].conversionValue += row.conversionValue;
        });

        return Array.from({ length: 24 }, (_, h) => {
            const data = byHour[h] || { cost: 0, conversions: 0, conversionValue: 0 };
            return {
                hour: h,
                ...data,
                roas: data.cost > 0 ? data.conversionValue / data.cost : null,
                cpa: data.conversions > 0 ? data.cost / data.conversions : null
            };
        });
    }, [hourData]);

    // Aggregate daily data
    const dailyAggregated = useMemo(() => {
        const byDay: Record<string, { cost: number; conversions: number; conversionValue: number }> = {};

        dayData.forEach(row => {
            if (!byDay[row.dayOfWeek]) {
                byDay[row.dayOfWeek] = { cost: 0, conversions: 0, conversionValue: 0 };
            }
            byDay[row.dayOfWeek].cost += row.cost;
            byDay[row.dayOfWeek].conversions += row.conversions;
            byDay[row.dayOfWeek].conversionValue += row.conversionValue;
        });

        return DAYS_ORDER.map(day => {
            const data = byDay[day] || { cost: 0, conversions: 0, conversionValue: 0 };
            return {
                day,
                ...data,
                roas: data.cost > 0 ? data.conversionValue / data.cost : null,
                cpa: data.conversions > 0 ? data.cost / data.conversions : null
            };
        });
    }, [dayData]);

    // Get color based on value relative to range
    const getHeatColor = (value: number | null, min: number, max: number, isInverted = false) => {
        if (value === null || max === min) return 'bg-slate-700/50';
        const normalized = (value - min) / (max - min);
        const ratio = isInverted ? 1 - normalized : normalized;

        if (ratio >= 0.8) return 'bg-emerald-500/60';
        if (ratio >= 0.6) return 'bg-emerald-500/40';
        if (ratio >= 0.4) return 'bg-amber-500/40';
        if (ratio >= 0.2) return 'bg-orange-500/40';
        return 'bg-red-500/40';
    };

    if (loading) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-slate-700 rounded w-1/3"></div>
                    <div className="grid grid-cols-12 gap-1">
                        {Array.from({ length: 24 }).map((_, i) => (
                            <div key={i} className="h-8 bg-slate-700/50 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-6 border border-red-900/30">
                <h3 className="text-lg font-semibold text-slate-200 mb-2">⏰ Dayparting</h3>
                <p className="text-sm text-red-400">{error}</p>
            </div>
        );
    }

    // Calculate ranges for color scale
    const hourValues = hourlyAggregated.map(h => metric === 'cpa' ? h.cpa : metric === 'conversions' ? h.conversions : h.roas).filter(v => v !== null) as number[];
    const dayValues = dailyAggregated.map(d => metric === 'cpa' ? d.cpa : metric === 'conversions' ? d.conversions : d.roas).filter(v => v !== null) as number[];

    const hourMin = Math.min(...hourValues, 0);
    const hourMax = Math.max(...hourValues, 1);
    const dayMin = Math.min(...dayValues, 0);
    const dayMax = Math.max(...dayValues, 1);

    return (
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-200">
                    ⏰ {language === 'en' ? 'Dayparting Analysis' : 'Анализ по Часове/Дни'}
                </h3>
                <div className="flex gap-2">
                    <div className="flex bg-slate-700/50 rounded-lg p-0.5">
                        <button
                            onClick={() => setView('hour')}
                            className={`px-2 py-1 text-xs rounded ${view === 'hour' ? 'bg-violet-500/30 text-violet-300' : 'text-slate-400'}`}
                        >
                            {language === 'en' ? 'Hours' : 'Часове'}
                        </button>
                        <button
                            onClick={() => setView('day')}
                            className={`px-2 py-1 text-xs rounded ${view === 'day' ? 'bg-violet-500/30 text-violet-300' : 'text-slate-400'}`}
                        >
                            {language === 'en' ? 'Days' : 'Дни'}
                        </button>
                    </div>
                    <div className="flex bg-slate-700/50 rounded-lg p-0.5">
                        {(['roas', 'conversions', 'cpa'] as const).map(m => (
                            <button
                                key={m}
                                onClick={() => setMetric(m)}
                                className={`px-2 py-1 text-xs rounded ${metric === m ? 'bg-violet-500/30 text-violet-300' : 'text-slate-400'}`}
                            >
                                {m.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {view === 'hour' ? (
                <div>
                    <div className="grid grid-cols-12 gap-1 mb-1">
                        {hourlyAggregated.slice(0, 12).map(h => (
                            <div
                                key={h.hour}
                                className={`${getHeatColor(
                                    metric === 'cpa' ? h.cpa : metric === 'conversions' ? h.conversions : h.roas,
                                    hourMin, hourMax, metric === 'cpa'
                                )} rounded p-2 text-center transition-all hover:scale-105`}
                                title={`${String(h.hour).padStart(2, '0')}:00 - ROAS: ${h.roas?.toFixed(2) || '—'}, Conv: ${h.conversions.toFixed(1)}`}
                            >
                                <div className="text-[9px] text-slate-400">{String(h.hour).padStart(2, '0')}</div>
                                <div className="text-xs font-bold text-slate-200">
                                    {metric === 'cpa' ? (h.cpa?.toFixed(0) || '—') :
                                        metric === 'conversions' ? h.conversions.toFixed(0) :
                                            (h.roas?.toFixed(1) || '—')}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-12 gap-1">
                        {hourlyAggregated.slice(12, 24).map(h => (
                            <div
                                key={h.hour}
                                className={`${getHeatColor(
                                    metric === 'cpa' ? h.cpa : metric === 'conversions' ? h.conversions : h.roas,
                                    hourMin, hourMax, metric === 'cpa'
                                )} rounded p-2 text-center transition-all hover:scale-105`}
                                title={`${String(h.hour).padStart(2, '0')}:00 - ROAS: ${h.roas?.toFixed(2) || '—'}, Conv: ${h.conversions.toFixed(1)}`}
                            >
                                <div className="text-[9px] text-slate-400">{String(h.hour).padStart(2, '0')}</div>
                                <div className="text-xs font-bold text-slate-200">
                                    {metric === 'cpa' ? (h.cpa?.toFixed(0) || '—') :
                                        metric === 'conversions' ? h.conversions.toFixed(0) :
                                            (h.roas?.toFixed(1) || '—')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-7 gap-2">
                    {dailyAggregated.map(d => (
                        <div
                            key={d.day}
                            className={`${getHeatColor(
                                metric === 'cpa' ? d.cpa : metric === 'conversions' ? d.conversions : d.roas,
                                dayMin, dayMax, metric === 'cpa'
                            )} rounded p-3 text-center transition-all hover:scale-105`}
                            title={`${d.day} - ROAS: ${d.roas?.toFixed(2) || '—'}, Conv: ${d.conversions.toFixed(1)}, CPA: €${d.cpa?.toFixed(2) || '—'}`}
                        >
                            <div className="text-xs text-slate-300 font-medium">{DAY_LABELS[language][d.day]}</div>
                            <div className="text-lg font-bold text-slate-100 mt-1">
                                {metric === 'cpa' ? `€${d.cpa?.toFixed(0) || '—'}` :
                                    metric === 'conversions' ? d.conversions.toFixed(0) :
                                        (d.roas?.toFixed(1) || '—')}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                                €{d.cost.toFixed(0)} {language === 'en' ? 'spent' : 'разход'}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Legend */}
            <div className="mt-4 flex items-center justify-between text-[10px] text-slate-500">
                <div className="flex items-center gap-2">
                    <span>{metric === 'cpa' ? (language === 'en' ? 'Lower is better' : 'По-ниско = по-добре') : (language === 'en' ? 'Higher is better' : 'По-високо = по-добре')}</span>
                </div>
                <div className="flex gap-1">
                    <div className="w-4 h-3 bg-red-500/40 rounded"></div>
                    <div className="w-4 h-3 bg-orange-500/40 rounded"></div>
                    <div className="w-4 h-3 bg-amber-500/40 rounded"></div>
                    <div className="w-4 h-3 bg-emerald-500/40 rounded"></div>
                    <div className="w-4 h-3 bg-emerald-500/60 rounded"></div>
                </div>
            </div>
        </div>
    );
}
