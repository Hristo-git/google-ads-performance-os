"use client";

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { REPORT_TEMPLATE_DEFINITIONS } from '@/lib/report-templates';
import type { Campaign, AdGroup, SearchTerm, KeywordWithQS, AdWithStrength, ReportTemplateId, ReportSettings, GeneratedReport, ReportTemplate } from '@/types/google-ads';

// Helper: Split analysis into two documents
function splitDocuments(markdown: string): { executive: string; technical: string; hasTwo: boolean } {
    const splitPatterns = [
        /---\s*\n##\s*DOCUMENT\s*2[:\s]/i,
        /---\s*\n##\s*ДОКУМЕНТ\s*2[:\s]/i,
        /##\s*DOCUMENT\s*2[:\s]/i,
        /##\s*ДОКУМЕНТ\s*2[:\s]/i,
        /---\s*\n###?\s*ТЕХНИЧЕСКИ АНАЛИЗ/i,
        /---\s*\n###?\s*TECHNICAL ANALYSIS/i,
    ];

    for (const pattern of splitPatterns) {
        const match = markdown.search(pattern);
        if (match > 0) {
            return {
                executive: markdown.substring(0, match).trim(),
                technical: markdown.substring(match).trim(),
                hasTwo: true,
            };
        }
    }

    return { executive: markdown, technical: '', hasTwo: false };
}

interface AIReportsHubProps {
    campaigns: Campaign[];
    adGroups: AdGroup[];
    searchTerms?: SearchTerm[];
    keywords?: KeywordWithQS[];
    ads?: AdWithStrength[];
    strategicBreakdown?: any;
    nGramAnalysis?: any;
    language: 'bg' | 'en';
    setLanguage: (lang: 'bg' | 'en') => void;
    customerId?: string;
    dateRange?: { start: string; end: string };
    userRole?: 'admin' | 'viewer';
}

