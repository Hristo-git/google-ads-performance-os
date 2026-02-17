'use client';

import React, { useEffect, useState } from 'react';
import { useReportStore } from '@/lib/report-store';
import { FileText, Loader2, CheckCircle, XCircle, ChevronRight, AlertCircle } from 'lucide-react';

interface BackgroundReportIndicatorProps {
    onNavigateToReports: () => void;
    currentView: string;
}

export function BackgroundReportIndicator({ onNavigateToReports, currentView }: BackgroundReportIndicatorProps) {
    const { activeReport, notification, clearNotification, clearActiveReport } = useReportStore();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (activeReport?.generating || activeReport?.error || notification) {
            setIsVisible(true);
        } else {
            const timer = setTimeout(() => setIsVisible(false), 500);
            return () => clearTimeout(timer);
        }
    }, [activeReport, notification]);

    if (!isVisible && !activeReport?.generating && !activeReport?.error && !notification) return null;

    // Don't show progress if we are already in the reports view
    const showProgress = activeReport?.generating && currentView !== 'reports';
    const showError = activeReport?.error && currentView !== 'reports';

    const handleViewReport = () => {
        onNavigateToReports();
        clearNotification();
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 items-end">
            {/* Active Report Progress */}
            {showProgress && (
                <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl w-72 animate-in slide-in-from-right-4 duration-500">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-600/20 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-white truncate">{activeReport.templateName}</h4>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                                {activeReport.phase === 'data' ? 'Analyzing Data' : 'Generating AI Insight'}
                            </p>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                            <span className="truncate pr-2">{activeReport.status || 'Processing...'}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 transition-all duration-500"
                                style={{ width: activeReport.phase === 'data' ? '30%' : (activeReport.status?.includes('2/2') ? '85%' : '60%') }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Error Notification */}
            {showError && (
                <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/20 rounded-2xl p-4 shadow-2xl w-72 animate-in slide-in-from-right-4 duration-500">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                            <AlertCircle className="w-5 h-5 text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <h4 className="text-sm font-semibold text-white truncate">Generation Failed</h4>
                                <button onClick={clearActiveReport} className="text-slate-500 hover:text-white transition-colors">
                                    <XCircle className="w-4 h-4" />
                                </button>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{activeReport.error}</p>
                            <button
                                onClick={() => { onNavigateToReports(); clearActiveReport(); }}
                                className="mt-3 text-red-400 hover:text-red-300 text-xs font-semibold flex items-center gap-1 transition-colors"
                            >
                                Back to Reports <ChevronRight className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Completion Notification */}
            {notification && (
                <div className="bg-emerald-500/10 backdrop-blur-xl border border-emerald-500/20 rounded-2xl p-4 shadow-2xl w-80 animate-in bounce-in duration-700">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <h4 className="text-sm font-semibold text-white truncate">Report Ready</h4>
                                <button onClick={clearNotification} className="text-slate-500 hover:text-white transition-colors">
                                    <XCircle className="w-4 h-4" />
                                </button>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{notification.title}</p>
                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={handleViewReport}
                                    className="flex items-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all group"
                                >
                                    Open Report
                                    <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                </button>
                                <button
                                    onClick={clearNotification}
                                    className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1.5"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
