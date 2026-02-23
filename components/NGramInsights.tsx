"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Layers, TrendingUp, TrendingDown, MinusCircle, Check, BarChart2, Circle, X, Maximize2 } from 'lucide-react';
import { buildNGrams, type NGram } from '@/lib/account-health';
import { fmtNum, fmtInt, fmtEuro, fmtX } from '@/lib/format';

interface NGramInsightsProps {
    searchTerms: any[];
    loading?: boolean;
}

// ---------- Brand / Dimension classification ----------
const BRAND_WORDS = ['виденов', 'videnov', 'vellea', 'вилеа', 'videhov'];
function classifyGram(gram: string): 'Brand' | 'Non-brand' | 'Dimension' {
    const lower = gram.toLowerCase();
    if (BRAND_WORDS.some(b => lower.includes(b))) return 'Brand';
    if (/^\d[\d\s,.*x×]*$/.test(gram.trim())) return 'Dimension';
    return 'Non-brand';
}

// ---------- ROAS color ----------
function roasClass(roas: number | null): string {
    if (!roas) return 'text-slate-500 bg-slate-700/30';
    if (roas >= 15) return 'text-emerald-400 bg-emerald-400/10';
    if (roas >= 8)  return 'text-cyan-400   bg-cyan-400/10';
    if (roas >= 3)  return 'text-amber-400  bg-amber-400/10';
    return 'text-red-400 bg-red-400/10';
}

function roasText(roas: number | null) {
    return fmtX(roas);
}

type TabType     = 'winning' | 'wasteful';
type SizeFilter  = 0 | 1 | 2 | 3;
type TypeFilter  = 'all' | 'Brand' | 'Non-brand' | 'Dimension';
type SortKey     = 'conversions' | 'roas' | 'cost' | 'cpa' | 'termCount';
type ViewDisplay = 'table' | 'bubble';