export default function AIReportsHub({
    campaigns,
    adGroups,
    searchTerms = [],
    keywords = [],
    ads = [],
    strategicBreakdown,
    nGramAnalysis,
    language,
    setLanguage,
    customerId,
    dateRange,
    userRole,
}: AIReportsHubProps) {
    const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
    const [generating, setGenerating] = useState(false);
    const [currentReport, setCurrentReport] = useState<GeneratedReport | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [historySearchQuery, setHistorySearchQuery] = useState('');
    const [historyResults, setHistoryResults] = useState<any[]>([]);
    const [searchingHistory, setSearchingHistory] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [activeTab, setActiveTab] = useState<'executive' | 'technical'>('executive');
    const [historyLoaded, setHistoryLoaded] = useState(false);

    // Settings
    const [settings, setSettings] = useState<ReportSettings>({
        model: 'opus-4.6',
        language: language,
        audience: 'internal',
        expertMode: false,
        rowLimit: 200,
    });

    // Sync language setting
    useEffect(() => {
        setSettings(prev => ({ ...prev, language }));
    }, [language]);

    // Initial history load on toggle
    useEffect(() => {
        if (showHistory && !historyLoaded && customerId) {
            handleSearchHistory();
            setHistoryLoaded(true);
        }
    }, [showHistory, customerId, historyLoaded]);

    // Initial history load on mount/customerId change
    useEffect(() => {
        if (customerId) {
            handleSearchHistory();
            setHistoryLoaded(true);
        }
    }, [customerId]);

    const handleGenerateReport = async () => {
        if (!selectedTemplate) return;

        setGenerating(true);
        setError(null);

        try {
            // Prepare data based on template requirements
            let dataPayload: any = {
                customerId: customerId,
                dateRange: dateRange,
            };

            if (selectedTemplate.requiredData.includes('campaigns')) {
                dataPayload.campaigns = campaigns.slice(0, settings.rowLimit);
                dataPayload.strategicBreakdown = strategicBreakdown;
            }

            // On-demand fetch for ad groups when empty (account-level reports view)
            if (selectedTemplate.requiredData.includes('adGroups')) {
                if (adGroups.length === 0 && customerId) {
                    try {
                        console.log("[AIReports] Fetching ad groups on demand...");
                        const dateParams = dateRange ? `&startDate=${dateRange.start}&endDate=${dateRange.end}` : '';
                        const res = await fetch(`/api/google-ads/ad-groups?customerId=${customerId}&status=ENABLED${dateParams}`);
                        const agData = await res.json();
                        if (agData.adGroups?.length > 0) {
                            console.log(`[AIReports] Fetched ${agData.adGroups.length} ad groups on demand`);
                            dataPayload.adGroups = agData.adGroups.slice(0, settings.rowLimit);
                        } else {
                            dataPayload.adGroups = [];
                        }
                    } catch (e) {
                        console.warn("[AIReports] Failed to fetch ad groups on demand", e);
                        dataPayload.adGroups = [];
                    }
                } else {
                    dataPayload.adGroups = adGroups.slice(0, settings.rowLimit);
                }
            }

            if (selectedTemplate.requiredData.includes('searchTerms')) {
                dataPayload.searchTerms = searchTerms.slice(0, settings.rowLimit);
                dataPayload.nGramAnalysis = nGramAnalysis;
            }

            // On-demand fetch for keywords when empty (account-level reports view)
            if (selectedTemplate.requiredData.includes('keywords')) {
                if (keywords.length === 0 && customerId) {
                    try {
                        console.log("[AIReports] Fetching keywords on demand...");
                        const qsFilter = selectedTemplate.id === 'quality_score_diagnostics' ? '&maxQualityScore=5' : '';
                        const res = await fetch(`/api/google-ads/keywords?customerId=${customerId}${qsFilter}`);
                        const kwData = await res.json();
                        if (kwData.keywords?.length > 0) {
                            console.log(`[AIReports] Fetched ${kwData.keywords.length} keywords on demand`);
                            dataPayload.keywords = kwData.keywords.slice(0, settings.rowLimit);
                        } else {
                            dataPayload.keywords = [];
                        }
                    } catch (e) {
                        console.warn("[AIReports] Failed to fetch keywords on demand", e);
                        dataPayload.keywords = [];
                    }
                } else {
                    dataPayload.keywords = keywords.slice(0, settings.rowLimit);
                }
            }

            // On-demand fetch for ads when empty (account-level reports view)
            if (selectedTemplate.requiredData.includes('ads')) {
                if (ads.length === 0 && customerId) {
                    try {
                        console.log("[AIReports] Fetching ads on demand...");
                        const dateParams = dateRange ? `&startDate=${dateRange.start}&endDate=${dateRange.end}` : '';
                        const res = await fetch(`/api/google-ads/ads?customerId=${customerId}${dateParams}`);
                        const adsData = await res.json();
                        if (adsData.ads?.length > 0) {
                            console.log(`[AIReports] Fetched ${adsData.ads.length} ads on demand`);
                            dataPayload.ads = adsData.ads.slice(0, settings.rowLimit);
                        } else {
                            dataPayload.ads = [];
                        }
                    } catch (e) {
                        console.warn("[AIReports] Failed to fetch ads on demand", e);
                        dataPayload.ads = [];
                    }
                } else {
                    dataPayload.ads = ads.slice(0, settings.rowLimit);
                }
            }

            // Fetch context signals (device/geo/hour/day/auction/LP/conversions + PMax)
            if (customerId && dateRange) {
                try {
                    console.log("[AIReports] Fetching analysis context signals...");
                    const pmaxIds = (campaigns || [])
                        .filter((c: any) => c.advertisingChannelType === 'PERFORMANCE_MAX' || c.advertisingChannelType === 6)
                        .map((c: any) => c.id)
                        .filter(Boolean);
                    const pmaxParam = pmaxIds.length > 0 ? `&pmaxCampaignIds=${pmaxIds.join(',')}` : '';
                    const ctxRes = await fetch(
                        `/api/google-ads/analysis-context?customerId=${customerId}&startDate=${dateRange.start}&endDate=${dateRange.end}&language=${settings.language}${pmaxParam}`
                    );
                    if (ctxRes.ok) {
                        const ctxData = await ctxRes.json();
                        if (ctxData.contextBlock) dataPayload.contextBlock = ctxData.contextBlock;
                        if (ctxData.pmaxBlock) dataPayload.pmaxBlock = ctxData.pmaxBlock;
                        console.log(`[AIReports] Context signals loaded (${(ctxData.contextBlock || '').length} chars)`);
                    }
                } catch (e) {
                    console.warn("[AIReports] Failed to fetch context signals (non-blocking)", e);
                }
            }

            const response = await fetch('/api/reports/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    templateId: selectedTemplate.id,
                    settings,
                    data: dataPayload,
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                let errorMsg: string;
                try {
                    const errorData = JSON.parse(text);
                    errorMsg = errorData.error || `HTTP ${response.status}`;
                    if (errorData.details) errorMsg += ` — ${errorData.details}`;
                } catch {
                    errorMsg = `HTTP ${response.status}: ${text.slice(0, 200)}`;
                }
                throw new Error(errorMsg);
            }

            // Read streaming response (bypasses Vercel function timeout)
            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response stream available');

            const decoder = new TextDecoder();
            let analysis = '';

            const periodSuffix = dateRange ? ` (${dateRange.start} — ${dateRange.end})` : '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                analysis += decoder.decode(value, { stream: true });

                // Update report in real-time as chunks arrive
                setCurrentReport({
                    id: `${selectedTemplate.id}_${Date.now()}`,
                    templateId: selectedTemplate.id,
                    templateName: (settings.language === 'en' ? selectedTemplate.nameEN : selectedTemplate.nameBG) + periodSuffix,
                    timestamp: new Date().toISOString(),
                    analysis,
                    settings,
                });
            }
        } catch (err: any) {
            console.error('Report generation error:', err);
            setError(err.message || 'Failed to generate report');
        } finally {
            setGenerating(false);
        }
    };

    const handleDeleteReport = async (reportId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Don't open the report
        if (!confirm(language === 'en' ? 'Delete this report?' : 'Изтриване на този анализ?')) return;

        try {
            const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Delete failed');
            }
            setHistoryResults(prev => prev.filter(r => r.id !== reportId));
        } catch (err: any) {
            console.error('Delete report error:', err);
            setError(err.message || 'Failed to delete report');
        }
    };

    const handleSearchHistory = async () => {
        setSearchingHistory(true);
        try {
            const response = await fetch(`/api/reports/history?query=${encodeURIComponent(historySearchQuery)}&customerId=${customerId || ''}&limit=10`);
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            setHistoryResults(data.reports || []);
        } catch (err: any) {
            console.error('History search error:', err);
            setError('Failed to search history');
        } finally {
            setSearchingHistory(false);
        }
    };

    const handleViewHistoryReport = (report: any) => {
        const template = REPORT_TEMPLATE_DEFINITIONS.find(t => t.id === report.templateId);

        // Use reportTitle from Pinecone (includes model + period) with fallback to template name
        const fallbackName = settings.language === 'en' ? (template?.nameEN || 'Report') : (template?.nameBG || 'Анализ');
        const displayTitle = report.reportTitle || fallbackName;

        setCurrentReport({
            id: report.id,
            templateId: report.templateId as ReportTemplateId,
            templateName: displayTitle,
            timestamp: report.timestamp,
            analysis: report.analysis,
            settings: {
                ...settings,
                audience: report.audience as any,
            }
        });

        // Find and select the template to show context
        if (template) setSelectedTemplate(template);
    };

    // Reset tab when new report is loaded
    useEffect(() => {
        if (currentReport) {
            setActiveTab('executive');
        }
    }, [currentReport]);

    // Extract TODO list and split documents
    const { executive, technical, hasTwo, todoList } = React.useMemo(() => {
        if (!currentReport?.analysis) return { executive: '', technical: '', hasTwo: false, todoList: [] };

        const jsonMatch = currentReport.analysis.match(/```json\s*([\s\S]*?)\s*```/);
        let cleanAnalysis = currentReport.analysis;
        let todos: any[] = [];

        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                if (parsed.todos && Array.isArray(parsed.todos)) {
                    todos = parsed.todos;
                }
                cleanAnalysis = currentReport.analysis.replace(/```json[\s\S]*?```/, '').trim();
            } catch (e) {
                console.error("Failed to parse To-Do list", e);
            }
        }

        const { executive, technical, hasTwo } = splitDocuments(cleanAnalysis);
        return { executive, technical, hasTwo, todoList: todos };
    }, [currentReport]);

    const templatesByCategory = {
        quality: REPORT_TEMPLATE_DEFINITIONS.filter(t => t.category === 'quality'),
        efficiency: REPORT_TEMPLATE_DEFINITIONS.filter(t => t.category === 'efficiency'),
        insights: REPORT_TEMPLATE_DEFINITIONS.filter(t => t.category === 'insights'),
        structure: REPORT_TEMPLATE_DEFINITIONS.filter(t => t.category === 'structure'),
    };

    const categoryLabels = {
        quality: language === 'en' ? 'Quality & Performance' : 'Качество и представяне',
        efficiency: language === 'en' ? 'Budget & Efficiency' : 'Бюджет и ефективност',
        insights: language === 'en' ? 'Strategic Insights' : 'Стратегически прозрения',
        structure: language === 'en' ? 'Structure & Organization' : 'Структура и организация',
    };

    // ─── REPORT VIEW (full-width when a report is open) ───
    if (currentReport || error) {
        return (
            <div className="h-full flex flex-col bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-2xl">
                {error ? (
                    <div className="flex-1 flex items-center justify-center p-12">
                        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 max-w-lg shadow-xl">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-red-500/20 rounded-xl">
                                    <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <h4 className="text-red-400 font-bold mb-2 text-lg">
                                        {language === 'en' ? 'Analysis Error' : 'Грешка в анализа'}
                                    </h4>
                                    <p className="text-red-300/80 text-sm leading-relaxed">{error}</p>
                                    <button
                                        onClick={() => setError(null)}
                                        className="mt-4 text-xs font-bold text-red-400 uppercase tracking-widest hover:text-red-300 transition-colors"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : currentReport && (
                    <>
                        {/* Report Header */}
                        <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => { setCurrentReport(null); setSelectedTemplate(null); }}
                                    className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm font-medium"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    {language === 'en' ? 'Templates' : 'Шаблони'}
                                </button>
                                <div className="w-px h-6 bg-slate-700" />
                                <div className="w-10 h-10 bg-violet-600 rounded-lg flex items-center justify-center text-xl shadow-lg shadow-violet-900/20">
                                    {REPORT_TEMPLATE_DEFINITIONS.find(t => t.id === currentReport.templateId)?.icon || '📊'}
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white tracking-tight">{currentReport.templateName}</h2>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] bg-slate-700 text-slate-400 px-2 py-0.5 rounded font-bold uppercase">
                                            {currentReport.settings.audience}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {new Date(currentReport.timestamp).toLocaleString(language === 'en' ? 'en-US' : 'bg-BG')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Report Content */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[radial-gradient(circle_at_top_right,_rgba(124,58,237,0.03),_transparent)]">
                            {hasTwo && (
                                <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 px-8 py-3 z-10">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setActiveTab('executive')}
                                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'executive'
                                                ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/30'
                                                : 'text-slate-400 hover:text-white hover:bg-slate-700'
                                                }`}
                                        >
                                            {language === 'en' ? '📊 Executive Summary' : '📊 Резюме'}
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('technical')}
                                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'technical'
                                                ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/30'
                                                : 'text-slate-400 hover:text-white hover:bg-slate-700'
                                                }`}
                                        >
                                            {language === 'en' ? '🔧 Technical Analysis' : '🔧 Технически анализ'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="p-8">
                                <div className="max-w-4xl mx-auto space-y-12">
                                    <div className="api-content prose prose-invert prose-slate max-w-none prose-headings:tracking-tight prose-p:leading-relaxed prose-li:leading-relaxed">
                                        <ReactMarkdown>{hasTwo ? (activeTab === 'executive' ? executive : technical) : executive}</ReactMarkdown>
                                    </div>

                                    {todoList.length > 0 && (
                                        <div className="border-t border-slate-700 pt-10">
                                            <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                                <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center">
                                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                                    </svg>
                                                </div>
                                                {language === 'en' ? 'Actionable Roadmap' : 'Пътна карта за действие'}
                                            </h3>
                                            <div className="grid gap-4">
                                                {todoList.map((todo, idx) => (
                                                    <div key={idx} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 flex items-start gap-4 hover:border-violet-500/30 hover:bg-slate-700/30 transition-all duration-300 group shadow-lg">
                                                        <div className="mt-1">
                                                            <div className="w-6 h-6 flex items-center justify-center relative">
                                                                <input
                                                                    type="checkbox"
                                                                    className="peer w-6 h-6 rounded-lg border-2 border-slate-600 appearance-none bg-slate-900 cursor-pointer checked:bg-violet-600 checked:border-violet-600 transition-all"
                                                                />
                                                                <svg className="absolute w-4 h-4 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            </div>
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-slate-100 font-semibold leading-relaxed text-lg group-hover:text-white transition-colors">{todo.task}</p>
                                                            {todo.estimated_lift && (
                                                                <p className="text-sm text-violet-300/80 mt-1.5 italic">↗ {todo.estimated_lift}</p>
                                                            )}
                                                            <div className="flex flex-wrap gap-2 mt-3">
                                                                <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest ${todo.impact?.toLowerCase().includes('high') ? 'bg-red-500/10 text-red-500 border border-red-500/20 shadow-lg shadow-red-900/10' :
                                                                    todo.impact?.toLowerCase().includes('medium') ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                                                                        'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                                                    }`}>
                                                                    {todo.impact} Impact
                                                                </span>
                                                                {todo.timeframe && (
                                                                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest ${todo.timeframe?.toLowerCase().includes('immediate') ? 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20' :
                                                                        todo.timeframe?.toLowerCase().includes('short') ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                                                                            'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20'
                                                                        }`}>
                                                                        {todo.timeframe}
                                                                    </span>
                                                                )}
                                                                {todo.effort && (
                                                                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest ${todo.effort?.toLowerCase().includes('low') ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
                                                                        todo.effort?.toLowerCase().includes('medium') ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                                                                            'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                                                                        }`}>
                                                                        {todo.effort} Effort
                                                                    </span>
                                                                )}
                                                                <span className="text-[10px] bg-slate-700/50 text-slate-400 px-2.5 py-1 rounded-full border border-slate-600/50 uppercase font-bold tracking-widest">
                                                                    {todo.category}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    }

    // ─── TEMPLATE SELECTION VIEW (full-width grid) ───
    return (
        <div className="h-full flex flex-col gap-5 overflow-y-auto custom-scrollbar">
            {/* Compact Settings Bar */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
                {/* Language */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{language === 'en' ? 'Lang' : 'Език'}</span>
                    <div className="flex bg-slate-700/50 rounded-lg p-0.5">
                        <button
                            onClick={() => setLanguage('bg')}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${language === 'bg' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            BG
                        </button>
                        <button
                            onClick={() => setLanguage('en')}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${language === 'en' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            EN
                        </button>
                    </div>
                </div>

                <div className="w-px h-5 bg-slate-700" />

                {/* Audience */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{language === 'en' ? 'Audience' : 'Аудитория'}</span>
                    <div className="flex bg-slate-700/50 rounded-lg p-0.5">
                        <button
                            onClick={() => setSettings({ ...settings, audience: 'internal' })}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${settings.audience === 'internal' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            {language === 'en' ? 'Internal' : 'Вътрешен'}
                        </button>
                        <button
                            onClick={() => setSettings({ ...settings, audience: 'client' })}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${settings.audience === 'client' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            {language === 'en' ? 'Client' : 'Клиент'}
                        </button>
                    </div>
                </div>

                <div className="w-px h-5 bg-slate-700" />

                {/* Expert Mode */}
                <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{language === 'en' ? 'Expert' : 'Експерт'}</span>
                    <button
                        onClick={() => setSettings({ ...settings, expertMode: !settings.expertMode })}
                        className={`w-9 h-5 rounded-full transition-colors ${settings.expertMode ? 'bg-violet-600' : 'bg-slate-700'}`}
                    >
                        <div className={`w-3.5 h-3.5 bg-white rounded-full transition-transform ${settings.expertMode ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                    </button>
                </label>

                <div className="w-px h-5 bg-slate-700" />

                {/* Model */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{language === 'en' ? 'Model' : 'Модел'}</span>
                    <select
                        value={settings.model}
                        onChange={(e) => setSettings({ ...settings, model: e.target.value as ReportSettings['model'] })}
                        className="bg-slate-700/50 border border-slate-600 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:ring-violet-500 focus:border-violet-500"
                    >
                        <option value="opus-4.6">Opus 4.6</option>
                        <option value="sonnet-4.5">Sonnet 4.5</option>
                        <option value="haiku-4.5">Haiku 4.5</option>
                    </select>
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* History Toggle */}
                <button
                    onClick={() => setShowHistory(!showHistory)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${showHistory
                        ? 'bg-violet-600 text-white border-violet-500'
                        : 'text-slate-400 hover:text-white border-slate-600 hover:border-slate-500'
                        }`}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {language === 'en' ? 'History' : 'История'}
                    {historyResults.length > 0 && (
                        <span className="bg-slate-600 text-slate-300 text-[9px] px-1.5 py-0.5 rounded-full font-bold">{historyResults.length}</span>
                    )}
                </button>
            </div>

            {/* Template Grid */}
            <div className="space-y-6">
                {Object.entries(templatesByCategory).map(([category, templates]) => (
                    templates.length > 0 && (
                        <div key={category}>
                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">
                                {categoryLabels[category as keyof typeof categoryLabels]}
                            </h4>
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                                {templates.map(template => {
                                    const isSelected = selectedTemplate?.id === template.id;
                                    return (
                                        <button
                                            key={template.id}
                                            onClick={() => setSelectedTemplate(isSelected ? null : template)}
                                            className={`text-left p-5 rounded-xl transition-all border-2 group ${isSelected
                                                ? 'border-violet-500 bg-violet-500/5 ring-2 ring-violet-500/20'
                                                : 'border-slate-700 bg-slate-800 hover:border-slate-500 hover:bg-slate-700/50'
                                                }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0 ${isSelected ? 'bg-violet-600 shadow-lg shadow-violet-900/30' : 'bg-slate-700/50'}`}>
                                                    {template.icon}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h5 className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>
                                                        {language === 'en' ? template.nameEN : template.nameBG}
                                                    </h5>
                                                    <p className={`text-xs mt-1.5 leading-relaxed ${isSelected ? 'text-violet-200' : 'text-slate-400'}`}>
                                                        {language === 'en' ? template.descriptionEN : template.descriptionBG}
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )
                ))}
            </div>

            {/* Generate Button */}
            {selectedTemplate && (
                <div className="flex justify-center py-2">
                    <button
                        onClick={handleGenerateReport}
                        disabled={generating}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-10 py-3.5 rounded-xl font-bold tracking-wide transition-all active:scale-95 flex items-center gap-2.5 shadow-lg shadow-emerald-900/20"
                    >
                        {generating ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                {language === 'en' ? 'Generating Analysis...' : 'Генериране на анализ...'}
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                {language === 'en'
                                    ? `Generate: ${selectedTemplate.nameEN}`
                                    : `Генерирай: ${selectedTemplate.nameBG}`}
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* History Section (collapsible, below templates) */}
            {showHistory && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {language === 'en' ? 'Report History' : 'История на анализите'}
                        </h4>
                        <div className="flex gap-2 flex-1 max-w-sm ml-4">
                            <input
                                type="text"
                                placeholder={language === 'en' ? 'Search history...' : 'Търси в историята...'}
                                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                                value={historySearchQuery}
                                onChange={(e) => setHistorySearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearchHistory()}
                            />
                            <button
                                onClick={handleSearchHistory}
                                disabled={searchingHistory}
                                className="bg-violet-600 hover:bg-violet-500 px-2.5 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50"
                            >
                                {searchingHistory ? (
                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {historyResults.length > 0 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                            {historyResults.map((report) => (
                                <div
                                    key={report.id}
                                    className="relative text-left p-3.5 rounded-lg bg-slate-900/50 border border-slate-700 hover:border-violet-500/50 hover:bg-slate-700/50 transition-all group cursor-pointer"
                                    onClick={() => handleViewHistoryReport(report)}
                                >
                                    <div className="flex justify-between items-start mb-1.5">
                                        <span className="text-[10px] bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider truncate max-w-[250px]">
                                            {report.reportTitle || report.templateId?.replace(/_/g, ' ')}
                                        </span>
                                        <div className="flex items-center gap-1.5 ml-2">
                                            <span className="text-[9px] text-slate-500 whitespace-nowrap">
                                                {new Date(report.timestamp).toLocaleDateString(language === 'en' ? 'en-US' : 'bg-BG')}
                                            </span>
                                            {userRole === 'admin' && (
                                                <button
                                                    onClick={(e) => handleDeleteReport(report.id, e)}
                                                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-0.5 rounded hover:bg-red-500/10"
                                                    title={language === 'en' ? 'Delete report' : 'Изтрий анализа'}
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed group-hover:text-white transition-colors">
                                        {report.analysis?.slice(0, 120).replace(/[#*`]/g, '')}...
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-6 bg-slate-900/30 rounded-lg border border-slate-800 border-dashed">
                            <p className="text-xs text-slate-500">
                                {language === 'en'
                                    ? 'Type a topic and hit enter to search through your past insights semantically.'
                                    : 'Въведи тема и натисни Enter, за да търсиш семантично в старите си анализи.'}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
