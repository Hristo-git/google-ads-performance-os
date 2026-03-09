"use client";

import { useMemo, useState, useEffect } from "react";
import { fmtEuro, fmtPct, fmtX, fmtNum } from "@/lib/format";

const TARGET_MARGIN = 0.31;

// ─── Campaign Category ────────────────────────────────────────────────────────

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

// ─── Product Category Taxonomy ────────────────────────────────────────────────

interface ProductCatDef {
    label: string;
    color: string;
    keywords: string[];
}

const PRODUCT_CATEGORIES: Record<string, ProductCatDef> = {
    sofas:      { label: "Дивани",        color: "text-violet-400",  keywords: ["диван", "divan", "sofa", "ъглов", "правоъгълен диван", "разтегателен", "канапе"] },
    beds:       { label: "Легла",         color: "text-blue-400",    keywords: ["легло", "легла", "bed", "тапицирано легло", "двойно легло", "единично легло", "рамка за легло"] },
    mattresses: { label: "Матраци",       color: "text-cyan-400",    keywords: ["матрак", "матраци", "mattress", "пружинен", "латекс матрак", "ортопедичен"] },
    wardrobes:  { label: "Гардероби",     color: "text-emerald-400", keywords: ["гардероб", "гардероби", "wardrobe", "плъзгащи врати", "гардероб с огледало"] },
    tables:     { label: "Маси",          color: "text-amber-400",   keywords: ["маса", "маси", "table", "трапезна маса", "кухненска маса", "coffee table", "холна маса"] },
    chairs:     { label: "Столове",       color: "text-orange-400",  keywords: ["стол", "столове", "chair", "трапезен стол", "офис стол", "табуретка"] },
    cabinets:   { label: "Шкафове",       color: "text-pink-400",    keywords: ["шкаф", "шкафове", "скрин", "нощно шкафче", "нощно шкафчe", "библиотека", "tv шкаф", "тв шкаф", "vitrina", "витрина"] },
    desks:      { label: "Бюра",          color: "text-rose-400",    keywords: ["бюро", "бюра", "desk", "работна маса", "компютърна маса"] },
    rugs:       { label: "Килими",        color: "text-yellow-400",  keywords: ["килим", "килими", "rug", "carpet", "мокет"] },
    bedding:    { label: "Спално бельо",  color: "text-teal-400",    keywords: ["завивка", "завивки", "възглавница", "спално бельо", "pillow", "duvet", "юрган", "чаршаф"] },
    lighting:   { label: "Осветление",   color: "text-lime-400",    keywords: ["осветление", "лампа", "lamp", "осветителни", "полилей", "аплик", "spot"] },
    furniture:  { label: "Мебели (общо)", color: "text-slate-400",   keywords: ["мебели", "мебел", "furniture", "обзавеждане"] },
};

