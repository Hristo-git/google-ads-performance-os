"use client";

import React, { useState } from 'react';

export interface TodoItem {
    task: string;
    impact?: 'High' | 'Medium' | 'Low' | string;
    timeframe?: 'Immediate' | 'Short-term' | 'Medium-term' | string;
    category?: string;
    framework?: string;
    estimated_lift?: string;
    effort?: 'Low' | 'Medium' | 'High' | string;
}

interface Props {
    items: TodoItem[];
    language: 'bg' | 'en';
}

const IMPACT_STYLES: Record<string, string> = {
    High: 'bg-red-500/20 text-red-300 border-red-500/30',
    Medium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    Low: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

const TIMEFRAME_ORDER: Record<string, number> = {
    Immediate: 0,
    'Short-term': 1,
    'Medium-term': 2,
};

export default function ActionChecklist({ items, language }: Props) {
    const [done, setDone] = useState<Set<number>>(new Set());
    const isEn = language === 'en';

    const toggle = (idx: number) => {
        setDone(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    const sorted = [...items]
        .map((it, i) => ({ it, i }))
        .sort((a, b) => {
            const ta = TIMEFRAME_ORDER[a.it.timeframe || ''] ?? 99;
            const tb = TIMEFRAME_ORDER[b.it.timeframe || ''] ?? 99;
            if (ta !== tb) return ta - tb;
            const ia = a.it.impact === 'High' ? 0 : a.it.impact === 'Medium' ? 1 : 2;
            const ib = b.it.impact === 'High' ? 0 : b.it.impact === 'Medium' ? 1 : 2;
            return ia - ib;
        });

    const completed = done.size;
    const total = items.length;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-slate-400">
                <span>
                    {completed} / {total} {isEn ? 'completed' : 'завършени'}
                </span>
                <div className="w-32 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                        className="bg-gradient-to-r from-violet-500 to-pink-500 h-full transition-all"
                        style={{ width: total ? `${(completed / total) * 100}%` : '0%' }}
                    />
                </div>
            </div>

            <ul className="space-y-2 not-prose">
                {sorted.map(({ it, i }) => {
                    const isDone = done.has(i);
                    const impactClass = IMPACT_STYLES[it.impact || ''] || IMPACT_STYLES.Low;
                    return (
                        <li
                            key={i}
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                                isDone
                                    ? 'bg-slate-900/40 border-slate-800/50 opacity-60'
                                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                            }`}
                        >
                            <button
                                onClick={() => toggle(i)}
                                className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                                    isDone
                                        ? 'bg-violet-600 border-violet-600'
                                        : 'border-slate-600 hover:border-violet-400'
                                }`}
                                aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
                            >
                                {isDone && (
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>

                            <div className="flex-1 min-w-0">
                                <p className={`text-sm leading-relaxed ${isDone ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                                    {it.task}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                                    {it.impact && (
                                        <span className={`px-2 py-0.5 rounded border ${impactClass}`}>
                                            {it.impact}
                                        </span>
                                    )}
                                    {it.timeframe && (
                                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                            {it.timeframe}
                                        </span>
                                    )}
                                    {it.category && (
                                        <span className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
                                            {it.category}
                                        </span>
                                    )}
                                    {it.framework && (
                                        <span className="px-2 py-0.5 rounded bg-pink-500/10 text-pink-300 border border-pink-500/20">
                                            {it.framework}
                                        </span>
                                    )}
                                    {it.effort && (
                                        <span className="text-slate-500">
                                            {isEn ? 'Effort:' : 'Усилие:'} {it.effort}
                                        </span>
                                    )}
                                    {it.estimated_lift && (
                                        <span className="text-emerald-400">
                                            ↑ {it.estimated_lift}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
