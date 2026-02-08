import React, { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface AIAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    analysis: string | null;
    analyzing: boolean;
    onAnalyze: () => void;
    onAnalyzeStrategic: (category: string) => void;
    onClear: () => void;
    strategicBreakdown: any;
    language: 'bg' | 'en';
    setLanguage: (lang: 'bg' | 'en') => void;
}

// ============================================
// HELPER: Split analysis into two documents
// ============================================
function splitDocuments(markdown: string): { executive: string; technical: string; hasTwo: boolean } {
    // Try multiple split patterns the AI might use
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

    // Fallback: no split found, show everything as one
    return { executive: markdown, technical: '', hasTwo: false };
}

const AIAnalysisModal: React.FC<AIAnalysisModalProps> = ({
    isOpen,
    onClose,
    analysis,
    analyzing,
    onAnalyze,
    onAnalyzeStrategic,
    onClear,
    strategicBreakdown,
    language,
    setLanguage
}) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'executive' | 'technical'>('executive');

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    // Reset tab when new analysis arrives
    useEffect(() => {
        if (analysis) {
            setActiveTab('executive');
        }
    }, [analysis]);

    const { executive, technical, hasTwo, todoList } = React.useMemo(() => {
        if (!analysis) return { executive: '', technical: '', hasTwo: false, todoList: [] };

        // Extract JSON todos
        const jsonMatch = analysis.match(/```json\s*([\s\S]*?)\s*```/);
        let cleanAnalysis = analysis;
        let todos: any[] = [];

        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                if (parsed.todos && Array.isArray(parsed.todos)) {
                    todos = parsed.todos;
                }
                cleanAnalysis = analysis.replace(/```json[\s\S]*?```/, '').trim();
            } catch (e) {
                console.error("Failed to parse AI To-Do list", e);
            }
        }

        // Split into two documents
        const { executive, technical, hasTwo } = splitDocuments(cleanAnalysis);

        return { executive, technical, hasTwo, todoList: todos };
    }, [analysis]);

    if (!isOpen) return null;

    const tabLabels = {
        executive: language === 'bg' ? 'Резюме' : 'Executive Summary',
        technical: language === 'bg' ? 'Технически анализ' : 'Technical Analysis',
    };

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div ref={modalRef} className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/50 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-violet-500/10 rounded-lg">
                            <svg className="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">AI Performance Analysis</h2>
                            <p className="text-sm text-slate-400">
                                {hasTwo
                                    ? (language === 'bg' ? 'Два документа: Резюме + Технически' : 'Two documents: Summary + Technical')
                                    : 'AI Performance Analysis'
                                }
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Language Toggle */}
                        <div className="flex items-center gap-2 bg-slate-700/50 rounded-lg p-1 border border-slate-600/50">
                            <button
                                onClick={() => setLanguage('bg')}
                                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${language === 'bg'
                                    ? 'bg-violet-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                    }`}
                            >
                                BG
                            </button>
                            <button
                                onClick={() => setLanguage('en')}
                                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${language === 'en'
                                    ? 'bg-violet-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                    }`}
                            >
                                EN
                            </button>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white transition-colors hover:bg-slate-700 rounded-lg"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Tabs — only show when we have two documents */}
                {analysis && !analyzing && hasTwo && (
                    <div className="flex border-b border-slate-700 bg-slate-800/30">
                        <button
                            onClick={() => setActiveTab('executive')}
                            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors relative ${activeTab === 'executive'
                                ? 'text-violet-400'
                                : 'text-slate-400 hover:text-slate-200'
                                }`}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                {tabLabels.executive}
                            </div>
                            {activeTab === 'executive' && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500" />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('technical')}
                            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors relative ${activeTab === 'technical'
                                ? 'text-violet-400'
                                : 'text-slate-400 hover:text-slate-200'
                                }`}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                </svg>
                                {tabLabels.technical}
                            </div>
                            {activeTab === 'technical' && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500" />
                            )}
                        </button>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {!analysis && !analyzing ? (
                        /* Empty state */
                        <div className="text-center py-12">
                            <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-medium text-white mb-2">Ready to Analyze</h3>
                            <p className="text-slate-400 max-w-sm mx-auto mb-8">
                                Get deep insights into your campaign performance, actionable recommendations, and strategic opportunities.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                                <button
                                    onClick={onAnalyze}
                                    className="bg-violet-600 hover:bg-violet-500 text-white p-4 rounded-xl transition-all border border-violet-500/20 hover:border-violet-500 shadow-lg hover:shadow-violet-500/20 text-left group"
                                >
                                    <h4 className="font-semibold mb-1 group-hover:text-violet-100">Analyze Current View</h4>
                                    <p className="text-xs text-violet-200/70">Analyze the currently visible campaigns and metrics.</p>
                                </button>
                                {strategicBreakdown && (
                                    <button
                                        onClick={() => {
                                            const strategies = Object.entries(strategicBreakdown);
                                            if (strategies.length > 0) {
                                                const topStrategy = strategies.sort(([, a]: any, [, b]: any) => b.spend - a.spend)[0][0];
                                                onAnalyzeStrategic(topStrategy);
                                            }
                                        }}
                                        className="bg-slate-700 hover:bg-slate-600 text-white p-4 rounded-xl transition-all border border-slate-600 hover:border-slate-500 shadow-lg text-left group"
                                    >
                                        <h4 className="font-semibold mb-1 group-hover:text-slate-200">Analyze Top Strategy</h4>
                                        <p className="text-xs text-slate-400">Deep dive into your highest spending campaign category.</p>
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : analyzing ? (
                        /* Loading state */
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="relative w-20 h-20 mb-6">
                                <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-violet-500 rounded-full border-t-transparent animate-spin"></div>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Analyzing Data...</h3>
                            <p className="text-slate-400 animate-pulse">Identifying patterns and opportunities</p>
                        </div>
                    ) : (
                        /* Analysis content */
                        <div className="space-y-8">
                            <div className="api-content prose prose-invert prose-slate max-w-none">
                                <ReactMarkdown>
                                    {hasTwo
                                        ? (activeTab === 'executive' ? executive : technical)
                                        : executive /* fallback: show everything */
                                    }
                                </ReactMarkdown>
                            </div>

                            {/* Todo list — show on technical tab (or always if no tabs) */}
                            {todoList.length > 0 && (activeTab === 'technical' || !hasTwo) && (
                                <div className="mt-8 border-t border-slate-700 pt-6">
                                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                        Action Plan
                                        <span className="text-sm font-normal text-slate-400">
                                            ({todoList.length} {language === 'bg' ? 'действия' : 'actions'})
                                        </span>
                                    </h3>
                                    <div className="space-y-3">
                                        {todoList.map((todo: any, idx: number) => (
                                            <div key={idx} className="bg-slate-700/30 border border-slate-700/50 rounded-lg p-4 flex items-start gap-3 hover:bg-slate-700/50 transition-colors">
                                                <div className="mt-1">
                                                    <input
                                                        type="checkbox"
                                                        className="w-5 h-5 rounded border-slate-600 text-violet-600 focus:ring-violet-500 bg-slate-700 cursor-pointer"
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-slate-200 font-medium leading-relaxed">{todo.task}</p>
                                                    {todo.estimated_lift && (
                                                        <p className="text-xs text-violet-300/80 mt-1 italic">
                                                            Expected: {todo.estimated_lift}
                                                        </p>
                                                    )}
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        {/* Impact badge */}
                                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${todo.impact?.toLowerCase().includes('high') ? 'bg-red-500/20 text-red-400' :
                                                                todo.impact?.toLowerCase().includes('medium') ? 'bg-amber-500/20 text-amber-400' :
                                                                    'bg-emerald-500/20 text-emerald-400'
                                                            }`}>
                                                            {todo.impact} Impact
                                                        </span>
                                                        {/* Timeframe badge */}
                                                        {todo.timeframe && (
                                                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${todo.timeframe?.toLowerCase().includes('immediate') ? 'bg-cyan-500/20 text-cyan-400' :
                                                                    todo.timeframe?.toLowerCase().includes('short') ? 'bg-blue-500/20 text-blue-400' :
                                                                        'bg-indigo-500/20 text-indigo-400'
                                                                }`}>
                                                                {todo.timeframe}
                                                            </span>
                                                        )}
                                                        {/* Effort badge */}
                                                        {todo.effort && (
                                                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${todo.effort?.toLowerCase().includes('low') ? 'bg-green-500/20 text-green-400' :
                                                                    todo.effort?.toLowerCase().includes('medium') ? 'bg-yellow-500/20 text-yellow-400' :
                                                                        'bg-orange-500/20 text-orange-400'
                                                                }`}>
                                                                {todo.effort} Effort
                                                            </span>
                                                        )}
                                                        {/* Category badge */}
                                                        <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-600 uppercase tracking-wider">
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
                    )}
                </div>

                {/* Footer */}
                {analysis && !analyzing && (
                    <div className="p-4 border-t border-slate-700 bg-slate-800/50 rounded-b-2xl flex justify-end">
                        <button
                            onClick={onClear}
                            className="text-slate-400 hover:text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors mr-2"
                        >
                            Clear
                        </button>
                        <button
                            onClick={onClose}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg transition-colors font-medium"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIAnalysisModal;
