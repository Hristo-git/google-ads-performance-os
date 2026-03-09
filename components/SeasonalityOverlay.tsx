"use client";

import { useState, useEffect, useCallback } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import { fmtEuro, fmtNum, fmtX } from "@/lib/format";

type Metric = "cost" | "conversionValue" | "conversions" | "roas";

interface DayStat {
    date: string;
    cost: number;
    conversions: number;
    conversionValue: number;
    clicks: number;
    impressions: number;
}

interface ChartPoint {
    day: number;
    current?: number;
    prev?: number;
    yoy?: number;
}

const METRIC_LABELS: Record<Metric, string> = {
    cost: "Spend",
    conversionValue: "Conv. Value",
    conversions: "Conversions",
    roas: "ROAS",
};

function getValue(stat: DayStat, metric: Metric): number {
    if (metric === "roas") {
        return stat.cost > 0 ? stat.conversionValue / stat.cost : 0;
    }
    return stat[metric];
}

function formatYAxis(metric: Metric, value: number): string {
    if (metric === "cost" || metric === "conversionValue") return fmtEuro(value, 0);
    if (metric === "roas") return fmtX(value);
    return fmtNum(value, 0);
}

function formatTooltipValue(metric: Metric, value: number): string {
    if (metric === "cost" || metric === "conversionValue") return fmtEuro(value, 2);
    if (metric === "roas") return fmtX(value);
    return fmtNum(value, 1);
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
}

function subtractDays(dateStr: string, days: number): string {
    return addDays(dateStr, -days);
}

function subtractYears(dateStr: string, years: number): string {
    const d = new Date(dateStr);
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString().split("T")[0];
}