function getProductCategory(keywordText: string): string | null {
    const lower = keywordText.toLowerCase();
    for (const [cat, def] of Object.entries(PRODUCT_CATEGORIES)) {
        if (def.keywords.some(kw => lower.includes(kw))) return cat;
    }
    return null; // не класифицирана
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const cardBg = (p: number | null) => {
    if (p === null) return "bg-slate-800/40 border-slate-700/50";
    if (p >= 0.10) return "bg-emerald-950/40 border-emerald-800/50";
    if (p >= 0)    return "bg-emerald-950/20 border-emerald-900/30";
    if (p >= -0.10) return "bg-red-950/20 border-red-900/30";
    return "bg-red-950/40 border-red-800/50";
};
const profColor = (p: number | null) => (p === null ? "text-slate-400" : p >= 0 ? "text-emerald-400" : "text-red-400");
const ersColor  = (e: number | null) => (e === null ? "text-slate-400" : e <= TARGET_MARGIN ? "text-emerald-400" : "text-red-400");

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
    campaigns: any[];
    customerId?: string;
    dateRange?: { start: string; end: string };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SegmentProfitabilityHeatmap({ campaigns, customerId, dateRange }: Props) {

    // ── Campaign Category Heatmap ──
    const segments = useMemo(() => {
        const map: Record<string, { cost: number; conversions: number; conversionValue: number; clicks: number; impressions: number; camps: number }> = {};

        for (const c of campaigns) {
            const cat = getCampaignCategory(c);
            if (!map[cat]) map[cat] = { cost: 0, conversions: 0, conversionValue: 0, clicks: 0, impressions: 0, camps: 0 };
            map[cat].cost            += c.cost            || 0;
            map[cat].conversions     += c.conversions     || 0;
            map[cat].conversionValue += c.conversionValue || 0;
            map[cat].clicks          += c.clicks          || 0;
            map[cat].impressions     += c.impressions     || 0;
            map[cat].camps           += 1;
        }

        const totalCost = Object.values(map).reduce((s, v) => s + v.cost, 0);

        return Object.entries(map)
            .map(([cat, m]) => {
                const ers          = m.conversionValue > 0 ? m.cost / m.conversionValue : null;
                const profitability = ers !== null ? TARGET_MARGIN - ers : null;
                const roas         = m.cost > 0 ? m.conversionValue / m.cost : null;
                const aov          = m.conversions > 0 ? m.conversionValue / m.conversions : null;
                const spendPct     = totalCost > 0 ? m.cost / totalCost : 0;
                return { cat, ...m, ers, profitability, roas, aov, spendPct };
            })
            .filter(s => s.cost > 0)
            .sort((a, b) => b.cost - a.cost);
    }, [campaigns]);

    // ── Keyword DDA fetch ──
    const [kwLoading, setKwLoading] = useState(false);
    const [kwError, setKwError]     = useState<string | null>(null);
    const [productSegments, setProductSegments] = useState<any[]>([]);

    useEffect(() => {
        if (!customerId || !dateRange?.start || !dateRange?.end) return;
        setKwLoading(true);
        setKwError(null);

        const params = new URLSearchParams({
            customerId,
            startDate: dateRange.start,
            endDate:   dateRange.end,
        });

        fetch(`/api/google-ads/keyword-dda?${params}`)
            .then(r => r.json())
            .then(data => {
                if (data.error) throw new Error(data.error);

                const map: Record<string, { allConversions: number; allConversionValue: number; cost: number; conversions: number; kwCount: number }> = {};

                for (const kw of (data.keywords || [])) {
                    const cat = getProductCategory(kw.keywordText);
                    if (!cat) continue;
                    if (!map[cat]) map[cat] = { allConversions: 0, allConversionValue: 0, cost: 0, conversions: 0, kwCount: 0 };
                    map[cat].allConversions    += kw.allConversions    || 0;
                    map[cat].allConversionValue += kw.allConversionValue || 0;
                    map[cat].cost              += kw.cost              || 0;
                    map[cat].conversions       += kw.conversions       || 0;
                    map[cat].kwCount           += 1;
                }

                const totalAllValue = Object.values(map).reduce((s, v) => s + v.allConversionValue, 0);

                const segs = Object.entries(map)
                    .map(([cat, m]) => {
                        const def  = PRODUCT_CATEGORIES[cat];
                        const ers  = m.allConversionValue > 0 ? m.cost / m.allConversionValue : null;
                        const roas = m.cost > 0 ? m.allConversionValue / m.cost : null;
                        const aov  = m.allConversions > 0 ? m.allConversionValue / m.allConversions : null;
                        const profitability = ers !== null ? TARGET_MARGIN - ers : null;
                        const valuePct = totalAllValue > 0 ? m.allConversionValue / totalAllValue : 0;
                        return { cat, def, ...m, ers, roas, aov, profitability, valuePct };
                    })
                    .filter(s => s.allConversionValue > 0)
                    .sort((a, b) => b.allConversionValue - a.allConversionValue);

                setProductSegments(segs);
            })
            .catch(e => setKwError(e.message))
            .finally(() => setKwLoading(false));
    }, [customerId, dateRange?.start, dateRange?.end]);

    if (!segments.length) {
        return <div className="p-8 text-center text-slate-500">No campaign data available.</div>;
    }

    return (
        <div className="space-y-10">

            {/* ── Section 1: Campaign Category ── */}
            <div>
                <div className="mb-4 flex items-center gap-3">
                    <h3 className="text-base font-bold text-white">By Campaign Type</h3>
                    <span className="text-xs text-slate-500">Last-click metrics</span>
                    <span className="text-xs text-slate-600">|</span>
                    <span className="text-xs text-emerald-400 font-medium">Green = profitable</span>
                    <span className="text-xs text-red-400 font-medium">Red = over-spending</span>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                    Profitability = Target Margin ({fmtPct(TARGET_MARGIN * 100, 0)}) − ERS
                </p>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                    {segments.map(s => {
                        const meta = CATEGORY_META[s.cat] || { label: s.cat, color: "text-slate-400" };
                        return (
                            <div key={s.cat} className={`rounded-xl border p-5 flex flex-col gap-3 ${cardBg(s.profitability)}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
                                    <span className="text-xs text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded shrink-0">
                                        {s.camps} camp.
                                    </span>
                                </div>
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Profitability</div>
                                    <div className={`text-2xl font-black ${profColor(s.profitability)}`}>
                                        {s.profitability !== null
                                            ? `${s.profitability >= 0 ? "+" : ""}${fmtPct(s.profitability * 100, 1)}`
                                            : "—"}
                                    </div>
                                </div>
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

            {/* ── Section 2: Product Category DDA ── */}
            <div>
                <div className="mb-4 flex items-center gap-3">
                    <h3 className="text-base font-bold text-white">By Product Category</h3>
                    <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded font-medium">DDA Attribution</span>
                    <span className="text-xs text-slate-500">Keyword-level · all_conversions</span>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                    Aggregated DDA conversion value from all keywords per product category, across all campaign types (incl. Brand).
                </p>

                {kwLoading && (
                    <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
                        Loading keyword DDA data...
                    </div>
                )}
                {kwError && (
                    <div className="h-32 flex items-center justify-center text-red-400 text-sm">
                        {kwError}
                    </div>
                )}
                {!kwLoading && !kwError && productSegments.length === 0 && (
                    <div className="h-32 flex items-center justify-center text-slate-500 text-sm">
                        No classified keyword data found for the selected period.
                    </div>
                )}
                {!kwLoading && !kwError && productSegments.length > 0 && (
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                        {productSegments.map(s => (
                            <div key={s.cat} className={`rounded-xl border p-5 flex flex-col gap-3 ${cardBg(s.profitability)}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <span className={`text-sm font-bold ${s.def?.color || "text-slate-400"}`}>
                                        {s.def?.label || s.cat}
                                    </span>
                                    <span className="text-xs text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded shrink-0">
                                        {s.kwCount} kw.
                                    </span>
                                </div>

                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Profitability (DDA)</div>
                                    <div className={`text-2xl font-black ${profColor(s.profitability)}`}>
                                        {s.profitability !== null
                                            ? `${s.profitability >= 0 ? "+" : ""}${fmtPct(s.profitability * 100, 1)}`
                                            : "—"}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                    <div>
                                        <div className="text-slate-500 uppercase tracking-wider text-[9px]">DDA Value</div>
                                        <div className="text-emerald-400 font-semibold">{fmtEuro(s.allConversionValue, 0)}</div>
                                        <div className="text-slate-500 text-[10px]">{fmtPct(s.valuePct * 100, 1)} of total</div>
                                    </div>
                                    <div>
                                        <div className="text-slate-500 uppercase tracking-wider text-[9px]">ERS (DDA)</div>
                                        <div className={`font-semibold ${ersColor(s.ers)}`}>
                                            {s.ers !== null ? fmtPct(s.ers * 100, 1) : "—"}
                                        </div>
                                        <div className="text-slate-500 text-[10px]">target {fmtPct(TARGET_MARGIN * 100, 0)}</div>
                                    </div>
                                    <div>
                                        <div className="text-slate-500 uppercase tracking-wider text-[9px]">DDA Conv.</div>
                                        <div className="text-white font-semibold">{fmtNum(s.allConversions, 1)}</div>
                                    </div>
                                    <div>
                                        <div className="text-slate-500 uppercase tracking-wider text-[9px]">ROAS (DDA)</div>
                                        <div className={`font-semibold ${s.roas !== null ? (s.roas >= 3 ? "text-emerald-400" : s.roas >= 1 ? "text-amber-400" : "text-red-400") : "text-slate-400"}`}>
                                            {s.roas !== null ? fmtX(s.roas) : "—"}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-slate-500 uppercase tracking-wider text-[9px]">AOV (DDA)</div>
                                        <div className="text-slate-300 font-semibold">{s.aov !== null ? fmtEuro(s.aov, 0) : "—"}</div>
                                    </div>
                                    <div>
                                        <div className="text-slate-500 uppercase tracking-wider text-[9px]">Spend</div>
                                        <div className="text-slate-300 font-semibold">{fmtEuro(s.cost, 0)}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
