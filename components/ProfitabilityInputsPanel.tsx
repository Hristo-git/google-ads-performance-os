"use client";

import React, { useMemo, useState } from 'react';
import type { ProfitabilityInputs } from '@/types/google-ads';

interface Props {
    customerId: string;
    initial: ProfitabilityInputs | null;
    language: 'bg' | 'en';
    readOnly: boolean;
    onSaved: (inputs: ProfitabilityInputs | null) => void;
    onClose: () => void;
}

interface FieldConfig {
    key: keyof ProfitabilityInputs;
    labelEn: string;
    labelBg: string;
    hintEn: string;
    hintBg: string;
    type: 'number' | 'text';
    suffix?: string;
}

const FIELDS: FieldConfig[] = [
    { key: 'currency', labelEn: 'Currency', labelBg: 'Валута', hintEn: 'EUR, USD, BGN', hintBg: 'EUR, USD, BGN', type: 'text' },
    { key: 'avgOrderValue', labelEn: 'Avg Order Value', labelBg: 'Средна поръчка', hintEn: 'Revenue per order', hintBg: 'Приход на поръчка', type: 'number' },
    { key: 'cogsPercent', labelEn: 'COGS %', labelBg: 'COGS %', hintEn: 'Cost of goods as % of revenue', hintBg: 'Себестойност като % от прихода', type: 'number', suffix: '%' },
    { key: 'cm1Percent', labelEn: 'CM1 %', labelBg: 'CM1 %', hintEn: 'Revenue − COGS − shipping/fees', hintBg: 'Приход − COGS − доставка/такси', type: 'number', suffix: '%' },
    { key: 'cm2Percent', labelEn: 'CM2 %', labelBg: 'CM2 %', hintEn: 'CM1 − marketing spend', hintBg: 'CM1 − маркетинг разходи', type: 'number', suffix: '%' },
    { key: 'cm3Percent', labelEn: 'CM3 %', labelBg: 'CM3 %', hintEn: 'CM2 − fulfillment/ops', hintBg: 'CM2 − операции/доставка', type: 'number', suffix: '%' },
    { key: 'targetLtv', labelEn: 'Target LTV', labelBg: 'Целева LTV', hintEn: '12-month customer value', hintBg: 'Стойност за 12 месеца', type: 'number' },
    { key: 'targetCac', labelEn: 'Target CAC', labelBg: 'Целево CAC', hintEn: 'Max acceptable CAC', hintBg: 'Максимално приемлив CAC', type: 'number' },
    { key: 'blendedMer', labelEn: 'Blended MER', labelBg: 'Blended MER', hintEn: 'Total revenue / total ad spend (90d)', hintBg: 'Общ приход / общ ad spend (90d)', type: 'number', suffix: 'x' },
];

