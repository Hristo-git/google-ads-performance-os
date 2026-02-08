"use client";

import { DeviceBreakdown as DeviceBreakdownType } from "@/types/google-ads";

interface DeviceBreakdownProps {
    data: DeviceBreakdownType[];
    campaignName?: string;
}

export default function DeviceBreakdown({ data, campaignName }: DeviceBreakdownProps) {
    if (!data || data.length === 0) {
        return (
            <div className="rounded-xl bg-slate-800 border border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-2">Device Performance</h3>
                <p className="text-slate-400 text-sm">No device data available for the selected period.</p>
            </div>
        );
    }

    // Aggregate by device if showing multiple campaigns
    const deviceAggregates = data.reduce((acc, item) => {
        const device = item.device;
        if (!acc[device]) {
            acc[device] = {
                device,
                cost: 0,
                conversions: 0,
                conversionValue: 0,
                clicks: 0,
                impressions: 0,
                crossDeviceConversions: 0,
                viewThroughConversions: 0
            };
        }
        acc[device].cost += item.cost;
        acc[device].conversions += item.conversions;
        acc[device].conversionValue += item.conversionValue;
        acc[device].clicks += item.clicks;
        acc[device].impressions += item.impressions;
        acc[device].crossDeviceConversions += item.crossDeviceConversions;
        acc[device].viewThroughConversions += item.viewThroughConversions;
        return acc;
    }, {} as Record<string, any>);

    const aggregatedData = Object.values(deviceAggregates);
    const totalCost = aggregatedData.reduce((sum, d) => sum + d.cost, 0);

    const getDeviceIcon = (device: string) => {
        switch (device) {
            case 'MOBILE':
                return '📱';
            case 'DESKTOP':
                return '💻';
            case 'TABLET':
                return '📋';
            default:
                return '📊';
        }
    };

    const getDeviceColor = (device: string) => {
        switch (device) {
            case 'MOBILE':
                return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
            case 'DESKTOP':
                return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
            case 'TABLET':
                return 'bg-green-500/10 border-green-500/30 text-green-400';
            default:
                return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
        }
    };

    return (
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">
                    Device Performance{campaignName ? ` - ${campaignName}` : ''}
                </h3>
                <div className="text-xs text-slate-400">
                    Total: €{totalCost.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </div>
            </div>

            {/* Device Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {aggregatedData.map((item) => {
                    const ctr = item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0;
                    const convRate = item.clicks > 0 ? (item.conversions / item.clicks) * 100 : 0;
                    const roas = item.cost > 0 ? item.conversionValue / item.cost : 0;
                    const costShare = totalCost > 0 ? (item.cost / totalCost) * 100 : 0;

                    return (
                        <div
                            key={item.device}
                            className={`rounded-lg border p-4 ${getDeviceColor(item.device)}`}
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-2xl">{getDeviceIcon(item.device)}</span>
                                <div>
                                    <div className="font-semibold">{item.device}</div>
                                    <div className="text-xs opacity-75">{costShare.toFixed(1)}% of spend</div>
                                </div>
                            </div>

                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="opacity-75">Cost:</span>
                                    <span className="font-semibold">€{item.cost.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="opacity-75">Conversions:</span>
                                    <span className="font-semibold">{item.conversions.toFixed(1)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="opacity-75">CTR:</span>
                                    <span className="font-semibold">{ctr.toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="opacity-75">Conv Rate:</span>
                                    <span className="font-semibold">{convRate.toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="opacity-75">ROAS:</span>
                                    <span className="font-semibold">{roas.toFixed(2)}x</span>
                                </div>
                            </div>

                            {/* Cross-Device & View-Through */}
                            {(item.crossDeviceConversions > 0 || item.viewThroughConversions > 0) && (
                                <div className="mt-3 pt-3 border-t border-current/20 space-y-1 text-xs opacity-75">
                                    {item.crossDeviceConversions > 0 && (
                                        <div className="flex justify-between">
                                            <span>Cross-Device:</span>
                                            <span>{item.crossDeviceConversions.toFixed(1)}</span>
                                        </div>
                                    )}
                                    {item.viewThroughConversions > 0 && (
                                        <div className="flex justify-between">
                                            <span>View-Through:</span>
                                            <span>{item.viewThroughConversions.toFixed(1)}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Visual Bar Chart */}
            <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-300">Cost Distribution</div>
                <div className="space-y-2">
                    {aggregatedData.map((item) => {
                        const costShare = totalCost > 0 ? (item.cost / totalCost) * 100 : 0;
                        return (
                            <div key={item.device} className="flex items-center gap-3">
                                <div className="w-20 text-xs text-slate-400">{item.device}</div>
                                <div className="flex-1 bg-slate-700/50 rounded-full h-6 overflow-hidden relative">
                                    <div
                                        className={`h-full flex items-center justify-end px-2 text-xs font-semibold transition-all ${item.device === 'MOBILE' ? 'bg-blue-500' :
                                                item.device === 'DESKTOP' ? 'bg-purple-500' :
                                                    item.device === 'TABLET' ? 'bg-green-500' : 'bg-slate-500'
                                            }`}
                                        style={{ width: `${costShare}%` }}
                                    >
                                        {costShare > 10 && <span className="text-white">{costShare.toFixed(1)}%</span>}
                                    </div>
                                </div>
                                <div className="w-24 text-right text-xs text-slate-300">
                                    €{item.cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