// ---------- Bubble chart ----------
function BubbleChart({ data, typeFilter, fullscreen = false }: { data: (NGram & { gramType: string })[]; typeFilter: TypeFilter; fullscreen?: boolean }) {
    const [hovered, setHovered] = useState<string | null>(null);

    const W   = fullscreen ? 1500 : 700;
    const H   = fullscreen ? 680  : 320;
    const PAD = fullscreen ? 68   : 44;
    const MIN_R = fullscreen ? 10 : 6;
    const MAX_R = fullscreen ? 52 : 28;

    const visible = data.filter(g => g.cost > 0 || g.conversions > 0).slice(0, fullscreen ? 60 : 40);
    if (!visible.length) return <div className="p-8 text-center text-slate-500 italic">Няма данни за bubble chart.</div>;

    const maxConv  = Math.max(...visible.map(g => g.conversions), 1);
    const maxRoas  = Math.max(...visible.map(g => g.roas ?? 0), 1);
    const maxCost  = Math.max(...visible.map(g => g.cost), 1);

    const typeColor: Record<string, string> = {
        'Brand':     '#8b5cf6',
        'Non-brand': '#10b981',
        'Dimension': '#f59e0b',
    };

    const xPos = (g: NGram) => PAD + ((g.conversions / maxConv) ** 0.6) * (W - 2 * PAD);
    const yPos = (g: NGram) => H - PAD - (((g.roas ?? 0) / maxRoas) ** 0.7) * (H - 2 * PAD);
    const rPos = (g: NGram) => MIN_R + ((g.cost / maxCost) ** 0.5) * (MAX_R - MIN_R);

    const fz = {
        axis:    fullscreen ? 13 : 8,
        label:   fullscreen ? 12 : 7,
        hover:   fullscreen ? 14 : 8.5,
        hover2:  fullscreen ? 12 : 7.5,
        tooltip: fullscreen ? 160 : 110,
        tooltipH: fullscreen ? 72 : 54,
    };

    return (
        <div className="relative w-full overflow-x-auto px-4 pb-2 pt-2">
            {/* Legend */}
            <div className={`flex items-center gap-4 mb-3 ${fullscreen ? 'text-sm' : 'text-xs'} text-slate-400`}>
                {Object.entries(typeColor).map(([t, c]) => (
                    <span key={t} className="flex items-center gap-1.5">
                        <span className={`${fullscreen ? 'w-3 h-3' : 'w-2 h-2'} rounded-full inline-block`} style={{ backgroundColor: c }} />
                        {t}
                    </span>
                ))}
                <span className="ml-auto opacity-50">Размер = Spend · X = Conv · Y = ROAS</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={fullscreen ? { height: 'calc(100vh - 200px)' } : { minWidth: 400, height: 260 }}>
                {/* Grid */}
                {[0.25, 0.5, 0.75, 1].map(t => (
                    <g key={t}>
                        <line x1={PAD} y1={H - PAD - t * (H - 2 * PAD)} x2={W - PAD} y2={H - PAD - t * (H - 2 * PAD)}
                            stroke="#1e293b" strokeWidth={fullscreen ? 1.5 : 1} />
                        <text x={PAD - 6} y={H - PAD - t * (H - 2 * PAD) + 4} fill="#475569" fontSize={fz.axis} textAnchor="end">
                            {fmtX(maxRoas * t)}
                        </text>
                    </g>
                ))}
                <text x={W / 2} y={H - 8} fill="#475569" fontSize={fz.axis} textAnchor="middle">Conversions →</text>
                <text x={12} y={H / 2} fill="#475569" fontSize={fz.axis} textAnchor="middle" transform={`rotate(-90,12,${H / 2})`}>ROAS →</text>

                {/* Bubbles */}
                {visible.map((g) => {
                    const gAny = g as any;
                    const color = typeColor[gAny.gramType] ?? '#64748b';
                    const isH = hovered === g.gram;
                    const cx = xPos(g), cy = yPos(g), rv = rPos(g);
                    // Clamp tooltip so it doesn't go off right edge
                    const tipX = cx + rv + 6 + fz.tooltip > W - 10 ? cx - rv - fz.tooltip - 10 : cx + rv + 6;
                    const tipY = Math.max(cy - 32, 8);
                    return (
                        <g key={g.gram} onMouseEnter={() => setHovered(g.gram)} onMouseLeave={() => setHovered(null)}
                            style={{ cursor: 'pointer' }}>
                            <circle
                                cx={cx} cy={cy} r={rv}
                                fill={color} fillOpacity={isH ? 0.9 : 0.45}
                                stroke={color} strokeWidth={isH ? (fullscreen ? 3 : 2) : 0.5} strokeOpacity={0.8}
                            />
                            {(rv > (fullscreen ? 18 : 14) || isH) && (
                                <text x={cx} y={cy + 4}
                                    fill="white" fontSize={isH ? fz.hover : fz.label} textAnchor="middle" fontWeight="bold"
                                    style={{ pointerEvents: 'none' }}>
                                    {g.gram.length > (fullscreen ? 12 : 8) ? g.gram.slice(0, fullscreen ? 11 : 7) + '…' : g.gram}
                                </text>
                            )}
                            {isH && (
                                <g>
                                    <rect x={tipX} y={tipY} width={fz.tooltip} height={fz.tooltipH} rx="5"
                                        fill="#0f172a" stroke={color} strokeWidth="1" strokeOpacity={0.7} />
                                    <text x={tipX + 10} y={tipY + 18} fill="white" fontSize={fz.hover} fontWeight="bold">{g.gram}</text>
                                    <text x={tipX + 10} y={tipY + 33} fill="#94a3b8" fontSize={fz.hover2}>Conv: {g.conversions} · ROAS: {roasText(g.roas)}</text>
                                    <text x={tipX + 10} y={tipY + 47} fill="#94a3b8" fontSize={fz.hover2}>Spend: {fmtEuro(g.cost, 0)} · {g.termCount} terms</text>
                                    <text x={tipX + 10} y={tipY + 61} fill={color} fontSize={fz.hover2} fontWeight="bold">{gAny.gramType}</text>
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ---------- Main component ----------
export default function NGramInsights({ searchTerms, loading }: NGramInsightsProps) {
    const [activeTab,       setActiveTab]       = useState<TabType>('winning');
    const [nSize,           setNSize]           = useState<SizeFilter>(0);
    const [typeFilter,      setTypeFilter]      = useState<TypeFilter>('all');
    const [sortKey,         setSortKey]         = useState<SortKey>('conversions');
    const [viewMode,        setViewMode]        = useState<ViewDisplay>('table');
    const [confirmed,       setConfirmed]       = useState<Set<string>>(new Set());
    const [bubbleFullscreen,setBubbleFullscreen]= useState(false);

    // ESC key closes fullscreen
    useEffect(() => {
        if (!bubbleFullscreen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setBubbleFullscreen(false); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [bubbleFullscreen]);

    // ---- Build + classify all n-grams ----
    const allNGrams = useMemo(() => {
        if (!searchTerms?.length) return [];
        return buildNGrams(searchTerms, 3, 2).map(g => ({
            ...g,
            gramType: classifyGram(g.gram),
        }));
    }, [searchTerms]);

    // ---- KPI values ----
    const kpi = useMemo(() => {
        if (!allNGrams.length) return null;
        const winning = allNGrams.filter(g => g.conversions > 0);
        const top     = [...winning].sort((a, b) => b.conversions - a.conversions)[0];

        const brandSpend    = allNGrams.filter(g => (g as any).gramType === 'Brand').reduce((s, g) => s + g.cost, 0);
        const nonBrandSpend = allNGrams.filter(g => (g as any).gramType === 'Non-brand').reduce((s, g) => s + g.cost, 0);
        const totalSpend    = brandSpend + nonBrandSpend || 1;
        const brandPct      = Math.round((brandSpend / totalSpend) * 100);

        const roasGrams     = winning.filter(g => g.roas);
        const avgRoas       = roasGrams.length
            ? roasGrams.reduce((s, g) => s + (g.roas ?? 0), 0) / roasGrams.length
            : 0;

        // Opportunity: best 2-gram non-brand by roas
        const opp = [...winning]
            .filter(g => (g as any).gramType !== 'Dimension' && g.n >= 2)
            .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))[0];

        return { top, brandPct, brandSpend, nonBrandSpend, avgRoas, roasCount: roasGrams.length, opp };
    }, [allNGrams]);

    // ---- Filtered + sorted table data ----
    const tableData = useMemo(() => {
        let data = allNGrams
            .filter(g => nSize === 0 || g.n === nSize)
            .filter(g => typeFilter === 'all' || (g as any).gramType === typeFilter);

        if (activeTab === 'winning') {
            data = data.filter(g => g.conversions > 0);
        } else {
            data = data.filter(g => g.conversions === 0 && g.cost > 2);
        }

        return [...data].sort((a, b) => {
            if (sortKey === 'cpa') {
                const ca = a.conversions > 0 ? a.cost / a.conversions : Infinity;
                const cb = b.conversions > 0 ? b.cost / b.conversions : Infinity;
                return ca - cb;
            }
            if (sortKey === 'roas') return (b.roas ?? 0) - (a.roas ?? 0);
            return (b[sortKey] as number) - (a[sortKey] as number);
        }).slice(0, 50);
    }, [allNGrams, activeTab, nSize, typeFilter, sortKey]);

    // ---- Spend share ----
    const maxSpend = useMemo(() => Math.max(...tableData.map(g => g.cost), 1), [tableData]);

    // ---- Insight text ----
    const insightText = useMemo(() => {
        if (!kpi) return null;
        if (activeTab === 'winning') {
            const topConv = kpi.top?.conversions ?? 0;
            const totalConv = allNGrams.reduce((s, g) => s + g.conversions, 0) / 3; // approx unique
            const pct = totalConv > 0 ? Math.round((topConv / totalConv) * 100) : 0;
            return `Top pattern "${kpi.top?.gram}" drives ${topConv} conversions. Brand terms represent ${kpi.brandPct}% of spend (${fmtEuro(kpi.brandSpend, 0)}) vs Non-brand ${fmtEuro(kpi.nonBrandSpend, 0)}.`;
        } else {
            const wasted = tableData.reduce((s, g) => s + g.cost, 0);
            return `${tableData.length} patterns wasted ${fmtEuro(wasted, 0)} with 0 conversions. Add the highest-spend ones as negatives to recover budget.`;
        }
    }, [activeTab, kpi, tableData, allNGrams]);

    // ---- TYPE badge ----
    const typeBadge = (t: string) => {
        if (t === 'Brand')     return <span className="text-xs px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 font-bold tracking-wide">BRAND</span>;
        if (t === 'Dimension') return <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/20  text-amber-300  font-bold tracking-wide">DIMENSION</span>;
        return                        <span className="text-xs px-2 py-0.5 rounded-md bg-slate-600/60   text-slate-400  font-bold tracking-wide">NON-BRAND</span>;
    };

    // ---- N badge ----
    const nBadge = (n: number) => {
        const cls = n === 1 ? 'bg-blue-500/15 text-blue-400' : n === 2 ? 'bg-violet-500/15 text-violet-400' : 'bg-emerald-500/15 text-emerald-400';
        return <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold ${cls}`}>{n}W</span>;
    };

    // ---- Loading / empty ----
    if (loading) return <div className="animate-pulse bg-slate-900/50 border border-slate-800 rounded-xl h-96" />;
    if (!searchTerms?.length) {
        return (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center">
                <Layers className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-white font-bold">Няма данни за търсени термини</p>
                <p className="text-slate-400 text-sm mt-1">Изберете по-дълъг период (Last 30 Days) за повече данни.</p>
            </div>
        );
    }

    return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">

            {/* ── Header ───────────────────────────────────── */}
            <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/60 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-500/10 text-violet-400 rounded-lg">
                        <Layers className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-white font-black leading-none tracking-tight">N-Gram Insights</h3>
                        <p className="text-xs text-slate-500 mt-0.5 uppercase tracking-widest">Search Term Pattern Analysis</p>
                    </div>
                </div>
                {/* Table / Bubble toggle */}
                <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700/50 gap-1">
                    <button onClick={() => setViewMode('table')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'table' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
                        <BarChart2 className="w-3.5 h-3.5" /> Table
                    </button>
                    <button onClick={() => { setViewMode('bubble'); setBubbleFullscreen(true); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'bubble' ? 'bg-violet-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
                        <Maximize2 className="w-3.5 h-3.5" /> Bubble
                    </button>
                </div>
            </div>

            {/* ── KPI Cards ────────────────────────────────── */}
            {kpi && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-800/50 border-b border-slate-800">
                    {/* Top Pattern */}
                    <div className="bg-slate-900/70 px-4 py-3">
                        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Top Pattern</p>
                        <p className="text-lg font-black text-white mt-1 tracking-tight">{kpi.top?.gram ?? '—'}</p>
                        <p className="text-sm text-slate-400 mt-0.5">
                            {kpi.top?.conversions} conv · {roasText(kpi.top?.roas ?? null)} ROAS
                        </p>
                    </div>
                    {/* Brand vs Non-brand */}
                    <div className="bg-slate-900/70 px-4 py-3">
                        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Brand vs Non-brand</p>
                        <p className="text-lg font-black text-violet-400 mt-1">{kpi.brandPct}% <span className="text-slate-400 font-normal text-sm">brand</span></p>
                        <p className="text-sm text-slate-400 mt-0.5">{fmtEuro(kpi.brandSpend, 0)} vs {fmtEuro(kpi.nonBrandSpend, 0)}</p>
                    </div>
                    {/* Avg ROAS */}
                    <div className="bg-slate-900/70 px-4 py-3">
                        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Avg ROAS</p>
                        <p className="text-lg font-black text-emerald-400 mt-1">{fmtX(kpi.avgRoas)}</p>
                        <p className="text-sm text-slate-400 mt-0.5">across {kpi.roasCount} patterns</p>
                    </div>
                    {/* Opportunity */}
                    <div className="bg-slate-900/70 px-4 py-3">
                        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Opportunity</p>
                        <p className="text-base font-black text-amber-400 mt-1 leading-tight">{kpi.opp?.gram ?? '—'}</p>
                        <p className="text-sm text-slate-400 mt-0.5">
                            {kpi.opp ? `${(kpi.opp as any).gramType}+category = ${roasText(kpi.opp.roas ?? null)} ROAS` : 'No 2-gram opportunity'}
                        </p>
                    </div>
                </div>
            )}

            {/* ── Tab + Filter bar ─────────────────────────── */}
            <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/30 flex flex-wrap items-center gap-3">
                {/* Tabs */}
                <div className="flex gap-1.5">
                    <button onClick={() => setActiveTab('winning')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${activeTab === 'winning' ? 'bg-emerald-500 text-white shadow' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                        <TrendingUp className="w-3 h-3" /> Печеливши
                    </button>
                    <button onClick={() => setActiveTab('wasteful')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${activeTab === 'wasteful' ? 'bg-red-500 text-white shadow' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                        <TrendingDown className="w-3 h-3" /> Губещи
                    </button>
                </div>

                <div className="w-px h-4 bg-slate-700" />

                {/* Size filter */}
                <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-slate-500 mr-1">Размер:</span>
                    {([0, 1, 2, 3] as SizeFilter[]).map(s => (
                        <button key={s} onClick={() => setNSize(s)}
                            className={`px-2 py-0.5 rounded font-bold transition-colors ${nSize === s ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                            {s === 0 ? 'ALL' : `${s}W`}
                        </button>
                    ))}
                </div>

                <div className="w-px h-4 bg-slate-700" />

                {/* Type filter */}
                <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-slate-500 mr-1">Тип:</span>
                    {(['all', 'Brand', 'Non-brand', 'Dimension'] as TypeFilter[]).map(t => (
                        <button key={t} onClick={() => setTypeFilter(t)}
                            className={`px-2 py-0.5 rounded font-bold transition-colors ${typeFilter === t
                                ? t === 'Brand' ? 'bg-violet-600 text-white' : t === 'Non-brand' ? 'bg-slate-600 text-white' : t === 'Dimension' ? 'bg-amber-600 text-white' : 'bg-slate-600 text-white'
                                : 'text-slate-500 hover:text-slate-300'}`}>
                            {t === 'all' ? 'All' : t}
                        </button>
                    ))}
                </div>

                <div className="ml-auto flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Sort:</span>
                    <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
                        className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-2.5 py-1.5 focus:ring-violet-500 focus:border-violet-500">
                        <option value="conversions">Conversions</option>
                        <option value="roas">ROAS</option>
                        <option value="cost">Spend</option>
                        <option value="termCount">Terms</option>
                        <option value="cpa">CPA</option>
                    </select>
                </div>
            </div>

            {/* ── Content ──────────────────────────────────── */}
            <div className="min-h-[360px]">
                {viewMode === 'bubble' ? (
                    <BubbleChart data={tableData as any} typeFilter={typeFilter} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-800 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                                    <th className="px-4 py-3 w-48">Pattern / Phrase</th>
                                    <th className="px-3 py-3">Size</th>
                                    <th className="px-3 py-3">Type</th>
                                    <th className="px-3 py-3 text-right">Terms</th>
                                    <th className="px-4 py-3">Spend (Share)</th>
                                    <th className="px-3 py-3 text-right">Conversions</th>
                                    <th className="px-3 py-3 text-right">ROAS</th>
                                    <th className="px-3 py-3 text-right">CPA</th>
                                    {activeTab === 'wasteful' && <th className="px-3 py-3" />}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                                {tableData.map((g, idx) => {
                                    const gAny = g as any;
                                    const spendShare = (g.cost / maxSpend) * 100;
                                    const cpa = g.conversions > 0 ? g.cost / g.conversions : null;
                                    const isConfirmed = confirmed.has(g.gram);

                                    return (
                                        <tr key={idx} className="hover:bg-slate-800/25 transition-colors group">
                                            <td className="px-4 py-3 font-bold text-slate-200">{g.gram}</td>
                                            <td className="px-3 py-3">{nBadge(g.n)}</td>
                                            <td className="px-3 py-3">{typeBadge(gAny.gramType)}</td>
                                            <td className="px-3 py-3 text-right text-slate-400 tabular-nums">{fmtInt(g.termCount)}</td>
                                            <td className="px-4 py-3 min-w-[140px]">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden" style={{ minWidth: 60 }}>
                                                        <div className="h-full rounded-full bg-indigo-500/60"
                                                            style={{ width: `${spendShare}%` }} />
                                                    </div>
                                                    <span className="text-slate-300 tabular-nums text-sm">{fmtEuro(g.cost, 0)}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <span className={g.conversions > 0 ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
                                                    {g.conversions > 0 ? fmtNum(g.conversions, 1) : '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <span className={`px-2 py-0.5 rounded text-sm font-bold ${roasClass(g.roas)}`}>
                                                    {roasText(g.roas)}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-right text-slate-400 tabular-nums">
                                                {cpa ? fmtEuro(cpa, 1) : '—'}
                                            </td>
                                            {activeTab === 'wasteful' && (
                                                <td className="px-3 py-3">
                                                    {isConfirmed ? (
                                                        <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                                                            <Check className="w-3 h-3" /> Added
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => setConfirmed(prev => new Set([...prev, g.gram]))}
                                                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-2 py-1 rounded transition-all">
                                                            <MinusCircle className="w-3 h-3" /> Add as Negative
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {tableData.length === 0 && (
                            <div className="p-10 text-center text-slate-500 italic">Няма намерени съвпадения.</div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Insight box ──────────────────────────────── */}
            {insightText && (
                <div className="mx-4 mb-4 mt-1 px-4 py-3.5 bg-indigo-500/8 border border-indigo-500/20 rounded-xl text-sm text-slate-300 leading-relaxed">
                    <span className="text-indigo-400 font-bold mr-1.5">💡 Insight:</span>
                    {insightText}
                </div>
            )}

            {/* ── Footer ───────────────────────────────────── */}
            <div className="px-4 py-2 border-t border-slate-800 bg-slate-900/60 text-xs text-slate-600 flex justify-between">
                <span>{allNGrams.length} total patterns · {tableData.length} показани</span>
                <span>1W = unigram · 2W = bigram · 3W = trigram</span>
            </div>

            {/* ── Bubble Fullscreen Overlay ─────────────────── */}
            {bubbleFullscreen && (
                <div className="fixed inset-0 z-[9999] bg-slate-950/97 backdrop-blur-md flex flex-col" style={{ backdropFilter: 'blur(8px)' }}>
                    {/* Overlay header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-violet-500/10 text-violet-400 rounded-lg">
                                <Circle className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-white font-black text-lg leading-none">N-Gram Bubble Chart</h2>
                                <p className="text-slate-400 text-sm mt-0.5">X = Conversions · Y = ROAS · Размер = Spend</p>
                            </div>
                        </div>
                        {/* Filters in overlay header */}
                        <div className="flex items-center gap-3 text-sm">
                            <span className="text-slate-500">Размер:</span>
                            {([0, 1, 2, 3] as SizeFilter[]).map(s => (
                                <button key={s} onClick={() => setNSize(s)}
                                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${nSize === s ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300 bg-slate-800'}`}>
                                    {s === 0 ? 'ALL' : `${s}W`}
                                </button>
                            ))}
                            <div className="w-px h-5 bg-slate-700 mx-1" />
                            <span className="text-slate-500">Тип:</span>
                            {(['all', 'Brand', 'Non-brand', 'Dimension'] as TypeFilter[]).map(t => (
                                <button key={t} onClick={() => setTypeFilter(t)}
                                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${typeFilter === t
                                        ? t === 'Brand' ? 'bg-violet-600 text-white' : t === 'Non-brand' ? 'bg-slate-600 text-white' : t === 'Dimension' ? 'bg-amber-600 text-white' : 'bg-slate-600 text-white'
                                        : 'text-slate-500 hover:text-slate-300 bg-slate-800'}`}>
                                    {t === 'all' ? 'All' : t}
                                </button>
                            ))}
                            <div className="w-px h-5 bg-slate-700 mx-1" />
                            <button
                                onClick={() => { setBubbleFullscreen(false); setViewMode('table'); }}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-sm font-bold transition-all">
                                <X className="w-4 h-4" /> Затвори
                            </button>
                        </div>
                    </div>
                    {/* Chart fills remaining height */}
                    <div className="flex-1 flex flex-col justify-center px-6 pb-4 min-h-0">
                        <BubbleChart data={tableData as any} typeFilter={typeFilter} fullscreen />
                    </div>
                    {/* ESC hint */}
                    <div className="shrink-0 px-6 pb-3 text-xs text-slate-700 text-center">
                        Натисни ESC за затваряне · {tableData.length} patterns
                    </div>
                </div>
            )}
        </div>
    );
}