export default function ProfitabilityInputsPanel({
    customerId,
    initial,
    language,
    readOnly,
    onSaved,
    onClose,
}: Props) {
    const isEn = language === 'en';
    const [values, setValues] = useState<Record<string, any>>(() => {
        const base: Record<string, any> = {};
        FIELDS.forEach(f => {
            base[f.key as string] = initial ? (initial as any)[f.key] ?? '' : '';
        });
        base.notes = initial?.notes ?? '';
        base.currency = (initial?.currency as string) || 'EUR';
        return base;
    });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const breakEvenRoas = useMemo(() => {
        const cogs = Number(values.cogsPercent);
        if (!Number.isFinite(cogs) || cogs <= 0 || cogs >= 100) return null;
        return +(1 / (1 - cogs / 100)).toFixed(2);
    }, [values.cogsPercent]);

    const ltvCacRatio = useMemo(() => {
        const ltv = Number(values.targetLtv);
        const cac = Number(values.targetCac);
        if (!Number.isFinite(ltv) || !Number.isFinite(cac) || cac <= 0) return null;
        return +(ltv / cac).toFixed(2);
    }, [values.targetLtv, values.targetCac]);

    const setField = (key: string, raw: string) => {
        setValues(prev => ({ ...prev, [key]: raw }));
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveError(null);
        const payload: Record<string, any> = { customerId };
        FIELDS.forEach(f => {
            const v = values[f.key as string];
            if (v === '' || v == null) {
                payload[f.key as string] = null;
            } else {
                payload[f.key as string] = f.type === 'number' ? Number(v) : String(v);
            }
        });
        payload.notes = values.notes || null;

        try {
            const res = await fetch('/api/profitability-inputs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const text = await res.text();
                let msg = `HTTP ${res.status}`;
                try { msg = JSON.parse(text).error || msg; } catch {}
                throw new Error(msg);
            }
            const json = await res.json();
            onSaved(json.inputs || null);
        } catch (err: any) {
            setSaveError(err?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-slate-900/80 border-b border-slate-800 px-6 py-5">
            <div className="max-w-5xl mx-auto">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-white font-semibold text-base">
                            {isEn ? 'Profitability Inputs' : 'Profitability данни'}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                            {isEn
                                ? 'Google Ads does not expose COGS, margins, LTV or CAC. Provide these to unlock Section 4.'
                                : 'Google Ads не предоставя COGS, margins, LTV или CAC. Въведи ги за да активираш Секция 4.'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-xl leading-none" aria-label="Close">
                        ✕
                    </button>
                </div>

                {readOnly && (
                    <div className="mb-4 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
                        {isEn
                            ? 'Viewer role — values are read-only. Ask an admin to update.'
                            : 'Viewer роля — стойностите са само за четене. Поискайте админ да ги обнови.'}
                    </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {FIELDS.map(f => {
                        const v = values[f.key as string] ?? '';
                        return (
                            <label key={String(f.key)} className="text-xs text-slate-400">
                                <div className="mb-1 flex items-baseline justify-between">
                                    <span className="font-medium text-slate-300">{isEn ? f.labelEn : f.labelBg}</span>
                                    <span className="text-[10px] text-slate-500">{f.suffix || ''}</span>
                                </div>
                                <input
                                    type={f.type === 'number' ? 'number' : 'text'}
                                    step={f.type === 'number' ? 'any' : undefined}
                                    value={v}
                                    disabled={readOnly || saving}
                                    onChange={e => setField(String(f.key), e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-violet-500 disabled:opacity-60"
                                />
                                <div className="text-[10px] text-slate-500 mt-1">{isEn ? f.hintEn : f.hintBg}</div>
                            </label>
                        );
                    })}
                </div>

                <div className="mt-3 text-xs text-slate-400 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">
                            {isEn ? 'Break-even ROAS' : 'Break-even ROAS'}
                        </div>
                        <div className="text-slate-100 font-mono text-sm">
                            {breakEvenRoas ? `${breakEvenRoas}x` : '—'}
                        </div>
                        <div className="text-[10px] text-slate-500">1 / gross margin</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">LTV:CAC</div>
                        <div className={`font-mono text-sm ${
                            ltvCacRatio == null ? 'text-slate-400' :
                            ltvCacRatio >= 3 ? 'text-emerald-400' :
                            ltvCacRatio >= 2 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                            {ltvCacRatio ? `${ltvCacRatio}:1` : '—'}
                        </div>
                        <div className="text-[10px] text-slate-500">target ≥ 3:1</div>
                    </div>
                </div>

                <label className="block mt-3 text-xs text-slate-400">
                    <span className="font-medium text-slate-300 mb-1 block">
                        {isEn ? 'Notes (optional)' : 'Бележки (незадължително)'}
                    </span>
                    <textarea
                        rows={2}
                        value={values.notes || ''}
                        disabled={readOnly || saving}
                        onChange={e => setField('notes', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-violet-500 disabled:opacity-60"
                        placeholder={isEn ? 'Anything the audit should know (seasonality, promo, etc.)' : 'Контекст за одита (сезонност, промо и др.)'}
                    />
                </label>

                {saveError && (
                    <div className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
                        {saveError}
                    </div>
                )}

                <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-3 py-1.5 text-sm text-slate-300 hover:text-white"
                    >
                        {isEn ? 'Cancel' : 'Откажи'}
                    </button>
                    {!readOnly && (
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 text-white transition-colors"
                        >
                            {saving
                                ? (isEn ? 'Saving…' : 'Записване…')
                                : (isEn ? 'Save & Continue' : 'Запази и продължи')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
