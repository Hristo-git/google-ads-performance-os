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
    const [generatingPhase, setGeneratingPhase] = useState<'data' | 'ai' | null>(null);
    const [currentReport, setCurrentReport] = useState<GeneratedReport | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [historySearchQuery, setHistorySearchQuery] = useState('');
    const [historyResults, setHistoryResults] = useState<any[]>([]);
    const [searchingHistory, setSearchingHistory] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [activeTab, setActiveTab] = useState<'executive' | 'technical'>('executive');
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [lastDataPayload, setLastDataPayload] = useState<any>(null);
    const [showDataPayload, setShowDataPayload] = useState<boolean>(false);
    const [generatingStatus, setGeneratingStatus] = useState<string | null>(null);
    const [abortController, setAbortController] = useState<AbortController | null>(null);

    // Settings
    const [settings, setSettings] = useState<ReportSettings>({
        model: userRole === 'admin' ? 'sonnet-4.5' : 'sonnet-4.5',
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
        if (!selectedTemplate || generating) return;

        const controller = new AbortController();
        setAbortController(controller);
        setGenerating(true);
        setError(null);
        setGeneratingStatus(language === 'en' ? 'Preparing data for analysis...' : 'Подготовка на данни за анализ...');
        setCurrentReport(null);
        setGeneratingPhase('data');

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

            if (selectedTemplate.requiredData.includes('searchTerms')) {
                dataPayload.searchTerms = searchTerms.slice(0, settings.rowLimit);
                dataPayload.nGramAnalysis = nGramAnalysis;
            }

            // ── Parallel on-demand data fetching ──────────────────────────
            // Build array of fetch promises for data that needs on-demand loading.
            // This runs all fetches in parallel instead of sequentially (3-5× faster).
            const dateParams = dateRange ? `&startDate=${dateRange.start}&endDate=${dateRange.end}` : '';
            const fetchPromises: { key: string; promise: Promise<any>; required: boolean }[] = [];

            // Ad Groups
            if (selectedTemplate.requiredData.includes('adGroups')) {
                if (adGroups.length === 0 && customerId) {
                    console.log("[AIReports] Queuing ad groups fetch...");
                    fetchPromises.push({
                        key: 'adGroups',
                        required: true,
                        promise: fetch(`/api/google-ads/ad-groups?customerId=${customerId}&status=ENABLED${dateParams}`)
                            .then(r => r.json())
                            .then(d => d.adGroups || []),
                    });
                } else {
                    dataPayload.adGroups = adGroups.slice(0, settings.rowLimit);
                }
            }

            // Keywords
            if (selectedTemplate.requiredData.includes('keywords')) {
                if (keywords.length === 0 && customerId) {
                    console.log("[AIReports] Queuing keywords fetch...");
                    const qsFilter = selectedTemplate.id === 'quality_score_diagnostics' ? '&maxQualityScore=5' : '';
                    fetchPromises.push({
                        key: 'keywords',
                        required: true,
                        promise: fetch(`/api/google-ads/keywords?customerId=${customerId}${qsFilter}`)
                            .then(r => r.json())
                            .then(d => d.keywords || []),
                    });
                } else {
                    dataPayload.keywords = keywords.slice(0, settings.rowLimit);
                }
            }

            // Ads
            if (selectedTemplate.requiredData.includes('ads')) {
                if (ads.length === 0 && customerId) {
                    console.log("[AIReports] Queuing ads fetch...");
                    fetchPromises.push({
                        key: 'ads',
                        required: true,
                        promise: fetch(`/api/google-ads/ads?customerId=${customerId}${dateParams}`)
                            .then(r => r.json())
                            .then(d => d.ads || []),
                    });
                } else {
                    dataPayload.ads = ads.slice(0, settings.rowLimit);
                }
            }

            // Context signals (optional — never blocks report)
            if (customerId && dateRange) {
                const pmaxIds = (campaigns || [])
                    .filter((c: any) => c.advertisingChannelType === 'PERFORMANCE_MAX' || c.advertisingChannelType === 6)
                    .map((c: any) => c.id)
                    .filter(Boolean);
                const pmaxParam = pmaxIds.length > 0 ? `&pmaxCampaignIds=${pmaxIds.join(',')}` : '';
                fetchPromises.push({
                    key: 'context',
                    required: false,
                    promise: fetch(
                        `/api/google-ads/analysis-context?customerId=${customerId}&startDate=${dateRange.start}&endDate=${dateRange.end}&language=${settings.language}${pmaxParam}`
                    ).then(r => r.ok ? r.json() : null),
                });
            }

            // Execute all fetches in parallel
            if (fetchPromises.length > 0) {
                console.log(`[AIReports] Fetching ${fetchPromises.length} data sources in parallel...`);
                const results = await Promise.allSettled(fetchPromises.map(f => f.promise));

                const failedRequired: string[] = [];

                results.forEach((result, i) => {
                    const { key, required } = fetchPromises[i];

                    if (result.status === 'fulfilled' && result.value) {
                        if (key === 'context') {
                            const ctxData = result.value;
                            if (ctxData.contextBlock) dataPayload.contextBlock = ctxData.contextBlock;
                            if (ctxData.pmaxBlock) dataPayload.pmaxBlock = ctxData.pmaxBlock;
                            if (ctxData.context?.device) dataPayload.deviceData = ctxData.context.device;
                            console.log(`[AIReports] Context signals loaded`);
                        } else {
                            const rows = Array.isArray(result.value) ? result.value : [];
                            dataPayload[key] = rows.slice(0, settings.rowLimit);
                            console.log(`[AIReports] ${key}: ${rows.length} rows loaded`);
                            if (rows.length === 0 && required) {
                                failedRequired.push(key);
                            }
                        }
                    } else {
                        const reason = result.status === 'rejected' ? result.reason : 'empty response';
                        console.error(`[AIReports] ${key} fetch failed:`, reason);
                        if (required) {
                            failedRequired.push(key);
                        }
                        if (key !== 'context') dataPayload[key] = [];
                    }
                });

                // If ALL required data sources failed, abort with a clear error
                const requiredKeys = fetchPromises.filter(f => f.required).map(f => f.key);
                if (requiredKeys.length > 0 && failedRequired.length === requiredKeys.length) {
                    const labels: Record<string, string> = {
                        adGroups: language === 'en' ? 'Ad Groups' : 'Рекламни групи',
                        ads: language === 'en' ? 'Ads' : 'Реклами',
                        keywords: language === 'en' ? 'Keywords' : 'Ключови думи',
                    };
                    const failedLabels = failedRequired.map(k => labels[k] || k).join(', ');
                    throw new Error(
                        language === 'en'
                            ? `Failed to load required data: ${failedLabels}. Please try again or check the browser console for details.`
                            : `Неуспешно зареждане на данни: ${failedLabels}. Моля, опитайте отново или проверете конзолата на браузъра.`
                    );
                }
            }

            // Store payload for debug/export (before sending)
            setLastDataPayload(dataPayload);
            setShowDataPayload(false);
            setGeneratingPhase('ai');
            setGeneratingStatus(language === 'en' ? 'AI is initializing report generation...' : 'AI започва генерирането на анализа...');

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
                signal: controller.signal,
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
                const chunk = decoder.decode(value, { stream: true });
                analysis += chunk;

                // Detect progress indicators in the stream
                if (chunk.includes('Pass 1/2') || chunk.includes('Етап 1/2')) {
                    setGeneratingStatus(language === 'en' ? 'Pass 1/2: Strategic Analysis' : 'Етап 1/2: Стратегически анализ');
                } else if (chunk.includes('Pass 2/2') || chunk.includes('Етап 2/2')) {
                    setGeneratingStatus(language === 'en' ? 'Pass 2/2: Technical & Expert Refinement' : 'Етап 2/2: Експертна рефинация');
                }

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

            // Sync with history state so it appears in the list immediately
            if (currentReport) {
                setHistoryResults(prev => {
                    // Check if already exists (to avoid duplicates if state updated elsewhere)
                    if (prev.some(r => r.id === currentReport.id)) return prev;

                    const historyItem = {
                        id: currentReport.id,
                        customerId: customerId,
                        templateId: currentReport.templateId,
                        reportTitle: currentReport.templateName,
                        analysis: currentReport.analysis,
                        audience: currentReport.settings.audience,
                        timestamp: currentReport.timestamp,
                        language: currentReport.settings.language,
                        model: currentReport.settings.model,
                        metadata: { settings: currentReport.settings, periodLabel: periodSuffix }
                    };
                    return [historyItem, ...prev];
                });
            }
        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.log('Report generation aborted by user');
                return;
            }
            console.error('Report generation error:', err);
            setError(err.message || 'Failed to generate report');
        } finally {
            setGenerating(false);
            setGeneratingPhase(null);
            setGeneratingStatus(null);
            setAbortController(null);
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
        console.log(`[AIReportsHub] Searching history for customerId: ${customerId}, query: ${historySearchQuery}`);
        setSearchingHistory(true);
        try {
            const historyUrl = `/api/reports/history?query=${encodeURIComponent(historySearchQuery)}&customerId=${customerId}&limit=30&t=${Date.now()}`;
            console.log(`[AIReports] Fetching from URL: ${historyUrl}`);

            const response = await fetch(historyUrl, {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            if (!response.ok) throw new Error(`History fetch failed: ${response.status}`);
            const data = await response.json();
            console.log(`[AIReportsHub] History loaded:`, data.reports?.length || 0, 'items');
            setHistoryResults(data.reports || []);
            setHistoryLoaded(true);
        } catch (err: any) {
            console.error("History fetch error:", err);
            setError(err.message || 'Failed to load history');
        } finally {
            setSearchingHistory(false);
        }
    };

    const handleViewHistoryReport = (report: any) => {
        const template = REPORT_TEMPLATE_DEFINITIONS.find(t => t.id === report.templateId);

        // Use reportTitle from Pinecone (includes model + period) with fallback to template name
        const fallbackName = settings.language === 'en' ? (template?.nameEN || 'Report') : (template?.nameBG || 'Анализ');
        const rawTitle = report.reportTitle || fallbackName;
        // Strip the [model] prefix for non-admin users
        const displayTitle = userRole === 'admin' ? rawTitle : rawTitle.replace(/^\[.*?\]\s*/, '');

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

    // --- History Grouping Helpers ---
    const getTemplateIcon = (templateId: string) => {
        if (templateId?.includes('search_terms')) return '📁';
        if (templateId?.includes('campaign_structure')) return '🏗️';
        if (templateId?.includes('change_impact')) return '📉';
        return '📝';
    };

    const groupReportsByDate = (reports: any[]) => {
        const groups: { [key: string]: any[] } = {
            'Today': [],
            'Yesterday': [],
            'Last 7 Days': [],
            'Older': []
        };

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);

        reports.forEach(report => {
            const reportDate = new Date(report.timestamp);
            const dayOnly = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate());

            if (dayOnly.getTime() === today.getTime()) {
                groups['Today'].push(report);
            } else if (dayOnly.getTime() === yesterday.getTime()) {
                groups['Yesterday'].push(report);
            } else if (dayOnly.getTime() >= lastWeek.getTime()) {
                groups['Last 7 Days'].push(report);
            } else {
                groups['Older'].push(report);
            }
        });

        return groups;
    };

    const groupedHistory = groupReportsByDate(historyResults);
    const hasAnyHistory = historyResults.length > 0;

    // ─── REPORT VIEW (full-width when a report is open or generating) ───
    if (currentReport || generating || error) {
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
                ) : (generating && !currentReport) ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                        <div className="relative mb-8">
                            <div className="w-24 h-24 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-2xl animate-pulse">🤖</span>
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2 tracking-tight">
                            {language === 'en' ? 'Generating Report' : 'Генериране на анализ'}
                        </h3>
                        <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed mb-6">
                            {generatingStatus || (language === 'en' ? 'Initialing AI models...' : 'Инициализиране на AI модели...')}
                        </p>
                        <div className="w-64 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 animate-progress-indefinite" />
                        </div>
                        <button
                            onClick={() => {
                                if (abortController) abortController.abort();
                                setGenerating(false);
                                setGeneratingStatus(null);
                                setSelectedTemplate(null);
                            }}
                            className="mt-12 text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-slate-300 transition-colors"
                        >
                            {language === 'en' ? 'Cancel Generation' : 'Отказ'}
                        </button>
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
                            {/* Data Export Button */}
                            {lastDataPayload && (
                                <button
                                    onClick={() => setShowDataPayload(!showDataPayload)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${showDataPayload
                                        ? 'bg-amber-600 text-white border-amber-500'
                                        : 'text-slate-400 hover:text-white border-slate-600 hover:border-slate-500'
                                        }`}
                                    title={language === 'en' ? 'View data sent to AI' : 'Виж изпратените данни към AI'}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                    </svg>
                                    {language === 'en' ? 'Sent Data' : 'Изпратени данни'}
                                </button>
                            )}
                        </div>

                        {/* Data Payload Panel */}
                        {showDataPayload && lastDataPayload && (
                            <div className="border-b border-slate-700 bg-slate-900/80">
                                <div className="px-6 py-3 flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                                        </svg>
                                        {language === 'en' ? 'Data Sent to AI' : 'Данни изпратени към AI'}
                                        <span className="text-slate-500 font-normal normal-case">
                                            ({(JSON.stringify(lastDataPayload).length / 1024).toFixed(1)} KB)
                                        </span>
                                    </h4>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(JSON.stringify(lastDataPayload, null, 2));
                                                const btn = document.getElementById('copy-data-btn');
                                                if (btn) { btn.textContent = language === 'en' ? 'Copied!' : 'Копирано!'; setTimeout(() => { btn.textContent = language === 'en' ? 'Copy JSON' : 'Копирай JSON'; }, 2000); }
                                            }}
                                            id="copy-data-btn"
                                            className="text-[10px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/20 transition-all uppercase tracking-wider"
                                        >
                                            {language === 'en' ? 'Copy JSON' : 'Копирай JSON'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                const blob = new Blob([JSON.stringify(lastDataPayload, null, 2)], { type: 'application/json' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `ai-report-data_${new Date().toISOString().slice(0, 10)}.json`;
                                                a.click();
                                                URL.revokeObjectURL(url);
                                            }}
                                            className="text-[10px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/20 transition-all uppercase tracking-wider"
                                        >
                                            {language === 'en' ? 'Download' : 'Свали'}
                                        </button>
                                    </div>
                                </div>
                                {/* Data Summary */}
                                <div className="px-6 pb-2 flex flex-wrap gap-2">
                                    {lastDataPayload.campaigns?.length > 0 && (
                                        <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 font-bold">
                                            Campaigns: {lastDataPayload.campaigns.length}
                                        </span>
                                    )}
                                    {lastDataPayload.adGroups?.length > 0 && (
                                        <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-500/20 font-bold">
                                            Ad Groups: {lastDataPayload.adGroups.length}
                                        </span>
                                    )}
                                    {lastDataPayload.keywords?.length > 0 && (
                                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-bold">
                                            Keywords: {lastDataPayload.keywords.length}
                                        </span>
                                    )}
                                    {lastDataPayload.ads?.length > 0 && (
                                        <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20 font-bold">
                                            Ads: {lastDataPayload.ads.length}
                                        </span>
                                    )}
                                    {lastDataPayload.searchTerms?.length > 0 && (
                                        <span className="text-[10px] bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/20 font-bold">
                                            Search Terms: {lastDataPayload.searchTerms.length}
                                        </span>
                                    )}
                                    {lastDataPayload.contextBlock && (
                                        <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20 font-bold">
                                            Context Signals
                                        </span>
                                    )}
                                    {lastDataPayload.pmaxBlock && (
                                        <span className="text-[10px] bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/20 font-bold">
                                            PMax Context
                                        </span>
                                    )}
                                </div>
                                {/* JSON Preview */}
                                <div className="px-6 pb-4">
                                    <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-[11px] text-slate-300 overflow-auto max-h-[400px] custom-scrollbar font-mono leading-relaxed">
                                        {JSON.stringify(lastDataPayload, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        )}

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

                {/* Model — admin only */}
                {userRole === 'admin' && (
                    <>
                        <div className="w-px h-5 bg-slate-700" />
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
                    </>
                )}

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
                                {generatingPhase === 'data'
                                    ? (language === 'en' ? 'Loading data...' : 'Зареждане на данни...')
                                    : (language === 'en' ? 'AI is analyzing...' : 'AI анализира...')}
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
                                title={language === 'en' ? 'Refresh History' : 'Обнови историята'}
                                className="bg-violet-600 hover:bg-violet-500 px-2.5 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50"
                            >
                                {searchingHistory ? (
                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {hasAnyHistory ? (
                        <div className="space-y-6">
                            {Object.entries(groupedHistory).map(([label, reports]) => {
                                if (reports.length === 0) return null;

                                // Localized label
                                const displayLabel = language === 'en' ? label :
                                    label === 'Today' ? 'Днес' :
                                        label === 'Yesterday' ? 'Вчера' :
                                            label === 'Last 7 Days' ? 'Последните 7 дни' : 'По-стари';

                                return (
                                    <div key={label} className="space-y-2.5">
                                        <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">{displayLabel}</h5>
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                            {reports.map((report) => (
                                                <div
                                                    key={report.id}
                                                    className="relative text-left p-4 rounded-xl bg-slate-950/40 border border-slate-800 hover:border-violet-500/50 hover:bg-slate-800/40 transition-all group cursor-pointer"
                                                    onClick={() => handleViewHistoryReport(report)}
                                                >
                                                    <div className="flex justify-between items-start mb-2.5">
                                                        <div className="flex items-center gap-2 truncate pr-2">
                                                            <span className="text-lg grayscale group-hover:grayscale-0 transition-all">{getTemplateIcon(report.templateId)}</span>
                                                            <span className="text-[11px] font-bold text-slate-200 group-hover:text-violet-400 transition-colors truncate">
                                                                {userRole === 'admin'
                                                                    ? (report.reportTitle || report.templateId?.replace(/_/g, ' '))
                                                                    : (report.reportTitle || report.templateId?.replace(/_/g, ' ')).replace(/^\[.*?\]\s*/, '')
                                                                }
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span className="text-[9px] font-medium text-slate-600 tabular-nums">
                                                                {new Date(report.timestamp).toLocaleTimeString(language === 'en' ? 'en-US' : 'bg-BG', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            {userRole === 'admin' && (
                                                                <button
                                                                    onClick={(e) => handleDeleteReport(report.id, e)}
                                                                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                                                    title={language === 'en' ? 'Delete' : 'Изтрий'}
                                                                >
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed group-hover:text-slate-300 transition-colors">
                                                        {report.analysis?.replace(/[#*`]/g, '').slice(0, 100)}...
                                                    </p>
                                                    <div className="mt-3 flex gap-1.5 overflow-hidden">
                                                        {report.model && userRole === 'admin' && (
                                                            <span className="text-[9px] bg-slate-900 text-slate-500 px-1.5 py-0.5 rounded border border-slate-800">
                                                                {report.model}
                                                            </span>
                                                        )}
                                                        {report.language && (
                                                            <span className="text-[9px] bg-slate-900 text-slate-500 px-1.5 py-0.5 rounded border border-slate-800 uppercase">
                                                                {report.language}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-10 bg-slate-900/30 rounded-xl border border-slate-700/50 border-dashed">
                            <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                                <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <p className="text-[11px] text-slate-500 max-w-[240px] mx-auto leading-relaxed">
                                {language === 'en'
                                    ? 'No reports found for this period. Try generating a new analysis above.'
                                    : 'Няма открити анализи за този период. Пробвай да генерираш нов анализ по-горе.'}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
