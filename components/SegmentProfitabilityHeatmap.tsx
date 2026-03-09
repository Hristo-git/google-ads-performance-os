"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { fmtEuro, fmtPct, fmtX, fmtNum } from "@/lib/format";

const LS_KEY = "product-category-taxonomy";

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

const DEFAULT_PRODUCT_CATEGORIES: Record<string, ProductCatDef> = {
    sofas:      { label: "Дивани",        color: "text-violet-400",  keywords: ["диван", "divan", "sofa", "ъглов", "правоъгълен диван", "разтегателен", "канапе", "canapea", "coltar", "extensibil"] },
    beds:       { label: "Легла",         color: "text-blue-400",    keywords: ["легло", "легла", "bed", "тапицирано легло", "двойно легло", "единично легло", "рамка за легло", "pat ", "paturi", "pat tapitat", "cadru pat"] },
    mattresses: { label: "Матраци",       color: "text-cyan-400",    keywords: ["матрак", "матраци", "mattress", "пружинен", "латекс матрак", "ортопедичен", "saltea", "saltele", "memory foam"] },
    wardrobes:  { label: "Гардероби",     color: "text-emerald-400", keywords: ["гардероб", "гардероби", "wardrobe", "плъзгащи врати", "гардероб с огледало", "dulap", "dulapuri", "sifonier"] },
    tables:     { label: "Маси",          color: "text-amber-400",   keywords: ["маса", "маси", "table", "трапезна маса", "кухненска маса", "coffee table", "холна маса", "masa", "mese", "masa de sufragerie", "masa de bucatarie"] },
    chairs:     { label: "Столове",       color: "text-orange-400",  keywords: ["стол", "столове", "chair", "трапезен стол", "офис стол", "табуретка", "scaun", "scaune", "taburet"] },
    cabinets:   { label: "Шкафове",       color: "text-pink-400",    keywords: ["шкаф", "шкафове", "скрин", "нощно шкафче", "нощно шкафчe", "библиотека", "tv шкаф", "тв шкаф", "vitrina", "витрина", "comoda", "noptiera", "biblioteca", "tv unit"] },
    desks:      { label: "Бюра",          color: "text-rose-400",    keywords: ["бюро", "бюра", "desk", "работна маса", "компютърна маса", "birou", "birouri"] },
    rugs:       { label: "Килими",        color: "text-yellow-400",  keywords: ["килим", "килими", "rug", "carpet", "мокет", "covor", "covoare"] },
    bedding:    { label: "Спално бельо",  color: "text-teal-400",    keywords: ["завивка", "завивки", "възглавница", "спално бельо", "pillow", "duvet", "юрган", "чаршаф", "perna", "perne", "plapuma", "lenjerie"] },
    lighting:   { label: "Осветление",   color: "text-lime-400",    keywords: ["осветление", "лампа", "lamp", "осветителни", "полилей", "аплик", "spot", "lampa", "lampi", "candelabru", "aplica", "veioza"] },
    furniture:  { label: "Мебели (общо)", color: "text-slate-400",   keywords: ["мебели", "мебел", "furniture", "обзавеждане", "mobila", "mobilier", "mobila living", "mobilier"] },
};

const CAT_COLORS = [
    "text-violet-400", "text-blue-400", "text-cyan-400", "text-emerald-400",
    "text-amber-400", "text-orange-400", "text-pink-400", "text-rose-400",
    "text-yellow-400", "text-teal-400", "text-lime-400", "text-slate-400",
    "text-indigo-400", "text-red-400",
];

function loadCategories(): Record<string, ProductCatDef> {
    try {
        const raw = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
        if (raw) return JSON.parse(raw);
    } catch {}
    return DEFAULT_PRODUCT_CATEGORIES;
}

function saveCategories(cats: Record<string, ProductCatDef>) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cats)); } catch {}
}

// ─── Taxonomy Editor Modal ─────────────────────────────────────────────────────

interface TaxonomyEditorProps {
    categories: Record<string, ProductCatDef>;
    onSave: (cats: Record<string, ProductCatDef>) => void;
    onClose: () => void;
}

