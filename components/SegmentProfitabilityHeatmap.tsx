"use client";

import { useMemo } from "react";
import { fmtEuro, fmtPct, fmtX, fmtNum } from "@/lib/format";

const TARGET_MARGIN = 0.31;

const CATEGORY_META: Record<string, { label: string; color: string }> = {
    pmax_aon:       { label: "PMax – AON",        color: "text-purple-400" },
    pmax_sale:      { label: "PMax – Sale",        color: "text-pink-400" },
    search_nonbrand:{ label: "Search – NonBrand",  color: "text-blue-400" },
    search_dsa:     { label: "Search – DSA",       color: "text-cyan-400" },
    brand:          { label: "Brand",              color: "text-emerald-400" },
    upper_funnel:   { label: "Video / Display",    color: "text-orange-400" },
    shopping:       { label: "Shopping",           color: "text-yellow-400" },
    other:          { label: "Other",              color: "text-slate-400" },
};

function getCampaignCategory(c: any): string {
    const name = (c.name || "").trim().toLowerCase().replace(/\s+/g, " ");
    const ch = String(c.advertisingChannelType || "");
    if (name.includes("brand") || name.includes("бренд") || name.includes("защита")) return "brand";
    const isPMax = ch === "PERFORMANCE_MAX" || ch === "10" || name.includes("pmax") || name.includes("performance");
    if (isPMax) {
        if (name.includes("[sale]") || name.includes("sale") || name.includes("promo") ||
            name.includes("discount") || name.includes("намал") || name.includes("промо") ||
            name.includes("reducere") || name.includes("oferta")) return "pmax_sale";
        return "pmax_aon";
    }
    if (name.includes("dsa")) return "search_dsa";
    if (name.includes("sn") || name.includes("search") || name.includes("wd_s")) return "search_nonbrand";
    if (ch === "VIDEO" || ch === "DISPLAY" || ch === "DEMAND_GEN" || ch === "DISCOVERY" ||
        ch === "6" || ch === "3" || ch === "14" || ch === "12" ||
        name.includes("video") || name.includes("display") || name.includes("youtube") || name.includes("dg - video")) return "upper_funnel";
    if (name.includes("shop") || ch === "SHOPPING" || ch === "4") return "shopping";
    return "other";
}

interface Props {
    campaigns: any[];
}

