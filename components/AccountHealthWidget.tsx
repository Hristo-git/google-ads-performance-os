"use client";

import React, { useState } from 'react';
import {
    Activity,
    AlertCircle,
    CheckCircle2,
    TrendingUp,
    Layout,
    Target,
    Zap,
    ShieldAlert,
    BarChart3,
    ChevronDown,
    ChevronUp,
    Lightbulb,
    Smartphone,
    Users,
    Loader2
} from 'lucide-react';

interface HealthCheck {
    name: string;
    category: string;
    score: number;
    status: 'CRITICAL' | 'WARNING' | 'GOOD' | 'EXCELLENT';
    finding: string;
    recommendation: string;
}

interface AccountHealthWidgetProps {
    data: {
        overallScore: number;
        overallGrade: string;
        checks: HealthCheck[];
        summary: string;
    };
    loading?: boolean;
}

const getStatusColor = (status: string) => {
    switch (status) {
        case 'CRITICAL': return 'text-red-400 bg-red-400/10 border-red-400/20';
        case 'WARNING': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
        case 'GOOD': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
        case 'EXCELLENT': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
        default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
};

const getStatusIcon = (status: string) => {
    switch (status) {
        case 'CRITICAL': return <ShieldAlert className="w-4 h-4" />;
        case 'WARNING': return <AlertCircle className="w-4 h-4" />;
        case 'GOOD': return <Activity className="w-4 h-4" />;
        case 'EXCELLENT': return <CheckCircle2 className="w-4 h-4" />;
        default: return null;
    }
};

const getCategoryIcon = (category: string) => {
    switch (category) {
        case 'CONVERSION_TRACKING': return <Target className="w-4 h-4" />;
        case 'QUALITY_SCORE': return <Zap className="w-4 h-4" />;
        case 'AD_STRENGTH': return <Layout className="w-4 h-4" />;
        case 'IMPRESSION_SHARE': return <TrendingUp className="w-4 h-4" />;
        case 'BUDGET_EFFICIENCY': return <BarChart3 className="w-4 h-4" />;
        case 'STRUCTURE': return <Layout className="w-4 h-4" />;
        case 'NEGATIVE_KEYWORDS': return <ShieldAlert className="w-4 h-4" />;
        case 'MATCH_TYPE_BALANCE': return <Activity className="w-4 h-4" />;
        case 'DEVICE_PERFORMANCE': return <Smartphone className="w-4 h-4" />;
        case 'MARKET_COMPETITION': return <Users className="w-4 h-4" />;
        default: return <Activity className="w-4 h-4" />;
    }
};

// Expandable Health Card Component
function HealthCard({ check, isExpanded, onToggle }: { check: HealthCheck; isExpanded: boolean; onToggle: () => void }) {
    return (
        <div
            className={`bg-slate-900/40 border rounded-xl p-4 transition-all cursor-pointer group ${isExpanded ? 'border-violet-500/50 ring-1 ring-violet-500/20' : 'border-slate-800 hover:border-slate-700'}`}
            onClick={onToggle}
        >
            {/* Header */}
            <div className="flex justify-between items-start mb-3">
                <div className="p-2 bg-slate-800 rounded-lg group-hover:bg-violet-500/10 group-hover:text-violet-400 transition-colors">
                    {getCategoryIcon(check.category)}
                </div>
                <div className="flex items-center gap-2">
                    <div className={`px-2 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1.5 ${getStatusColor(check.status)}`}>
                        {getStatusIcon(check.status)}
                        {check.status}
                    </div>
                    {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                </div>
            </div>

            {/* Title */}
            <h3 className="text-sm font-bold text-slate-100 mb-1">{check.name}</h3>

            {/* Finding - show full when expanded */}
            <p className={`text-[11px] text-slate-400 leading-relaxed mb-3 ${isExpanded ? '' : 'line-clamp-2'}`}>
                {check.finding}
            </p>

            {/* Progress bar */}
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-3">
                <div
                    className={`h-full ${check.score > 80 ? 'bg-emerald-500' : check.score > 60 ? 'bg-blue-500' : check.score > 40 ? 'bg-amber-500' : 'bg-red-500'} transition-all duration-500`}
                    style={{ width: `${check.score}%` }}
                ></div>
            </div>

            {/* Expanded Action Section */}
            {isExpanded && (
                <div className="mt-4 pt-4 border-t border-slate-800 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-start gap-2 p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg">
                        <Lightbulb className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">Препоръчано действие</p>
                            <p className="text-xs text-slate-300 leading-relaxed">{check.recommendation}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Hover tooltip for quick action preview */}
            {!isExpanded && check.recommendation && (
                <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <p className="text-[10px] text-violet-400 flex items-center gap-1">
                        <Lightbulb className="w-3 h-3" />
                        Кликни за препоръки
                    </p>
                </div>
            )}
        </div>
    );
}

export default function AccountHealthWidget({ data, loading }: AccountHealthWidgetProps) {
    const [expandedCard, setExpandedCard] = useState<number | null>(null);

    if (loading) {
        return (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl shadow-lg relative overflow-hidden min-h-[500px] flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
                <p className="text-slate-300 font-medium text-lg">Analyzing Account Health...</p>
                <div className="text-sm text-slate-500 max-w-md text-center">
                    Reviewing structural integrity, budget efficiency, conversions setup, and match types across your campaigns.
                </div>
            </div>
        );
    }

    const topIssues = data.checks
        .filter(c => c.status === 'CRITICAL' || c.status === 'WARNING')
        .sort((a, b) => a.score - b.score)
        .slice(0, 3);

    const toggleCard = (idx: number) => {
        setExpandedCard(expandedCard === idx ? null : idx);
    };

    return (
        <div className="space-y-6">
            {/* Hero Section: Score & Grade */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Activity size={160} className="text-violet-500" />
                </div>

                <div className="flex flex-col md:flex-row gap-8 items-center relative z-10">
                    <div className="flex-shrink-0 relative">
                        <svg className="w-32 h-32 transform -rotate-90">
                            <circle
                                cx="64"
                                cy="64"
                                r="58"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="transparent"
                                className="text-slate-800"
                            />
                            <circle
                                cx="64"
                                cy="64"
                                r="58"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="transparent"
                                strokeDasharray={364.4}
                                strokeDashoffset={364.4 - (364.4 * data.overallScore) / 100}
                                className={`${data.overallScore > 70 ? 'text-emerald-500' : data.overallScore > 40 ? 'text-amber-500' : 'text-red-500'} transition-all duration-1000 ease-out`}
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-bold text-white">{data.overallScore}</span>
                            <span className={`text-xl font-bold ${data.overallScore > 70 ? 'text-emerald-400' : data.overallScore > 40 ? 'text-amber-400' : 'text-red-400'}`}>
                                {data.overallGrade}
                            </span>
                        </div>
                    </div>

                    <div className="flex-grow space-y-3">
                        <h2 className="text-xl font-bold text-white">Здраве на акаунта (Account Health)</h2>
                        <p className="text-slate-300 leading-relaxed max-w-2xl">
                            {data.summary || 'Няма достатъчно данни за генериране на пълен отчет за здравето на акаунта за избрания период. Моля, проверете избрания период от време или изберете друг акаунт.'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {data.checks.map((check, idx) => (
                                <div
                                    key={idx}
                                    title={`${check.name}: ${check.score}/100 — ${check.recommendation}`}
                                    className={`w-3 h-3 rounded-full ${check.score > 80 ? 'bg-emerald-500' : check.score > 60 ? 'bg-blue-500' : check.score > 40 ? 'bg-amber-500' : 'bg-red-500'} opacity-80 hover:scale-150 transition-transform cursor-help`}
                                ></div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Issues / Critical Fixes */}
            {topIssues.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {topIssues.map((issue, idx) => (
                        <div
                            key={idx}
                            className={`border rounded-xl p-4 flex flex-col gap-2 group hover:scale-[1.02] transition-transform cursor-pointer ${issue.status === 'CRITICAL' ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/40' : 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40'}`}
                            title={issue.recommendation}
                        >
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{issue.name}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${issue.status === 'CRITICAL' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                    {issue.score}/100
                                </span>
                            </div>
                            <p className="text-xs font-semibold text-white">{issue.recommendation}</p>
                            <p className="text-[10px] text-slate-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Lightbulb className="w-3 h-3" />
                                Hover за подробности в картите по-долу
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {/* Detailed Checks Grid - Now with expandable cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {data.checks.map((check, idx) => (
                    <HealthCard
                        key={idx}
                        check={check}
                        isExpanded={expandedCard === idx}
                        onToggle={() => toggleCard(idx)}
                    />
                ))}
            </div>

            {/* Expand All / Collapse All hint */}
            <div className="text-center">
                <p className="text-[10px] text-slate-500">
                    💡 Кликнете върху карта, за да видите пълния текст и препоръчани действия
                </p>
            </div>
        </div>
    );
}