async function fetchDailyStats(
    customerId: string,
    startDate: string,
    endDate: string
): Promise<DayStat[]> {
    const params = new URLSearchParams({ customerId, startDate, endDate });
    const res = await fetch(`/api/google-ads/daily-stats?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.dailyStats || [];
}

interface Props {
    customerId: string;
    dateRange: { start: string; end: string };
}

export default function SeasonalityOverlay({ customerId, dateRange }: Props) {
    const [metric, setMetric] = useState<Metric>("cost");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [chartData, setChartData] = useState<ChartPoint[]>([]);
    const [periodLabels, setPeriodLabels] = useState({ current: "", prev: "", yoy: "" });

    const load = useCallback(async () => {
        if (!customerId || !dateRange.start || !dateRange.end) return;
        setLoading(true);
        setError(null);

        try {
            const { start, end } = dateRange;
            const dayCount = Math.round(
                (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000
            ) + 1;

            // Previous period: same length, immediately before
            const prevEnd = subtractDays(start, 1);
            const prevStart = subtractDays(start, dayCount);

            // YoY: same period 1 year ago
            const yoyStart = subtractYears(start, 1);
            const yoyEnd = subtractYears(end, 1);

            const [current, prev, yoy] = await Promise.all([
                fetchDailyStats(customerId, start, end),
                fetchDailyStats(customerId, prevStart, prevEnd),
                fetchDailyStats(customerId, yoyStart, yoyEnd),
            ]);

            // Build chart points indexed by day number (1-based)
            const maxLen = Math.max(current.length, prev.length, yoy.length);
            const points: ChartPoint[] = Array.from({ length: maxLen }, (_, i) => ({
                day: i + 1,
                current: current[i] !== undefined ? getValue(current[i], metric) : undefined,
                prev: prev[i] !== undefined ? getValue(prev[i], metric) : undefined,
                yoy: yoy[i] !== undefined ? getValue(yoy[i], metric) : undefined,
            }));

            setChartData(points);
            setPeriodLabels({
                current: `${start} – ${end}`,
                prev: `${prevStart} – ${prevEnd}`,
                yoy: `${yoyStart} – ${yoyEnd}`,
            });
        } catch (e: any) {
            setError(e.message || "Failed to load data");
        } finally {
            setLoading(false);
        }
    }, [customerId, dateRange, metric]);

    useEffect(() => {
        load();
    }, [load]);

    // Summary stats
    const totalOf = (key: "current" | "prev" | "yoy") =>
        chartData.reduce((s, p) => s + (p[key] ?? 0), 0);

    const pctChange = (a: number, b: number) =>
        b > 0 ? ((a - b) / b) * 100 : null;

    const curTotal = totalOf("current");
    const prevTotal = totalOf("prev");
    const yoyTotal = totalOf("yoy");
    const vsPrev = pctChange(curTotal, prevTotal);
    const vsYoy = pctChange(curTotal, yoyTotal);

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-slate-400 font-medium">Metric:</span>
                {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
                    <button
                        key={m}
                        onClick={() => setMetric(m)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${metric === m
                            ? "bg-violet-600 border-violet-500 text-white"
                            : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                            }`}
                    >
                        {METRIC_LABELS[m]}
                    </button>
                ))}
            </div>

            {/* Summary cards */}
            {!loading && chartData.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { label: "Current Period", total: curTotal, sub: periodLabels.current, delta: null, color: "text-violet-400" },
                        { label: "Prev. Period", total: prevTotal, sub: periodLabels.prev, delta: vsPrev, color: "text-cyan-400" },
                        { label: "Same Period YoY", total: yoyTotal, sub: periodLabels.yoy, delta: vsYoy, color: "text-amber-400" },
                    ].map(({ label, total, sub, delta, color }) => (
                        <div key={label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                            <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${color}`}>{label}</div>
                            <div className="text-xl font-black text-white">
                                {metric === "roas"
                                    ? fmtX(total / Math.max(chartData.filter(p => p[label === "Current Period" ? "current" : label === "Prev. Period" ? "prev" : "yoy"] !== undefined).length, 1))
                                    : formatTooltipValue(metric, total)}
                            </div>
                            {delta !== null && (
                                <div className={`text-xs mt-0.5 font-medium ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                    {delta >= 0 ? "+" : ""}{delta.toFixed(1)}% vs current
                                </div>
                            )}
                            <div className="text-[10px] text-slate-500 mt-1">{sub}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Chart */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                {loading && (
                    <div className="h-72 flex items-center justify-center text-slate-400 text-sm">
                        Loading data...
                    </div>
                )}
                {error && (
                    <div className="h-72 flex items-center justify-center text-red-400 text-sm">
                        {error}
                    </div>
                )}
                {!loading && !error && chartData.length === 0 && (
                    <div className="h-72 flex items-center justify-center text-slate-500 text-sm">
                        No data for the selected period.
                    </div>
                )}
                {!loading && !error && chartData.length > 0 && (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis
                                dataKey="day"
                                tick={{ fill: "#94a3b8", fontSize: 11 }}
                                tickLine={false}
                                axisLine={{ stroke: "#334155" }}
                                label={{ value: "Day", position: "insideBottomRight", offset: -4, fill: "#64748b", fontSize: 11 }}
                            />
                            <YAxis
                                tick={{ fill: "#94a3b8", fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(v) => formatYAxis(metric, v)}
                                width={60}
                            />
                            <Tooltip
                                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                                labelStyle={{ color: "#94a3b8" }}
                                labelFormatter={(v) => `Day ${v}`}
                                formatter={(value: any, name: string) => [
                                    formatTooltipValue(metric, value),
                                    name === "current" ? `Current (${periodLabels.current})`
                                        : name === "prev" ? `Prev. Period (${periodLabels.prev})`
                                            : `YoY (${periodLabels.yoy})`,
                                ]}
                            />
                            <Legend
                                formatter={(value) =>
                                    value === "current" ? `Current (${periodLabels.current})`
                                        : value === "prev" ? `Prev. Period (${periodLabels.prev})`
                                            : `YoY (${periodLabels.yoy})`
                                }
                                wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
                            />
                            <Line
                                type="monotone"
                                dataKey="current"
                                stroke="#8b5cf6"
                                strokeWidth={2.5}
                                dot={false}
                                activeDot={{ r: 4 }}
                                connectNulls={false}
                            />
                            <Line
                                type="monotone"
                                dataKey="prev"
                                stroke="#22d3ee"
                                strokeWidth={1.5}
                                strokeDasharray="4 2"
                                dot={false}
                                activeDot={{ r: 4 }}
                                connectNulls={false}
                            />
                            <Line
                                type="monotone"
                                dataKey="yoy"
                                stroke="#f59e0b"
                                strokeWidth={1.5}
                                strokeDasharray="6 3"
                                dot={false}
                                activeDot={{ r: 4 }}
                                connectNulls={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>

            <p className="text-xs text-slate-600">
                X-axis: normalized day index (Day 1 = first day of each period). All three periods aligned for direct comparison.
            </p>
        </div>
    );
}