export default function SegmentProfitabilityHeatmap({ campaigns }: Props) {
    const segments = useMemo(() => {
        const map: Record<string, { cost: number; conversions: number; conversionValue: number; clicks: number; impressions: number; camps: number }> = {};

        for (const c of campaigns) {
            const cat = getCampaignCategory(c);
            if (!map[cat]) map[cat] = { cost: 0, conversions: 0, conversionValue: 0, clicks: 0, impressions: 0, camps: 0 };
            map[cat].cost          += c.cost          || 0;
            map[cat].conversions   += c.conversions   || 0;
            map[cat].conversionValue += c.conversionValue || 0;
            map[cat].clicks        += c.clicks        || 0;
            map[cat].impressions   += c.impressions   || 0;
            map[cat].camps         += 1;
        }

        const totalCost = Object.values(map).reduce((s, v) => s + v.cost, 0);

        return Object.entries(map)
            .map(([cat, m]) => {
                const ers = m.conversionValue > 0 ? m.cost / m.conversionValue : null;
                const profitability = ers !== null ? TARGET_MARGIN - ers : null;
                const roas = m.cost > 0 ? m.conversionValue / m.cost : null;
                const aov = m.conversions > 0 ? m.conversionValue / m.conversions : null;
                const cvr = m.clicks > 0 ? m.conversions / m.clicks : null;
                const spendPct = totalCost > 0 ? m.cost / totalCost : 0;
                return { cat, ...m, ers, profitability, roas, aov, cvr, spendPct };
            })
            .filter(s => s.cost > 0)
            .sort((a, b) => b.cost - a.cost);
    }, [campaigns]);

    if (!segments.length) {
        return (
            <div className="p-8 text-center text-slate-500">No campaign data available.</div>
        );
    }

    const cardBg = (p: number | null) => {
        if (p === null) return "bg-slate-800/40 border-slate-700/50";
        if (p >= 0.10) return "bg-emerald-950/40 border-emerald-800/50";
        if (p >= 0)    return "bg-emerald-950/20 border-emerald-900/30";
        if (p >= -0.10) return "bg-red-950/20 border-red-900/30";
        return "bg-red-950/40 border-red-800/50";
    };

    const profColor = (p: number | null) => {
        if (p === null) return "text-slate-400";
        if (p >= 0) return "text-emerald-400";
        return "text-red-400";
    };

    const ersColor = (ers: number | null) => {
        if (ers === null) return "text-slate-400";
        return ers <= TARGET_MARGIN ? "text-emerald-400" : "text-red-400";
    };

    return (
        <div>
            <div className="mb-4 flex items-center gap-3">
                <p className="text-sm text-slate-400">
                    Profitability = Target Margin ({fmtPct(TARGET_MARGIN * 100, 0)}) − ERS per campaign category
                </p>
                <span className="text-xs text-slate-600">|</span>
                <span className="text-xs text-emerald-400 font-medium">Green = profitable</span>
                <span className="text-xs text-red-400 font-medium">Red = over-spending</span>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {segments.map(s => {
                    const meta = CATEGORY_META[s.cat] || { label: s.cat, color: "text-slate-400" };
                    return (
                        <div key={s.cat} className={`rounded-xl border p-5 flex flex-col gap-3 ${cardBg(s.profitability)}`}>
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2">
                                <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
                                <span className="text-xs text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded shrink-0">
                                    {s.camps} camp.
                                </span>
                            </div>

                            {/* Profitability — hero metric */}
                            <div>
                                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Profitability</div>
                                <div className={`text-2xl font-black ${profColor(s.profitability)}`}>
                                    {s.profitability !== null
                                        ? `${s.profitability >= 0 ? "+" : ""}${fmtPct(s.profitability * 100, 1)}`
                                        : "—"}
                                </div>
                            </div>

                            {/* Grid of metrics */}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                <div>
                                    <div className="text-slate-500 uppercase tracking-wider text-[9px]">Spend</div>
                                    <div className="text-white font-semibold">{fmtEuro(s.cost, 0)}</div>
                                    <div className="text-slate-500 text-[10px]">{fmtPct(s.spendPct * 100, 1)} of total</div>
                                </div>
                                <div>
                                    <div className="text-slate-500 uppercase tracking-wider text-[9px]">ERS</div>
                                    <div className={`font-semibold ${ersColor(s.ers)}`}>
                                        {s.ers !== null ? fmtPct(s.ers * 100, 1) : "—"}
                                    </div>
                                    <div className="text-slate-500 text-[10px]">target {fmtPct(TARGET_MARGIN * 100, 0)}</div>
                                </div>
                                <div>
                                    <div className="text-slate-500 uppercase tracking-wider text-[9px]">Conv. Value</div>
                                    <div className="text-emerald-400 font-semibold">{fmtEuro(s.conversionValue, 0)}</div>
                                </div>
                                <div>
                                    <div className="text-slate-500 uppercase tracking-wider text-[9px]">ROAS</div>
                                    <div className={`font-semibold ${s.roas !== null ? (s.roas >= 3 ? "text-emerald-400" : s.roas >= 1 ? "text-amber-400" : "text-red-400") : "text-slate-400"}`}>
                                        {s.roas !== null ? fmtX(s.roas) : "—"}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-slate-500 uppercase tracking-wider text-[9px]">AOV</div>
                                    <div className="text-slate-300 font-semibold">{s.aov !== null ? fmtEuro(s.aov, 0) : "—"}</div>
                                </div>
                                <div>
                                    <div className="text-slate-500 uppercase tracking-wider text-[9px]">Conv.</div>
                                    <div className="text-slate-300 font-semibold">{fmtNum(s.conversions, 1)}</div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
