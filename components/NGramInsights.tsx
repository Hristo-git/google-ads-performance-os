"use client";

import React, { useState, useMemo } from 'react';
import {
    Search,
    TrendingUp,
    TrendingDown,
    MinusCircle,
    PlusCircle,
    Layers,
    ArrowUpDown
} from 'lucide-react';
import { buildNGrams, findNegativeCandidates, findExpansionCandidates, type NGram } from '@/lib/account-health';

interface NGramInsightsProps {
    searchTerms: any[];
    loading?: boolean;
}

export default function NGramInsights({ searchTerms, loading }: NGramInsightsProps) {
    const [activeTab, setActiveTab] = useState<'winning' | 'wasteful' | 'negatives' | 'expansion'>('winning');
    const [nSize, setNSize] = useState<number>(0); // 0 for all, 1, 2, 3

    const allNGrams = useMemo(() => {
        if (!searchTerms || searchTerms.length === 0) return [];
        return buildNGrams(searchTerms, 3, 2);
    }, [searchTerms]);

    const filteredNGrams = useMemo(() => {
        let grams = allNGrams;
        if (nSize > 0) grams = grams.filter(g => g.n === nSize);
        return grams;
    }, [allNGrams, nSize]);

    const winningGrams = useMemo(() =>
        filteredNGrams.filter(g => g.conversions > 0).sort((a, b) => b.conversions - a.conversions).slice(0, 30),
        [filteredNGrams]);

    const wastefulGrams = useMemo(() =>
        filteredNGrams.filter(g => g.conversions === 0 && g.cost > 2).sort((a, b) => b.cost - a.cost).slice(0, 30),
        [filteredNGrams]);

    const negativeCandidates = useMemo(() =>
        findNegativeCandidates(allNGrams, 1.0, 2).slice(0, 30),
        [allNGrams]);

    const expansionCandidates = useMemo(() =>
        findExpansionCandidates(allNGrams).slice(0, 30),
        [allNGrams]);

    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const sortData = (data: NGram[]) => {
        if (!sortConfig) return data;

        return [...data].sort((a, b) => {
            let aValue = a[sortConfig.key as keyof NGram] ?? 0;
            let bValue = b[sortConfig.key as keyof NGram] ?? 0;

            // Handle calculated fields if needed, or ensure type safety
            if (sortConfig.key === 'cpa') {
                aValue = a.conversions > 0 ? a.cost / a.conversions : Infinity;
                bValue = b.conversions > 0 ? b.cost / b.conversions : Infinity;
            }

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    };

    if (loading) {
        return <div className="animate-pulse bg-slate-900/50 border border-slate-800 rounded-xl h-96"></div>;
    }

    if (!searchTerms || searchTerms.length === 0) {
        return (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center">
                <Search className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                <h3 className="text-white font-bold">Няма данни за търсени термини</h3>
                <p className="text-slate-400 text-sm mt-1">Необходими са поне няколко търсени термина с импресии за N-gram анализ.</p>
                <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg inline-block">
                    <p className="text-[11px] text-blue-400">💡 <b>Съвет:</b> Опитайте да изберете по-дълъг период от време (напр. "Last 30 Days"), за да съберете повече статистически данни.</p>
                </div>
            </div>
        );
    }

    const SortIcon = ({ columnKey }: { columnKey: string }) => {
        if (sortConfig?.key !== columnKey) return <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-50" />;
        return sortConfig.direction === 'asc'
            ? <TrendingUp className="w-3 h-3 text-violet-400" /> // Using TrendingUp/Down as arrows for style matching or ArrowUp/Down
            : <TrendingDown className="w-3 h-3 text-violet-400" />;
    };

    const SortableHeader = ({ label, columnKey, tooltip }: { label: string, columnKey: string, tooltip?: string }) => (
        <th
            className="px-4 py-3 cursor-pointer hover:text-slate-300 transition-colors group"
            onClick={() => handleSort(columnKey)}
            title={tooltip}
        >
            <div className="flex items-center gap-1">
                {label}
                <SortIcon columnKey={columnKey} />
            </div>
        </th>
    );

    const Table = ({ data, type }: { data: NGram[], type: string }) => {
        const sortedData = useMemo(() => sortData(data), [data, sortConfig]);

        return (
            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                    <thead>
                        <tr className="border-b border-slate-800 text-slate-500 font-medium">
                            <th className="px-4 py-3">Pattern / Phrase</th>
                            <SortableHeader label="Terms" columnKey="termCount" />
                            <SortableHeader label="Spend" columnKey="cost" />
                            <SortableHeader label="Conv" columnKey="conversions" />
                            <SortableHeader label="ROAS" columnKey="roas" tooltip="Return On Ad Spend (Conversion Value / Cost). Shows '-' if conversion value is 0." />
                            <SortableHeader label="CPA" columnKey="cpa" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {sortedData.map((g, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                                <td className="px-4 py-3 font-medium text-slate-200">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] mr-2 ${g.n === 1 ? 'bg-blue-500/10 text-blue-400' : g.n === 2 ? 'bg-violet-500/10 text-violet-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                        {g.n}W
                                    </span>
                                    {g.gram}
                                </td>
                                <td className="px-4 py-3 text-slate-400">{g.termCount}</td>
                                <td className="px-4 py-3 text-slate-300">€{g.cost.toFixed(2)}</td>
                                <td className="px-4 py-3">
                                    <span className={g.conversions > 0 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                                        {g.conversions}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    {g.roas ? (
                                        <span className={`font-bold ${g.roas >= 3 ? 'text-emerald-400' : g.roas >= 1 ? 'text-blue-400' : 'text-amber-400'}`}>
                                            {g.roas.toFixed(1)}x
                                        </span>
                                    ) : <span className="text-slate-600" title="No conversion value data">-</span>}
                                </td>
                                <td className="px-4 py-3 text-slate-400">
                                    {g.conversions > 0 ? `€${(g.cost / g.conversions).toFixed(1)}` : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {data.length === 0 && (
                    <div className="p-8 text-center text-slate-500 italic">Няма намерени съвпадения за този филтър.</div>
                )}
            </div>
        );
    }

    return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
            {/* Header & Tabs */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-500/10 text-violet-400 rounded-lg">
                        <Layers className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold leading-none">N-Gram Insights</h3>
                        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Search Term Pattern Analysis</p>
                    </div>
                </div>

                <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700/50">
                    <button
                        onClick={() => { setActiveTab('winning'); setSortConfig(null); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'winning' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <TrendingUp className="w-3 h-3" /> Печеливши
                    </button>
                    <button
                        onClick={() => { setActiveTab('wasteful'); setSortConfig(null); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'wasteful' ? 'bg-red-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <TrendingDown className="w-3 h-3" /> Губещи
                    </button>
                    <button
                        onClick={() => { setActiveTab('negatives'); setSortConfig(null); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'negatives' ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <MinusCircle className="w-3 h-3" /> Negatives
                    </button>
                    <button
                        onClick={() => { setActiveTab('expansion'); setSortConfig(null); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'expansion' ? 'bg-violet-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <PlusCircle className="w-3 h-3" /> Expand
                    </button>
                </div>
            </div>

            {/* Filter Bar (for Winning/Wasteful) */}
            {(activeTab === 'winning' || activeTab === 'wasteful') && (
                <div className="px-4 py-2 border-b border-slate-800/50 bg-slate-900/20 flex gap-4">
                    <span className="text-[10px] text-slate-500 flex items-center">Размер (Words):</span>
                    {[0, 1, 2, 3].map(size => (
                        <button
                            key={size}
                            onClick={() => setNSize(size)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${nSize === size ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {size === 0 ? 'ALL' : `${size}W`}
                        </button>
                    ))}
                </div>
            )}

            {/* Content Display */}
            <div className="min-h-[400px]">
                {activeTab === 'winning' && <Table data={winningGrams} type="winning" />}
                {activeTab === 'wasteful' && <Table data={wastefulGrams} type="wasteful" />}
                {activeTab === 'negatives' && <Table data={negativeCandidates} type="negatives" />}
                {activeTab === 'expansion' && <Table data={expansionCandidates} type="expansion" />}
            </div>

            {/* Footer Summary */}
            <div className="p-3 bg-slate-900/60 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between items-center">
                <p>N-Gram анализът разбива търсените термини на фрази от 1, 2 и 3 думи, за да открие повтарящи се модели.</p>
                <p className="flex items-center gap-1"><ArrowUpDown className="w-3 h-3" /> Кликнете заглавията за сортиране</p>
            </div>
        </div>
    );
}
