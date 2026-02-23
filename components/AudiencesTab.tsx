
"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowUpDown, ChevronUp, ChevronDown, Users, Search, X } from "lucide-react";
import { fmtInt, fmtNum, fmtEuro, fmtPct, fmtX } from '@/lib/format';

interface AudiencePerformance {
    campaignId: string;
    campaignName: string;
    adGroupId: string;
    adGroupName: string;
    criterionId: string;
    audienceName: string;
    audienceType?: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    cpc: number;
    ctr: number;
    roas: number | null;
    cpa: number | null;
    searchImpressionShare: number | null;
    searchLostISRank: number | null;
}

interface AudiencesTabProps {
    customerId: string;
    dateRange: { start: string; end: string };
    language?: 'bg' | 'en';
    campaignIds?: string[];
}

export default function AudiencesTab({
    customerId,
    dateRange,
    language = 'bg',
    campaignIds
}: AudiencesTabProps) {
    const [audiences, setAudiences] = useState<AudiencePerformance[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<keyof AudiencePerformance>('cost');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [filterName, setFilterName] = useState('');
    const [filterType, setFilterType] = useState<string>('all');
    const [filterCampaign, setFilterCampaign] = useState<string>('all');

    useEffect(() => {
        const fetchAudiences = async () => {
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
                const res = await fetch(`/api/google-ads/audiences?${params}`);
                const data = await res.json();

                if (data.error) {
                    setError(data.error);
                } else if (data.audiences) {
                    setAudiences(data.audiences);
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load audiences');
            } finally {
                setLoading(false);
            }
        };

        fetchAudiences();
    }, [customerId, dateRange.start, dateRange.end, campaignIds]);

    const uniqueTypes = useMemo(() =>
        Array.from(new Set(audiences.map(a => a.audienceType || 'Other'))).sort(),
        [audiences]
    );
    const uniqueCampaigns = useMemo(() =>
        Array.from(new Set(audiences.map(a => a.campaignName))).sort(),
        [audiences]
    );

    const filteredAudiences = useMemo(() => {
        return audiences.filter(a => {
            if (filterName && !a.audienceName.toLowerCase().includes(filterName.toLowerCase())) return false;
            if (filterType !== 'all' && (a.audienceType || 'Other') !== filterType) return false;
            if (filterCampaign !== 'all' && a.campaignName !== filterCampaign) return false;
            return true;
        });
    }, [audiences, filterName, filterType, filterCampaign]);

    const sortedAudiences = useMemo(() => {
        return [...filteredAudiences].sort((a, b) => {
            let valA: any = a[sortBy];
            let valB: any = b[sortBy];

            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredAudiences, sortBy, sortOrder]);

    const hasActiveFilters = filterName || filterType !== 'all' || filterCampaign !== 'all';
    const clearFilters = () => { setFilterName(''); setFilterType('all'); setFilterCampaign('all'); };

    const handleSort = (key: keyof AudiencePerformance) => {
        if (sortBy === key) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            setSortOrder('desc');
        }
    };

    const getRoasColor = (roas: number | null) => {
        if (roas === null) return 'text-slate-500';
        if (roas >= 4) return 'text-emerald-400';
        if (roas >= 2) return 'text-amber-400';
        return 'text-red-400';
    };

    const getISColor = (is: number | null) => {
        if (is === null || is === undefined) return 'text-slate-500';
        if (is >= 0.8) return 'text-emerald-400';
        if (is >= 0.5) return 'text-amber-400';
        return 'text-red-400';
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
                    <Users className="w-5 h-5 inline mr-2" />
                    {language === 'en' ? 'Audiences' : 'Аудитории'}
                </h3>
                <p className="text-sm text-red-400">{error}</p>
            </div>
        );
    }

    return (
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                    <Users className="w-5 h-5 text-violet-400" />
                    {language === 'en' ? 'Audience Performance' : 'Представяне на аудиториите'}
                </h3>
            </div>

            {/* Filters */}
            {audiences.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            value={filterName}
                            onChange={(e) => setFilterName(e.target.value)}
                            placeholder={language === 'en' ? 'Search audience...' : 'Търси аудитория...'}
                            className="bg-slate-700/50 border border-slate-600 text-slate-300 text-xs rounded-lg pl-8 pr-3 py-1.5 w-48 focus:ring-violet-500 focus:border-violet-500 placeholder-slate-500"
                        />
                    </div>
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="bg-slate-700/50 border border-slate-600 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:ring-violet-500 focus:border-violet-500"
                    >
                        <option value="all">{language === 'en' ? 'All Types' : 'Всички типове'}</option>
                        {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select
                        value={filterCampaign}
                        onChange={(e) => setFilterCampaign(e.target.value)}
                        className="bg-slate-700/50 border border-slate-600 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 max-w-[250px] focus:ring-violet-500 focus:border-violet-500"
                    >
                        <option value="all">{language === 'en' ? 'All Campaigns' : 'Всички кампании'}</option>
                        {uniqueCampaigns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                            {language === 'en' ? 'Clear' : 'Изчисти'}
                        </button>
                    )}
                    {hasActiveFilters && (
                        <span className="text-[10px] text-slate-500">
                            {sortedAudiences.length} / {audiences.length}
                        </span>
                    )}
                </div>
            )}

            {sortedAudiences.length === 0 ? (
                <p className="text-sm text-slate-500">
                    {language === 'en' ? 'No audience data available for this period' : 'Няма данни за аудиториите за този период'}
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-slate-500 border-b border-slate-700">
                                <th className="text-left py-2 font-medium pl-2">
                                    <button
                                        className="flex items-center gap-1 hover:text-slate-300 transition-colors w-full text-left"
                                        onClick={() => handleSort('audienceName')}
                                        type="button"
                                    >
                                        {language === 'en' ? 'Audience' : 'Аудитория'}
                                        {sortBy === 'audienceName' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                    </button>
                                </th>
                                <th className="text-left py-2 font-medium">
                                    <button
                                        className="flex items-center gap-1 hover:text-slate-300 transition-colors w-full text-left"
                                        onClick={() => handleSort('audienceType')}
                                        type="button"
                                    >
                                        {language === 'en' ? 'Type' : 'Тип'}
                                        {sortBy === 'audienceType' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                    </button>
                                </th>
                                <th className="text-left py-2 font-medium hidden md:table-cell">
                                    <button
                                        className="flex items-center gap-1 hover:text-slate-300 transition-colors w-full text-left"
                                        onClick={() => handleSort('campaignName')}
                                        type="button"
                                    >
                                        {language === 'en' ? 'Campaign' : 'Кампания'}
                                        {sortBy === 'campaignName' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                                    </button>
                                </th>
                                <th className="text-right py-2 font-medium">
                                    <button
                                        className="flex items-center justify-end gap-1 hover:text-slate-300 transition-colors w-full"
                                        onClick={() => handleSort('impressions')}
                                        type="button"
                                    >
                                        Impr. {sortBy === 'impressions' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </button>
                                </th>
                                <th className="text-right py-2 font-medium">
                                    <button
                                        className="flex items-center justify-end gap-1 hover:text-slate-300 transition-colors w-full"
                                        onClick={() => handleSort('clicks')}
                                        type="button"
                                    >
                                        Clicks {sortBy === 'clicks' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </button>
                                </th>
                                <th className="text-right py-2 font-medium">
                                    <button
                                        className="flex items-center justify-end gap-1 hover:text-slate-300 transition-colors w-full"
                                        onClick={() => handleSort('cost')}
                                        type="button"
                                    >
                                        {language === 'en' ? 'Cost' : 'Разход'} {sortBy === 'cost' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </button>
                                </th>
                                <th className="text-right py-2 font-medium">
                                    <button
                                        className="flex items-center justify-end gap-1 hover:text-slate-300 transition-colors w-full"
                                        onClick={() => handleSort('conversions')}
                                        type="button"
                                    >
                                        {language === 'en' ? 'Conv.' : 'Конв.'} {sortBy === 'conversions' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </button>
                                </th>
                                <th className="text-right py-2 font-medium">
                                    <button
                                        className="flex items-center justify-end gap-1 hover:text-slate-300 transition-colors w-full"
                                        onClick={() => handleSort('conversionValue')}
                                        type="button"
                                    >
                                        Revenue {sortBy === 'conversionValue' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </button>
                                </th>
                                <th className="text-right py-2 font-medium">
                                    <button
                                        className="flex items-center justify-end gap-1 hover:text-slate-300 transition-colors w-full"
                                        onClick={() => handleSort('roas')}
                                        type="button"
                                    >
                                        ROAS {sortBy === 'roas' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </button>
                                </th>
                                <th className="text-right py-2 font-medium">
                                    <button
                                        className="flex items-center justify-end gap-1 hover:text-slate-300 transition-colors w-full"
                                        onClick={() => handleSort('searchImpressionShare')}
                                        type="button"
                                    >
                                        IS {sortBy === 'searchImpressionShare' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </button>
                                </th>
                                <th className="text-right py-2 font-medium">
                                    <button
                                        className="flex items-center justify-end gap-1 hover:text-slate-300 transition-colors w-full"
                                        onClick={() => handleSort('searchLostISRank')}
                                        type="button"
                                    >
                                        Lost (Rank) {sortBy === 'searchLostISRank' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </button>
                                </th>
                                <th className="text-right py-2 font-medium pr-2">
                                    <button
                                        className="flex items-center justify-end gap-1 hover:text-slate-300 transition-colors w-full"
                                        onClick={() => handleSort('cpa')}
                                        type="button"
                                    >
                                        CPA {sortBy === 'cpa' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                    </button>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedAudiences.map((audience, idx) => (
                                <tr
                                    key={`${audience.campaignId}-${audience.adGroupId}-${audience.criterionId}-${idx}`}
                                    className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                                >
                                    <td className="py-2 pl-2 max-w-[200px]">
                                        <div className="text-slate-200 font-medium truncate" title={audience.audienceName}>
                                            {audience.audienceName}
                                        </div>
                                        <div className="text-[10px] text-slate-500 truncate md:hidden">
                                            {audience.campaignName}
                                        </div>
                                    </td>
                                    <td className="py-2">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${audience.audienceType === 'Interest' ? 'bg-violet-500/20 text-violet-300' :
                                            audience.audienceType === 'Remarketing' ? 'bg-amber-500/20 text-amber-300' :
                                                audience.audienceType === 'Custom' ? 'bg-cyan-500/20 text-cyan-300' :
                                                    audience.audienceType === 'Combined' ? 'bg-blue-500/20 text-blue-300' :
                                                        'bg-slate-600/50 text-slate-400'
                                            }`}>
                                            {audience.audienceType || 'Other'}
                                        </span>
                                    </td>
                                    <td className="py-2 hidden md:table-cell max-w-[150px]">
                                        <div className="text-slate-400 truncate" title={audience.campaignName}>
                                            {audience.campaignName}
                                        </div>
                                    </td>
                                    <td className="text-right text-slate-400">{fmtInt(audience.impressions)}</td>
                                    <td className="text-right text-slate-400">{fmtInt(audience.clicks)}</td>
                                    <td className="text-right text-slate-300">{fmtEuro(audience.cost)}</td>
                                    <td className="text-right text-slate-300">{fmtNum(audience.conversions, 1)}</td>
                                    <td className="text-right text-slate-300">{fmtEuro(audience.conversionValue)}</td>
                                    <td className={`text-right font-medium ${getRoasColor(audience.roas)}`}>
                                        {fmtX(audience.roas)}
                                    </td>
                                    <td className={`text-right font-medium ${getISColor(audience.searchImpressionShare)}`}>
                                        {audience.searchImpressionShare != null ? fmtPct(audience.searchImpressionShare * 100, 1) : '—'}
                                    </td>
                                    <td className="text-right">
                                        {audience.searchLostISRank != null ? (
                                            <span className={`font-medium ${audience.searchLostISRank > 0.3 ? 'text-red-400' : 'text-slate-400'}`}>
                                                {fmtPct(audience.searchLostISRank * 100, 1)}
                                            </span>
                                        ) : <span className="text-slate-500">—</span>}
                                    </td>
                                    <td className="text-right text-slate-300 pr-2">
                                        {audience.cpa ? fmtEuro(audience.cpa) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Summary stats */}
            {sortedAudiences.length > 0 && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-700/30 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-violet-400">{sortedAudiences.length}</div>
                        <div className="text-[10px] text-slate-400">{language === 'en' ? 'Audiences' : 'Аудитории'}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-emerald-400">
                            {/* High ROAS Audiences */}
                            {sortedAudiences.filter(a => (a.roas || 0) > 4).length}
                        </div>
                        <div className="text-[10px] text-slate-400">ROAS &gt; 4.0</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-slate-200">
                            {/* Total Spend */}
                            {fmtEuro(sortedAudiences.reduce((sum, a) => sum + a.cost, 0))}
                        </div>
                        <div className="text-[10px] text-slate-400">{language === 'en' ? 'Total Spend' : 'Общ разход'}</div>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-slate-200">
                            {/* Total Conversions */}
                            {fmtInt(sortedAudiences.reduce((sum, a) => sum + a.conversions, 0))}
                        </div>
                        <div className="text-[10px] text-slate-400">{language === 'en' ? 'Conversions' : 'Конверсии'}</div>
                    </div>
                </div>
            )}
        </div>
    );
}
