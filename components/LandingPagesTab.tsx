"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";

interface LandingPage {
    landingPageUrl: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    ctr: number;
    roas: number | null;
    cpa: number | null;
    mobileFriendlyClicksPercentage: number | null;
    speedScore: number | null;
    landingPageExperience: string | null;
}

interface LandingPagesTabProps {
    customerId: string;
    dateRange: { start: string; end: string };
    language?: 'bg' | 'en';
    campaignIds?: string[];
}

export default function LandingPagesTab({
    customerId,
    dateRange,
    language = 'bg',
    campaignIds
}: LandingPagesTabProps) {
    const [pages, setPages] = useState<LandingPage[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<keyof LandingPage>('cost');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    useEffect(() => {
        const fetchPages = async () => {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams({
                    customerId,
                    startDate: dateRange.start,
                    endDate: dateRange.end
                });
                if (campaignIds && campaignIds.length > 0) {
                    params.set('campaignIds', campaignIds.join(','));
                }
                const res = await fetch(`/api/google-ads/landing-pages?${params}`);
                const data = await res.json();

                if (data.error) {
                    setError(data.error);
                } else if (data.landingPages) {
                    setPages(data.landingPages);
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load landing pages');
            } finally {
                setLoading(false);
            }
        };

        fetchPages();
    }, [customerId, dateRange.start, dateRange.end, campaignIds]);

    const sortedPages = useMemo(() => {
        const experienceValues: Record<string, number> = {
            'ABOVE_AVERAGE': 3,
            'AVERAGE': 2,
            'BELOW_AVERAGE': 1,
            'UNKNOWN': 0
        };

        return [...pages].sort((a, b) => {
            let valA: any = a[sortBy];
            let valB: any = b[sortBy];

            // Special handling for quality scores (rank them by value)
            if (sortBy === 'landingPageExperience') {
                valA = experienceValues[valA as string] || 0;
                valB = experienceValues[valB as string] || 0;
            }

            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        }).slice(0, 50);
    }, [pages, sortBy, sortOrder]);

    const handleSort = (key: keyof LandingPage) => {
        if (sortBy === key) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            setSortOrder('desc');
        }
    };

    const formatCurrency = (val: number) => `€${val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatPercent = (val: number | null) => val !== null ? `${(val * 100).toFixed(1)}%` : '—';

    const getExperienceColor = (exp: string | null) => {
        if (!exp) return 'text-slate-500';
        switch (exp) {
            case 'ABOVE_AVERAGE': return 'text-emerald-400';
            case 'AVERAGE': return 'text-amber-400';
            case 'BELOW_AVERAGE': return 'text-red-400';
            default: return 'text-slate-500';
        }
    };

    const getExperienceLabel = (exp: string | null) => {
        if (!exp) return '—';
        if (language === 'en') {
            return exp.replace(/_/g, ' ');
        }
        switch (exp) {
            case 'ABOVE_AVERAGE': return 'Над средното';
            case 'AVERAGE': return 'Средно';
            case 'BELOW_AVERAGE': return 'Под средното';
            default: return 'Неизвестно';
        }
    };

    const getMobileColor = (pct: number | null) => {
        if (pct === null) return 'text-slate-500';
        if (pct >= 0.9) return 'text-emerald-400';
        if (pct >= 0.7) return 'text-amber-400';
        return 'text-red-400';
    };

    const getRoasColor = (roas: number | null) => {
        if (roas === null) return 'text-slate-500';
        if (roas >= 4) return 'text-emerald-400';
        if (roas >= 2) return 'text-amber-400';
        return 'text-red-400';
    };

    const extractPath = (url: string) => {
        try {
            const parsed = new URL(url);
            return parsed.pathname.length > 40 ? parsed.pathname.substring(0, 40) + '...' : parsed.pathname;
        } catch {
            return url.length > 50 ? url.substring(0, 50) + '...' : url;
        }
    };

    if (loading) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-slate-700 rounded w-1/4"></div>
                    <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-10 bg-slate-700/50 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-6 border border-red-900/30">
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                    📄 {language === 'en' ? 'Landing Pages' : 'Landing Pages'}
                </h3>
                <p className="text-sm text-red-400">{error}</p>
            </div>
        );
    }

    return (
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-200">
                    📄 {language === 'en' ? 'Landing Pages Performance' : 'Представяне на Landing Pages'}
                </h3>
            </div>

            {sortedPages.length === 0 ? (
                <p className="text-sm text-slate-500">
                    {language === 'en' ? 'No landing page data available' : 'Няма данни за landing pages'}
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-slate-500 border-b border-slate-700">
                                <th
                                    className="text-left py-2 font-medium cursor-pointer hover:text-slate-300 transition-colors"
                                    onClick={() => handleSort('landingPageUrl')}
                                >
                                    <div className="flex items-center gap-1">
                                        URL {sortBy === 'landingPageUrl' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                    </div>
                                </th>
                                <th
                                    className="text-right py-2 font-medium cursor-pointer hover:text-slate-300 transition-colors"
                                    onClick={() => handleSort('cost')}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        {language === 'en' ? 'Cost' : 'Разход'} {sortBy === 'cost' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                    </div>
                                </th>
                                <th
                                    className="text-right py-2 font-medium cursor-pointer hover:text-slate-300 transition-colors"
                                    onClick={() => handleSort('conversions')}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        {language === 'en' ? 'Conv.' : 'Конв.'} {sortBy === 'conversions' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                    </div>
                                </th>
                                <th
                                    className="text-right py-2 font-medium cursor-pointer hover:text-slate-300 transition-colors"
                                    onClick={() => handleSort('roas')}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        ROAS {sortBy === 'roas' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                    </div>
                                </th>
                                <th
                                    className="text-right py-2 font-medium cursor-pointer hover:text-slate-300 transition-colors"
                                    onClick={() => handleSort('landingPageExperience')}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        {language === 'en' ? 'LP Exp.' : 'Качество'} {sortBy === 'landingPageExperience' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                    </div>
                                </th>
                                <th
                                    className="text-right py-2 font-medium cursor-pointer hover:text-slate-300 transition-colors"
                                    onClick={() => handleSort('mobileFriendlyClicksPercentage')}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        {language === 'en' ? 'Mobile' : 'Мобилни'} {sortBy === 'mobileFriendlyClicksPercentage' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedPages.map((page, idx) => (
                                <tr
                                    key={idx}
                                    className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                                >
                                    <td className="py-2 max-w-[200px]">
                                        <a
                                            href={page.landingPageUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-violet-400 hover:text-violet-300 truncate block"
                                            title={page.landingPageUrl}
                                        >
                                            {extractPath(page.landingPageUrl)}
                                        </a>
                                    </td>
                                    <td className="text-right text-slate-300">{formatCurrency(page.cost)}</td>
                                    <td className="text-right text-slate-300">{page.conversions.toFixed(1)}</td>
                                    <td className={`text-right font-medium ${getRoasColor(page.roas)}`}>
                                        {page.roas ? page.roas.toFixed(2) : '—'}
                                    </td>
                                    <td className={`text-right font-medium ${getExperienceColor(page.landingPageExperience)}`}>
                                        {getExperienceLabel(page.landingPageExperience)}
                                    </td>
                                    <td className={`text-right ${getMobileColor(page.mobileFriendlyClicksPercentage)}`}>
                                        {formatPercent(page.mobileFriendlyClicksPercentage)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Summary stats */}
            {sortedPages.length > 0 && (
                <div className="mt-4 grid grid-cols-4 gap-3">
                    <div className="bg-slate-700/30 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-violet-400">{sortedPages.length}</div>
                        <div className="text-[10px] text-slate-400">{language === 'en' ? 'Pages' : 'Страници'}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-3 text-center col-span-2">
                        <div className="text-lg font-bold text-emerald-400">
                            {sortedPages.filter(p => p.landingPageExperience === 'ABOVE_AVERAGE').length}
                        </div>
                        <div className="text-[10px] text-slate-400">{language === 'en' ? 'Above Average Experience' : 'Над средното качество'}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-red-400">
                            {sortedPages.filter(p => p.landingPageExperience === 'BELOW_AVERAGE').length}
                        </div>
                        <div className="text-[10px] text-slate-400">{language === 'en' ? 'Below Average' : 'Под средното'}</div>
                    </div>
                </div>
            )}
        </div>
    );
}
