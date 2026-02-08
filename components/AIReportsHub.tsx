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
        model: 'claude-sonnet-4.5',
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
                customerId: customerId
            };

            if (selectedTemplate.requiredData.includes('campaigns')) {
                dataPayload.campaigns = campaigns.slice(0, settings.rowLimit);
                dataPayload.strategicBreakdown = strategicBreakdown;
            }
            if (selectedTemplate.requiredData.includes('adGroups')) {
                dataPayload.adGroups = adGroups.slice(0, settings.rowLimit);
            }
            if (selectedTemplate.requiredData.includes('searchTerms')) {
                dataPayload.searchTerms = searchTerms.slice(0, settings.rowLimit);
                dataPayload.nGramAnalysis = nGramAnalysis;
            }

            // Special handling for keywords:
            // If we are at Account Level (keywords is empty) AND the template needs keywords (e.g. Quality Score Diagnostics),
            // we must fetch Low QS keywords on demand to avoid "Structurally Empty Data" error.
            if (selectedTemplate.requiredData.includes('keywords')) {
                if (keywords.length === 0 && selectedTemplate.id === 'quality_score_diagnostics') {
                    // Fetch specific low quality keywords
                    try {
                        const loadingMsg = language === 'en' ? 'Fetching granular keyword data...' : 'Извличане на детайлни данни за ключови думи...';
                        // We can't easily change the button text here without state, but the UI shows a spinner
                        console.log("Fetching Low QS Keywords on demand...");

                        const res = await fetch(`/api/google-ads/keywords?customerId=${customerId}&maxQualityScore=5`);
                        const qsData = await res.json();

                        if (qsData.keywords && qsData.keywords.length > 0) {
                            console.log(`Fetched ${qsData.keywords.length} low QS keywords for analysis`);
                            dataPayload.keywords = qsData.keywords;
                        } else {
                            dataPayload.keywords = [];
                        }
                    } catch (e) {
                        console.warn("Failed to fetch on-demand keywords", e);
                        dataPayload.keywords = [];
                    }
                } else {
                    dataPayload.keywords = keywords.slice(0, settings.rowLimit);
                }
            }

            if (selectedTemplate.requiredData.includes('ads')) {
                dataPayload.ads = ads.slice(0, settings.rowLimit);
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
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate report');
            }

            const result = await response.json();

            const generatedReport: GeneratedReport = {
                id: `${selectedTemplate.id}_${Date.now()}`,
                templateId: selectedTemplate.id,
                templateName: settings.language === 'en' ? selectedTemplate.nameEN : selectedTemplate.nameBG,
                timestamp: new Date().toISOString(),
                analysis: result.analysis,
                settings,
            };

            setCurrentReport(generatedReport);
        } catch (err: any) {
            console.error('Report generation error:', err);
            setError(err.message || 'Failed to generate report');
        } finally {
            setGenerating(false);
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

        setCurrentReport({
            id: report.id,
            templateId: report.templateId as ReportTemplateId,
            templateName: settings.language === 'en' ? (template?.nameEN || 'Report') : (template?.nameBG || 'Анализ'),
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

    return (
        <div className="h-full flex gap-6">
            {/* Template Gallery Sidebar */}
            <div className="w-96 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                {/* Settings Panel */}
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                    <h3 className="text-sm font-bold text-white mb-3">{language === 'en' ? 'Settings' : 'Настройки'}</h3>

                    {/* Language */}
                    <div className="mb-3">
                        <label className="text-xs text-slate-400 block mb-1">{language === 'en' ? 'Language' : 'Език'}</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setLanguage('bg')}
                                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${language === 'bg' ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                            >
                                🇧🇬 Български
                            </button>
                            <button
                                onClick={() => setLanguage('en')}
                                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${language === 'en' ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                            >
                                🇬🇧 English
                            </button>
                        </div>
                    </div>

                    {/* Audience */}
                    <div className="mb-3">
                        <label className="text-xs text-slate-400 block mb-1">{language === 'en' ? 'Audience' : 'Аудитория'}</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSettings({ ...settings, audience: 'internal' })}
                                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${settings.audience === 'internal' ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                            >
                                {language === 'en' ? 'Internal' : 'Вътрешен'}
                            </button>
                            <button
                                onClick={() => setSettings({ ...settings, audience: 'client' })}
                                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${settings.audience === 'client' ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                            >
                                {language === 'en' ? 'Client' : 'Клиент'}
                            </button>
                        </div>
                    </div>

                    {/* Expert Mode */}
                    <div className="flex items-center justify-between">
                        <label className="text-xs text-slate-400">{language === 'en' ? 'Expert Mode (2-Pass)' : 'Експертен режим (2 прохода)'}</label>
                        <button
                            onClick={() => setSettings({ ...settings, expertMode: !settings.expertMode })}
                            className={`w-11 h-6 rounded-full transition-colors ${settings.expertMode ? 'bg-violet-600' : 'bg-slate-700'
                                }`}
                        >
                            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.expertMode ? 'translate-x-6' : 'translate-x-1'
                                }`} />
                        </button>
                    </div>
                </div>

                {/* History Section Toggle */}
                <div className="border-t border-slate-700 pt-4 mt-2">
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${showHistory
                            ? 'bg-slate-700 border-slate-600'
                            : 'bg-slate-800/50 border-slate-700 hover:bg-slate-700'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-xl">📜</span>
                            <span className="text-sm font-bold text-white">
                                {language === 'en' ? 'Report History' : 'История на анализите'}
                            </span>
                        </div>
                        <svg className={`w-4 h-4 text-slate-400 transition-transform ${showHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {showHistory && (
                        <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                            {/* History Search */}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder={language === 'en' ? 'Search history...' : 'Търси в историята...'}
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                                    value={historySearchQuery}
                                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearchHistory()}
                                />
                                <button
                                    onClick={handleSearchHistory}
                                    disabled={searchingHistory}
                                    className="bg-violet-600 hover:bg-violet-500 p-2 rounded-lg text-white transition-colors disabled:opacity-50"
                                >
                                    {searchingHistory ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    )}
                                </button>
                            </div>

                            {/* History Results */}
                            <div className="max-h-80 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                                {historyResults.length > 0 ? (
                                    historyResults.map((report) => (
                                        <button
                                            key={report.id}
                                            onClick={() => handleViewHistoryReport(report)}
                                            className="w-full text-left p-2.5 rounded-lg bg-slate-800 border border-slate-700 hover:border-violet-500/50 hover:bg-slate-700/50 transition-all group"
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-[10px] bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider truncate max-w-[200px]">
                                                    {report.reportTitle || report.templateId?.replace(/_/g, ' ')}
                                                </span>
                                                <span className="text-[9px] text-slate-500 ml-2 whitespace-nowrap">
                                                    {new Date(report.timestamp).toLocaleDateString(language === 'en' ? 'en-US' : 'bg-BG')}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed group-hover:text-white transition-colors">
                                                {report.analysis?.slice(0, 100).replace(/[#*`]/g, '')}...
                                            </p>
                                        </button>
                                    ))
                                ) : historySearchQuery && !searchingHistory ? (
                                    <div className="text-center py-4">
                                        <p className="text-xs text-slate-500">{language === 'en' ? 'No reports found.' : 'Няма намерени анализи.'}</p>
                                    </div>
                                ) : !historySearchQuery && (
                                    <div className="text-center py-4 bg-slate-900/50 rounded-lg border border-slate-800 border-dashed">
                                        <p className="text-[10px] text-slate-500 px-4">
                                            {language === 'en'
                                                ? 'Type a topic and hit enter to search through your past insights semantically.'
                                                : 'Въведи тема и натисни Enter, за да търсиш семантично в старите си анализи.'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Template Gallery */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                    {Object.entries(templatesByCategory).map(([category, templates]) => (
                        templates.length > 0 && (
                            <div key={category}>
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                    {categoryLabels[category as keyof typeof categoryLabels]}
                                </h4>
                                <div className="space-y-2">
                                    {templates.map(template => (
                                        <button
                                            key={template.id}
                                            onClick={() => setSelectedTemplate(template)}
                                            className={`w-full text-left p-3 rounded-lg transition-all border ${selectedTemplate?.id === template.id
                                                ? 'bg-violet-600 border-violet-500 text-white'
                                                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-600'
                                                }`}
                                        >
                                            <div className="flex items-start gap-2">
                                                <span className="text-xl">{template.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    <h5 className="text-sm font-semibold truncate">
                                                        {language === 'en' ? template.nameEN : template.nameBG}
                                                    </h5>
                                                    <p className={`text-xs mt-0.5 line-clamp-2 ${selectedTemplate?.id === template.id ? 'text-violet-100' : 'text-slate-400'
                                                        }`}>
                                                        {language === 'en' ? template.descriptionEN : template.descriptionBG}
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )
                    ))}
                </div>

                {/* Generate Button Area */}
                <div className="mt-auto pt-4 shadow-[0_-12px_12px_-4px_rgba(15,23,42,0.8)]">
                    {selectedTemplate && (
                        <button
                            onClick={handleGenerateReport}
                            disabled={generating}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-4 rounded-xl font-bold tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
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
                                    {language === 'en' ? 'Generate Expert Analysis' : 'Генерирай експертен анализ'}
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Report Output Area */}
            <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col shadow-2xl">
                {!currentReport && !error ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-800/50 to-slate-900">
                        <div className="w-24 h-24 bg-violet-600/10 rounded-3xl flex items-center justify-center mb-6 border border-violet-500/20 shadow-inner">
                            <svg className="w-12 h-12 text-violet-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">
                            {language === 'en' ? 'AI Performance Consultant' : 'AI консултант по представянето'}
                        </h3>
                        <p className="text-slate-400 max-w-sm text-sm leading-relaxed">
                            {language === 'en'
                                ? 'Select a specialized template or search your history to access deep account insights.'
                                : 'Избери специализиран шаблон или търси в историята за задълбочени прозрения.'}
                        </p>
                    </div>
                ) : error ? (
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
                        <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-violet-600 rounded-xl flex items-center justify-center text-2xl shadow-lg shadow-violet-900/20">
                                    {REPORT_TEMPLATE_DEFINITIONS.find(t => t.id === currentReport.templateId)?.icon || '📊'}
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white tracking-tight">{currentReport.templateName}</h2>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] bg-slate-700 text-slate-400 px-2 py-0.5 rounded font-bold uppercase">
                                            {currentReport.settings.audience}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {new Date(currentReport.timestamp).toLocaleString(language === 'en' ? 'en-US' : 'bg-BG')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setCurrentReport(null);
                                        setSelectedTemplate(null);
                                    }}
                                    className="text-slate-400 hover:text-white transition-colors p-2.5 hover:bg-slate-700/50 rounded-xl border border-transparent hover:border-slate-600"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Report Content */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[radial-gradient(circle_at_top_right,_rgba(124,58,237,0.03),_transparent)]">
                            {/* Tab Navigation (only show if two documents exist) */}
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
        </div>
    );
}
