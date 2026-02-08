import React from 'react';

interface StrategicBreakdownProps {
    strategicBreakdown: any;
    categoryFilter: string | null;
    onCategorySelect: (category: string) => void;
    onClearFilter: () => void;
    onAnalyze: (category: string) => void;
}

const StrategicBreakdown: React.FC<StrategicBreakdownProps> = ({
    strategicBreakdown,
    categoryFilter,
    onCategorySelect,
    onClearFilter,
    onAnalyze
}) => {
    if (!strategicBreakdown) return null;

    return (
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 mb-6">
            <div className="flex justify-between items-center mb-3">
                <div>
                    <h3 className="text-sm font-semibold text-slate-300">Strategic Spend Breakdown</h3>
                    <p className="text-xs text-slate-400">Click to filter campaigns</p>
                </div>
                {categoryFilter && (
                    <button
                        onClick={onClearFilter}
                        className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded transition-colors"
                    >
                        Clear Filter
                    </button>
                )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {Object.entries(strategicBreakdown).map(([key, data]: [string, any]) => (
                    data.spend > 0 && (
                        <button
                            key={key}
                            onClick={() => onCategorySelect(key)}
                            className={`rounded-lg p-3 transition-all duration-200 border text-left relative overflow-hidden ${categoryFilter === key
                                ? 'ring-2 ring-white shadow-lg transform scale-105'
                                : 'hover:scale-105 hover:shadow-lg'
                                } ${key.startsWith('pmax') ? 'bg-purple-500/10 border-purple-500/30' :
                                    key.startsWith('search') ? 'bg-blue-500/10 border-blue-500/30' :
                                        key === 'shopping' ? 'bg-yellow-500/10 border-yellow-500/30' :
                                            key === 'upper_funnel' ? 'bg-orange-500/10 border-orange-500/30' :
                                                key === 'brand' ? 'bg-emerald-500/10 border-emerald-500/30' :
                                                    'bg-slate-700/50 border-slate-600'
                                }`}
                        >
                            {categoryFilter === key && (
                                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white animate-pulse"></div>
                            )}
                            <div className={`text-xs font-medium mb-1 ${key.startsWith('pmax') ? 'text-purple-400' :
                                key.startsWith('search') ? 'text-blue-400' :
                                    key === 'shopping' ? 'text-yellow-400' :
                                        key === 'upper_funnel' ? 'text-orange-400' :
                                            key === 'brand' ? 'text-emerald-400' :
                                                'text-slate-400'
                                }`}>
                                {key === 'pmax_sale' ? 'PMax – Sale' :
                                    key === 'pmax_aon' ? 'PMax – AON' :
                                        key === 'search_dsa' ? 'Search – DSA' :
                                            key === 'search_nonbrand' ? 'Search – NonBrand' :
                                                key === 'shopping' ? 'Shopping' :
                                                    key === 'upper_funnel' ? 'Video/Display' :
                                                        key === 'brand' ? 'Brand' :
                                                            'Other'}
                            </div>
                            <div className="text-lg font-bold text-white">{data.percentage.toFixed(1)}%</div>
                            <div className="text-xs text-slate-400">€{data.spend.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                            <div className="text-xs text-slate-500 mb-2">{data.campaigns} camp.</div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAnalyze(key);
                                }}
                                className="w-full mt-auto py-1 px-2 bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-colors border border-white/10"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Analyze
                            </button>
                        </button>
                    )
                ))}
            </div>
        </div>
    );
};

export default StrategicBreakdown;
