"use client";

interface DeviceBadgeProps {
    deviceBreakdown: {
        device: string;
        impressions: number;
        clicks: number;
        cost: number;
        conversions: number;
        conversionValue: number;
        roas: number | null;
    }[];
    compact?: boolean;
}

export default function DeviceBadge({ deviceBreakdown, compact = true }: DeviceBadgeProps) {
    if (!deviceBreakdown || deviceBreakdown.length === 0) return null;

    const mobile = deviceBreakdown.find(d => d.device === 'MOBILE');
    const desktop = deviceBreakdown.find(d => d.device === 'DESKTOP');

    if (!mobile && !desktop) return null;

    const mobileRoas = mobile?.roas || 0;
    const desktopRoas = desktop?.roas || 0;
    const totalCost = deviceBreakdown.reduce((sum, d) => sum + d.cost, 0);
    const mobileCostShare = totalCost > 0 && mobile ? (mobile.cost / totalCost) * 100 : 0;

    // Calculate performance difference
    const diff = mobileRoas > 0 && desktopRoas > 0
        ? ((mobileRoas - desktopRoas) / desktopRoas) * 100
        : null;

    const getBadgeColor = () => {
        if (diff === null) return 'bg-slate-600/50 text-slate-400';
        if (diff > 20) return 'bg-emerald-500/20 text-emerald-400'; // Mobile wins
        if (diff < -20) return 'bg-violet-500/20 text-violet-400'; // Desktop wins
        return 'bg-amber-500/20 text-amber-400'; // Close
    };

    const getIconAndLabel = () => {
        if (diff === null) return { icon: '📱', label: 'N/A' };
        if (diff > 10) return { icon: '📱', label: `+${diff.toFixed(0)}%` }; // Mobile better
        if (diff < -10) return { icon: '🖥️', label: `+${Math.abs(diff).toFixed(0)}%` }; // Desktop better
        return { icon: '⚖️', label: 'Even' }; // Similar
    };

    const { icon, label } = getIconAndLabel();

    if (compact) {
        return (
            <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${getBadgeColor()}`}
                title={`Mobile ROAS: ${mobileRoas.toFixed(2)} | Desktop ROAS: ${desktopRoas.toFixed(2)} | Mobile spend: ${mobileCostShare.toFixed(0)}%`}
            >
                {icon} {label}
            </span>
        );
    }

    return (
        <div className={`flex items-center gap-2 px-2 py-1 rounded ${getBadgeColor()}`}>
            <span className="text-xs">{icon}</span>
            <div className="text-[10px]">
                <div className="font-medium">{label}</div>
                <div className="text-slate-400">
                    📱 {mobileRoas.toFixed(1)} / 🖥️ {desktopRoas.toFixed(1)}
                </div>
            </div>
        </div>
    );
}