function TaxonomyEditor({ categories, onSave, onClose }: TaxonomyEditorProps) {
    const [draft, setDraft] = useState<Record<string, ProductCatDef>>(() =>
        JSON.parse(JSON.stringify(categories))
    );
    const catKeys = Object.keys(draft);
    const [selectedCat, setSelectedCat] = useState<string>(catKeys[0] || "");
    const [newKw, setNewKw] = useState("");
    const [newCatLabel, setNewCatLabel] = useState("");
    const [addingCat, setAddingCat] = useState(false);

    const removeKeyword = (cat: string, kw: string) => {
        setDraft(prev => ({
            ...prev,
            [cat]: { ...prev[cat], keywords: prev[cat].keywords.filter(k => k !== kw) }
        }));
    };

    const addKeyword = (cat: string) => {
        const kw = newKw.trim().toLowerCase();
        if (!kw || draft[cat]?.keywords.includes(kw)) return;
        setDraft(prev => ({
            ...prev,
            [cat]: { ...prev[cat], keywords: [...prev[cat].keywords, kw] }
        }));
        setNewKw("");
    };

    const deleteCategory = (cat: string) => {
        const next = { ...draft };
        delete next[cat];
        setDraft(next);
        const remaining = Object.keys(next);
        setSelectedCat(remaining[0] || "");
    };

    const addCategory = () => {
        const label = newCatLabel.trim();
        if (!label) return;
        const key = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") + "_" + Date.now();
        const color = CAT_COLORS[Object.keys(draft).length % CAT_COLORS.length];
        setDraft(prev => ({ ...prev, [key]: { label, color, keywords: [] } }));
        setSelectedCat(key);
        setNewCatLabel("");
        setAddingCat(false);
    };

    const handleSave = () => {
        onSave(draft);
        onClose();
    };

    const handleReset = () => {
        setDraft(JSON.parse(JSON.stringify(DEFAULT_PRODUCT_CATEGORIES)));
        setSelectedCat(Object.keys(DEFAULT_PRODUCT_CATEGORIES)[0]);
    };

    const currentDef = draft[selectedCat];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[720px] max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                    <div>
                        <h2 className="text-base font-bold text-white">Product Category Taxonomy</h2>
                        <p className="text-xs text-slate-400 mt-0.5">Keyword matches are case-insensitive substring checks</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleReset} className="text-xs text-slate-400 hover:text-amber-400 px-3 py-1.5 rounded-lg hover:bg-amber-400/10 transition-colors">
                            Reset to defaults
                        </button>
                        <button onClick={handleSave} className="text-xs bg-violet-600 hover:bg-violet-500 text-white px-4 py-1.5 rounded-lg font-medium transition-colors">
                            Save & Close
                        </button>
                        <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors">
                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left: category list */}
                    <div className="w-52 border-r border-slate-700 flex flex-col overflow-y-auto shrink-0">
                        <div className="p-2 space-y-0.5">
                            {Object.entries(draft).map(([key, def]) => (
                                <button
                                    key={key}
                                    onClick={() => setSelectedCat(key)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between group ${
                                        selectedCat === key ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                                    }`}
                                >
                                    <span className={`font-medium truncate ${def.color}`}>{def.label}</span>
                                    <span className="text-[10px] text-slate-500 shrink-0 ml-1">{def.keywords.length}</span>
                                </button>
                            ))}
                        </div>
                        <div className="p-2 mt-auto border-t border-slate-700/50">
                            {addingCat ? (
                                <div className="space-y-1.5">
                                    <input
                                        autoFocus
                                        value={newCatLabel}
                                        onChange={e => setNewCatLabel(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter") addCategory(); if (e.key === "Escape") setAddingCat(false); }}
                                        placeholder="Category name…"
                                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                                    />
                                    <div className="flex gap-1">
                                        <button onClick={addCategory} className="flex-1 text-xs bg-violet-600/80 hover:bg-violet-600 text-white rounded-md py-1 transition-colors">Add</button>
                                        <button onClick={() => setAddingCat(false)} className="flex-1 text-xs text-slate-400 hover:text-white rounded-md py-1 transition-colors">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => setAddingCat(true)} className="w-full text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-400/10 rounded-lg py-1.5 transition-colors flex items-center justify-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                                    New category
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Right: keywords */}
                    <div className="flex-1 flex flex-col overflow-hidden p-5">
                        {currentDef ? (
                            <>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className={`text-sm font-bold ${currentDef.color}`}>{currentDef.label}</h3>
                                    <button
                                        onClick={() => deleteCategory(selectedCat)}
                                        className="text-xs text-red-400/60 hover:text-red-400 hover:bg-red-400/10 px-2 py-1 rounded-lg transition-colors"
                                    >
                                        Delete category
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto">
                                    <div className="flex flex-wrap gap-2">
                                        {currentDef.keywords.map(kw => (
                                            <span key={kw} className="inline-flex items-center gap-1 bg-slate-800 border border-slate-600 text-slate-300 text-xs px-2.5 py-1 rounded-full">
                                                {kw}
                                                <button
                                                    onClick={() => removeKeyword(selectedCat, kw)}
                                                    className="text-slate-500 hover:text-red-400 transition-colors ml-0.5"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                                                </button>
                                            </span>
                                        ))}
                                        {currentDef.keywords.length === 0 && (
                                            <p className="text-slate-500 text-xs italic">No keywords yet. Add some below.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Add keyword */}
                                <div className="mt-4 flex gap-2">
                                    <input
                                        value={newKw}
                                        onChange={e => setNewKw(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter") addKeyword(selectedCat); }}
                                        placeholder="Add keyword…"
                                        className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                                    />
                                    <button
                                        onClick={() => addKeyword(selectedCat)}
                                        className="px-4 py-2 bg-violet-600/80 hover:bg-violet-600 text-white text-sm rounded-lg font-medium transition-colors"
                                    >
                                        Add
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                                Select a category from the left
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
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

    // ── Taxonomy state ──
    const [categories, setCategories] = useState<Record<string, ProductCatDef>>(DEFAULT_PRODUCT_CATEGORIES);
    const [editorOpen, setEditorOpen] = useState(false);

    useEffect(() => {
        setCategories(loadCategories());
    }, []);

    const handleSaveCategories = useCallback((cats: Record<string, ProductCatDef>) => {
        saveCategories(cats);
        setCategories(cats);
    }, []);

    const getProductCategory = useCallback((keywordText: string): string | null => {
        const lower = keywordText.toLowerCase();
        for (const [cat, def] of Object.entries(categories)) {
            if (def.keywords.some(kw => lower.includes(kw))) return cat;
        }
        return null;
    }, [categories]);

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
                        const def  = categories[cat];
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
    }, [customerId, dateRange?.start, dateRange?.end, getProductCategory, categories]);

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
            {editorOpen && (
                <TaxonomyEditor
                    categories={categories}
                    onSave={handleSaveCategories}
                    onClose={() => setEditorOpen(false)}
                />
            )}
            <div>
                <div className="mb-4 flex items-center gap-3">
                    <h3 className="text-base font-bold text-white">By Product Category</h3>
                    <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded font-medium">DDA Attribution</span>
                    <span className="text-xs text-slate-500">Keyword-level · all_conversions</span>
                    <button
                        onClick={() => setEditorOpen(true)}
                        className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        Edit Categories
                    </button>
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
