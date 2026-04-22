"use client";

import React, { useEffect, useState, useCallback } from 'react';
import type { Campaign, AdGroup, AdWithStrength, ProfitabilityInputs } from '@/types/google-ads';
import CreativeAuditRenderer from './CreativeAuditRenderer';
import ProfitabilityInputsPanel from './ProfitabilityInputsPanel';
import { Loader2 } from 'lucide-react';

interface Props {
    campaigns: Campaign[];
    adGroups: AdGroup[];
    ads: AdWithStrength[];
    language: 'bg' | 'en';
    setLanguage: (lang: 'bg' | 'en') => void;
    customerId?: string;
    dateRange?: { start: string; end: string };
    userRole?: 'admin' | 'viewer';
}

type Model = 'opus-4.6' | 'sonnet-4.6' | 'sonnet-4.5' | 'haiku-4.5';

const MODEL_LABELS: Record<Model, string> = {
    'opus-4.6': 'Opus 4.6',
    'sonnet-4.6': 'Sonnet 4.6',
    'sonnet-4.5': 'Sonnet 4.5',
    'haiku-4.5': 'Haiku 4.5',
};

// Staleness threshold for profitability inputs (60 days)
const STALE_DAYS = 60;

export default function CreativeAuditPage({
    campaigns,
    adGroups,
    ads,
    language,
    setLanguage,
    customerId,
    dateRange,
    userRole,
}: Props) {
    const isEn = language === 'en';
    const isAdmin = userRole === 'admin';

    const [profit, setProfit] = useState<ProfitabilityInputs | null>(null);
    const [profitLoading, setProfitLoading] = useState(true);
    const [showProfitPanel, setShowProfitPanel] = useState(false);
    const [model, setModel] = useState<Model>('sonnet-4.6');
    const [audience, setAudience] = useState<'internal' | 'client'>('internal');
    const [generating, setGenerating] = useState(false);
    const [analysis, setAnalysis] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [lastRun, setLastRun] = useState<string | null>(null);

    // Load profitability inputs on mount or when customer changes
    useEffect(() => {
        if (!customerId) {
            setProfitLoading(false);
            return;
        }
        let cancelled = false;
        setProfitLoading(true);
        fetch(`/api/profitability-inputs?customerId=${encodeURIComponent(customerId)}`)
            .then(r => r.json())
            .then(json => {
                if (cancelled) return;
                const inputs: ProfitabilityInputs | null = json.inputs || null;
                setProfit(inputs);
                const stale = inputs?.updatedAt
                    ? (Date.now() - new Date(inputs.updatedAt).getTime()) / 86_400_000 > STALE_DAYS
                    : false;
                setShowProfitPanel(!inputs || stale);
            })
            .catch(err => console.error('[CreativeAudit] load profit inputs failed', err))
            .finally(() => {
                if (!cancelled) setProfitLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [customerId]);

    const handleProfitSaved = useCallback((saved: ProfitabilityInputs | null) => {
        setProfit(saved);
        setShowProfitPanel(false);
    }, []);

    const handleGenerate = useCallback(async () => {
        if (!customerId) {
            setError(isEn ? 'No customer selected' : 'Няма избран акаунт');
            return;
        }

        setGenerating(true);
        setError(null);
        setAnalysis('');

        try {
            // Fan out parallel fetches for creative assets
            const qs = `customerId=${encodeURIComponent(customerId)}${dateRange ? `&start=${dateRange.start}&end=${dateRange.end}` : ''}`;
            const [pmaxRes, displayRes, assetsRes] = await Promise.allSettled([
                fetch(`/api/google-ads/pmax-assets?${qs}`).then(r => (r.ok ? r.json() : null)),
                fetch(`/api/google-ads/display-ad-assets?${qs}`).then(r => (r.ok ? r.json() : null)),
                fetch(`/api/google-ads/assets?${qs}`).then(r => (r.ok ? r.json() : null)),
            ]);

            const pickArray = (res: PromiseSettledResult<any>): any[] => {
                if (res.status !== 'fulfilled' || !res.value) return [];
                const v = res.value;
                if (Array.isArray(v)) return v;
                if (Array.isArray(v.assets)) return v.assets;
                if (Array.isArray(v.data)) return v.data;
                if (Array.isArray(v.items)) return v.items;
                return [];
            };

            const dataPayload: any = {
                customerId,
                dateRange,
                campaigns,
                adGroups,
                ads,
                pmaxAssets: pickArray(pmaxRes),
                displayAdAssets: pickArray(displayRes),
                accountAssets: pickArray(assetsRes),
            };

            const res = await fetch('/api/reports/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateId: 'creative_ad_audit',
                    settings: {
                        model,
                        language,
                        audience,
                        expertMode: false,
                        rowLimit: 200,
                    },
                    data: dataPayload,
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                let msg: string;
                try {
                    const parsed = JSON.parse(text);
                    msg = parsed.error || `HTTP ${res.status}`;
                    if (parsed.details) msg += ` — ${parsed.details}`;
                } catch {
                    msg = `HTTP ${res.status}: ${text.slice(0, 200)}`;
                }
                throw new Error(msg);
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No stream');
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                setAnalysis(buffer);
            }

            setLastRun(new Date().toISOString());
        } catch (err: any) {
            setError(err?.message || (isEn ? 'Generation failed' : 'Грешка при генериране'));
        } finally {
            setGenerating(false);
        }
    }, [customerId, dateRange, campaigns, adGroups, ads, model, language, audience, isEn]);

    return (
        <main className="flex-1 overflow-hidden flex flex-col bg-slate-950">
            {/* Top bar */}
            <div className="border-b border-slate-800 bg-slate-900/60 px-6 py-4 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 mr-auto">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-white font-semibold">{isEn ? 'Creative Ad Audit' : 'Креативен одит'}</h2>
                        <p className="text-xs text-slate-400">
                            {isEn ? 'D2C creative + profitability audit with optimized rewrites' : 'D2C креативен + profitability одит с оптимизирани варианти'}
                        </p>
                    </div>
                </div>

                {/* Language toggle */}
                <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
                    <button
                        onClick={() => setLanguage('en')}
                        className={`px-3 py-1.5 ${language === 'en' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                    >
                        EN
                    </button>
                    <button
                        onClick={() => setLanguage('bg')}
                        className={`px-3 py-1.5 ${language === 'bg' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                    >
                        БГ
                    </button>
                </div>

                {/* Model selector */}
                <select
                    value={model}
                    onChange={e => setModel(e.target.value as Model)}
                    className="bg-slate-800 text-slate-200 text-xs rounded-lg px-3 py-1.5 border border-slate-700 focus:outline-none focus:border-violet-500"
                    disabled={generating}
                >
                    {(Object.keys(MODEL_LABELS) as Model[]).map(m => (
                        <option key={m} value={m}>{MODEL_LABELS[m]}</option>
                    ))}
                </select>

                {/* Audience */}
                <select
                    value={audience}
                    onChange={e => setAudience(e.target.value as 'internal' | 'client')}
                    className="bg-slate-800 text-slate-200 text-xs rounded-lg px-3 py-1.5 border border-slate-700 focus:outline-none focus:border-violet-500"
                    disabled={generating}
                >
                    <option value="internal">{isEn ? 'Internal' : 'Вътрешно'}</option>
                    <option value="client">{isEn ? 'Client' : 'Клиент'}</option>
                </select>

                <button
                    onClick={handleGenerate}
                    disabled={generating || !customerId || profitLoading}
                    className="px-4 py-1.5 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-400 text-white flex items-center gap-2 transition-colors"
                >
                    {generating && <Loader2 className="w-4 h-4 animate-spin" />}
                    {generating
                        ? (isEn ? 'Generating...' : 'Генериране...')
                        : (isEn ? 'Generate Audit' : 'Генерирай одит')}
                </button>
            </div>

            {/* Profitability inputs panel */}
            {showProfitPanel && customerId && (
                <ProfitabilityInputsPanel
                    customerId={customerId}
                    initial={profit}
                    language={language}
                    readOnly={!isAdmin}
                    onSaved={handleProfitSaved}
                    onClose={() => setShowProfitPanel(false)}
                />
            )}

            {!showProfitPanel && profit && (
                <div className="bg-slate-900/40 border-b border-slate-800 px-6 py-2 text-xs text-slate-400 flex items-center gap-4">
                    <span>
                        {isEn ? 'Profitability:' : 'Profitability:'}{' '}
                        <span className="text-slate-200">
                            AOV {profit.avgOrderValue ?? '—'} · CM2% {profit.cm2Percent ?? '—'} · LTV {profit.targetLtv ?? '—'} · CAC {profit.targetCac ?? '—'}
                        </span>
                    </span>
                    {isAdmin && (
                        <button onClick={() => setShowProfitPanel(true)} className="text-violet-400 hover:text-violet-300 underline">
                            {isEn ? 'Edit values' : 'Редактирай стойности'}
                        </button>
                    )}
                </div>
            )}

            {!showProfitPanel && !profit && !profitLoading && (
                <div className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-2 text-xs text-amber-300 flex items-center justify-between">
                    <span>
                        {isEn
                            ? 'No profitability inputs — Section 4 (Profitability Alignment) will be limited.'
                            : 'Няма profitability данни — Секция 4 (Profitability Alignment) ще бъде ограничена.'}
                    </span>
                    {isAdmin && (
                        <button onClick={() => setShowProfitPanel(true)} className="text-amber-200 hover:text-white underline">
                            {isEn ? 'Add values' : 'Добави стойности'}
                        </button>
                    )}
                </div>
            )}

            {/* Error banner */}
            {error && (
                <div className="bg-red-500/10 border-b border-red-500/30 px-6 py-2 text-sm text-red-300 flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-red-200 hover:text-white">✕</button>
                </div>
            )}

            {/* Content area */}
            <div className="flex-1 overflow-hidden">
                {analysis ? (
                    <CreativeAuditRenderer markdown={analysis} language={language} />
                ) : (
                    <div className="h-full flex items-center justify-center text-center text-slate-400 p-10">
                        <div className="max-w-md">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500/20 to-pink-500/20 flex items-center justify-center">
                                <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                            </div>
                            <h3 className="text-lg text-white font-semibold mb-2">
                                {isEn ? 'Ready to audit creatives' : 'Готови за креативен одит'}
                            </h3>
                            <p className="text-sm leading-relaxed">
                                {isEn
                                    ? 'Generates a 10-section D2C audit with 3–5 rewritten variations (PAS, BAB, Social Proof, Myth Breaker, Future State), profitability alignment, and a prioritized action list.'
                                    : 'Генерира 10-секционен D2C одит с 3-5 пренаписани варианта (PAS, BAB, Social Proof, Myth Breaker, Future State), profitability анализ и приоритизиран списък с действия.'}
                            </p>
                            {lastRun && (
                                <p className="text-xs text-slate-500 mt-4">
                                    {isEn ? 'Last run:' : 'Последно:'} {new Date(lastRun).toLocaleString()}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
