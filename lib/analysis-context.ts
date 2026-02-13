/**
 * Analysis Context — fetches and formats "context signals" for AI prompts.
 *
 * These are the dimensions that dramatically change interpretation:
 * device split, geo, hour/day, auction insights, landing pages,
 * conversion actions, PMax asset groups + search insights.
 *
 * Data is fetched via existing Google Ads API functions and formatted
 * into a compact markdown block (≤2000 tokens) for prompt injection.
 */

import type { DateRange } from './google-ads';
import {
    getAccountDeviceStats,
    getHourOfDayPerformance,
    getDayOfWeekPerformance,
    getRegionalPerformance,
    getAuctionInsights,
    getLandingPagePerformance,
    getConversionActions,
    getAssetGroups,
    getPMaxSearchInsights,
    getAssetGroupAssets,
} from './google-ads';
import type {
    AccountDevicePerformance,
    HourOfDayPerformance,
    DayOfWeekPerformance,
    RegionalPerformance,
    AuctionInsight,
    LandingPagePerformance,
    ConversionActionBreakdown,
    PMaxSearchInsight,
} from './google-ads';
import type { PMaxAsset } from '@/types/google-ads';

// ── Types ──────────────────────────────────────────────────────────────

export interface AnalysisContext {
    device: AccountDevicePerformance[];
    hourOfDay: HourOfDayPerformance[];
    dayOfWeek: DayOfWeekPerformance[];
    geo: RegionalPerformance[];
    auctionInsights: AuctionInsight[];
    landingPages: LandingPagePerformance[];
    conversionActions: ConversionActionBreakdown[];
}

export interface PMaxContext {
    assetGroups: any[];
    searchInsights: PMaxSearchInsight[];
    assetInventory: AssetInventory[];
}

interface AssetInventory {
    assetGroupId: string;
    assetGroupName: string;
    headlines: number;
    descriptions: number;
    images: number;
    videos: number;
    logos: number;
    total: number;
}

// ── Fetch Functions ────────────────────────────────────────────────────

export async function fetchAnalysisContext(
    refreshToken: string,
    customerId: string,
    dateRange: DateRange,
): Promise<AnalysisContext> {
    console.log('[AnalysisContext] Fetching context signals in parallel...');
    const start = Date.now();

    const [device, hourOfDay, dayOfWeek, geo, auctionInsights, landingPages, conversionActions] =
        await Promise.allSettled([
            getAccountDeviceStats(refreshToken, customerId, dateRange),
            getHourOfDayPerformance(refreshToken, customerId, dateRange),
            getDayOfWeekPerformance(refreshToken, customerId, dateRange),
            getRegionalPerformance(refreshToken, customerId, dateRange),
            getAuctionInsights(refreshToken, undefined, customerId, dateRange),
            getLandingPagePerformance(refreshToken, customerId, dateRange),
            getConversionActions(refreshToken, customerId, dateRange),
        ]);

    const result: AnalysisContext = {
        device: device.status === 'fulfilled' ? device.value : [],
        hourOfDay: hourOfDay.status === 'fulfilled' ? hourOfDay.value : [],
        dayOfWeek: dayOfWeek.status === 'fulfilled' ? dayOfWeek.value : [],
        geo: geo.status === 'fulfilled' ? geo.value : [],
        auctionInsights: auctionInsights.status === 'fulfilled' ? auctionInsights.value : [],
        landingPages: landingPages.status === 'fulfilled' ? landingPages.value : [],
        conversionActions: conversionActions.status === 'fulfilled' ? conversionActions.value : [],
    };

    const elapsed = Date.now() - start;
    console.log(`[AnalysisContext] Fetched in ${elapsed}ms — device: ${result.device.length}, geo: ${result.geo.length}, auction: ${result.auctionInsights.length}, LP: ${result.landingPages.length}`);

    return result;
}

export async function fetchPMaxContext(
    refreshToken: string,
    customerId: string,
    dateRange: DateRange,
    pmaxCampaignIds: string[],
): Promise<PMaxContext> {
    console.log(`[PMaxContext] Fetching for ${pmaxCampaignIds.length} PMax campaigns...`);

    // Fetch asset groups for all PMax campaigns
    const assetGroupResults = await Promise.allSettled(
        pmaxCampaignIds.map(id => getAssetGroups(refreshToken, id, customerId, dateRange))
    );
    const assetGroups = assetGroupResults
        .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
        .flatMap(r => r.value);

    // Fetch search insights for all PMax campaigns
    const searchResults = await Promise.allSettled(
        pmaxCampaignIds.map(id => getPMaxSearchInsights(refreshToken, id, customerId))
    );
    const searchInsights = searchResults
        .filter((r): r is PromiseFulfilledResult<PMaxSearchInsight[]> => r.status === 'fulfilled')
        .flatMap(r => r.value);

    // Fetch asset inventory for top asset groups (by spend, max 5)
    const topGroups = assetGroups
        .sort((a: any, b: any) => (b.cost || 0) - (a.cost || 0))
        .slice(0, 5);

    const assetResults = await Promise.allSettled(
        topGroups.map((ag: any) => getAssetGroupAssets(refreshToken, ag.id, customerId))
    );

    const assetInventory: AssetInventory[] = topGroups.map((ag: any, i: number) => {
        const assets: PMaxAsset[] = assetResults[i].status === 'fulfilled'
            ? (assetResults[i] as PromiseFulfilledResult<PMaxAsset[]>).value
            : [];
        return {
            assetGroupId: ag.id,
            assetGroupName: ag.name,
            headlines: assets.filter(a => a.fieldType === 'HEADLINE').length,
            descriptions: assets.filter(a => a.fieldType === 'DESCRIPTION').length,
            images: assets.filter(a => a.fieldType === 'MARKETING_IMAGE' || a.fieldType === 'SQUARE_MARKETING_IMAGE').length,
            videos: assets.filter(a => a.fieldType === 'YOUTUBE_VIDEO').length,
            logos: assets.filter(a => a.fieldType === 'LOGO').length,
            total: assets.length,
        };
    });

    console.log(`[PMaxContext] ${assetGroups.length} asset groups, ${searchInsights.length} search insights, ${assetInventory.length} inventories`);

    return { assetGroups, searchInsights, assetInventory };
}

// ── Format Functions ───────────────────────────────────────────────────

export function formatContextForPrompt(ctx: AnalysisContext, language: 'bg' | 'en' = 'bg'): string {
    const isEn = language === 'en';
    const sections: string[] = [];

    // 1. Device Split
    if (ctx.device.length > 0) {
        const totalSpend = ctx.device.reduce((s, d) => s + d.cost, 0);
        const lines = ctx.device
            .sort((a, b) => b.cost - a.cost)
            .map(d => {
                const pct = totalSpend > 0 ? ((d.cost / totalSpend) * 100).toFixed(0) : '0';
                const cvr = d.clicks > 0 ? ((d.conversions / d.clicks) * 100).toFixed(2) : '0';
                const cpa = d.conversions > 0 ? (d.cost / d.conversions).toFixed(0) : 'N/A';
                const roas = d.cost > 0 ? (d.conversionValue / d.cost).toFixed(2) : '0';
                return `${d.device}: ${pct}% spend, CVR ${cvr}%, CPA €${cpa}, ROAS ${roas}x`;
            });
        sections.push(`## ${isEn ? 'Device Split' : 'Устройства'}\n${lines.join('\n')}`);
    }

    // 2. Hour of Day (aggregate across campaigns, top 5 hours by conversions)
    if (ctx.hourOfDay.length > 0) {
        const hourAgg: Record<number, { conv: number; cost: number; clicks: number; value: number }> = {};
        ctx.hourOfDay.forEach(h => {
            if (!hourAgg[h.hour]) hourAgg[h.hour] = { conv: 0, cost: 0, clicks: 0, value: 0 };
            hourAgg[h.hour].conv += h.conversions;
            hourAgg[h.hour].cost += h.cost;
            hourAgg[h.hour].clicks += h.clicks;
            hourAgg[h.hour].value += h.conversionValue;
        });
        const totalConv = Object.values(hourAgg).reduce((s, h) => s + h.conv, 0);
        const topHours = Object.entries(hourAgg)
            .sort(([, a], [, b]) => b.conv - a.conv)
            .slice(0, 5)
            .map(([hour, d]) => {
                const pct = totalConv > 0 ? ((d.conv / totalConv) * 100).toFixed(0) : '0';
                const roas = d.cost > 0 ? (d.value / d.cost).toFixed(2) : '0';
                return `${hour}:00 — ${d.conv.toFixed(1)} conv (${pct}%), ROAS ${roas}x`;
            });

        const worstHours = Object.entries(hourAgg)
            .filter(([, d]) => d.cost > 0 && d.conv === 0)
            .sort(([, a], [, b]) => b.cost - a.cost)
            .slice(0, 3)
            .map(([hour, d]) => `${hour}:00 — €${d.cost.toFixed(0)} spent, 0 conv`);

        let block = `## ${isEn ? 'Peak Hours (by conversions)' : 'Пикови часове (по конверсии)'}\n${topHours.join('\n')}`;
        if (worstHours.length > 0) {
            block += `\n${isEn ? 'Zero-conversion hours (highest spend):' : 'Часове без конверсии (най-висок разход):'}\n${worstHours.join('\n')}`;
        }
        sections.push(block);
    }

    // 3. Day of Week (aggregate)
    if (ctx.dayOfWeek.length > 0) {
        const dayAgg: Record<string, { conv: number; cost: number; value: number; clicks: number }> = {};
        const dayOrder = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
        ctx.dayOfWeek.forEach(d => {
            if (!dayAgg[d.dayOfWeek]) dayAgg[d.dayOfWeek] = { conv: 0, cost: 0, value: 0, clicks: 0 };
            dayAgg[d.dayOfWeek].conv += d.conversions;
            dayAgg[d.dayOfWeek].cost += d.cost;
            dayAgg[d.dayOfWeek].value += d.conversionValue;
            dayAgg[d.dayOfWeek].clicks += d.clicks;
        });
        const lines = dayOrder
            .filter(day => dayAgg[day])
            .map(day => {
                const d = dayAgg[day];
                const roas = d.cost > 0 ? (d.value / d.cost).toFixed(2) : '0';
                const cvr = d.clicks > 0 ? ((d.conv / d.clicks) * 100).toFixed(2) : '0';
                return `${day.slice(0, 3)}: €${d.cost.toFixed(0)} spend, ${d.conv.toFixed(1)} conv, CVR ${cvr}%, ROAS ${roas}x`;
            });
        sections.push(`## ${isEn ? 'Day of Week' : 'Ден от седмицата'}\n${lines.join('\n')}`);
    }

    // 4. Geo (top 10 by spend)
    if (ctx.geo.length > 0) {
        const top = ctx.geo
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 10)
            .map(g => {
                const cvr = g.clicks > 0 ? ((g.conversions / g.clicks) * 100).toFixed(2) : '0';
                const roas = g.cost > 0 ? (g.conversionValue / g.cost).toFixed(2) : '0';
                return `${g.locationName}: €${g.cost.toFixed(0)}, ${g.conversions.toFixed(1)} conv, CVR ${cvr}%, ROAS ${roas}x`;
            });
        sections.push(`## ${isEn ? 'Top Regions (by spend)' : 'Топ региони (по разход)'}\n${top.join('\n')}`);
    }

    // 5. Auction Insights (aggregate competitors across campaigns)
    if (ctx.auctionInsights.length > 0) {
        const compAgg: Record<string, {
            impressionShare: number[]; overlapRate: number[]; outrankingShare: number[];
            topOfPageRate: number[]; absTopOfPageRate: number[];
        }> = {};
        ctx.auctionInsights.forEach(a => {
            if (!compAgg[a.competitor]) {
                compAgg[a.competitor] = { impressionShare: [], overlapRate: [], outrankingShare: [], topOfPageRate: [], absTopOfPageRate: [] };
            }
            if (a.impressionShare != null) compAgg[a.competitor].impressionShare.push(a.impressionShare);
            if (a.overlapRate != null) compAgg[a.competitor].overlapRate.push(a.overlapRate);
            if (a.outrankingShare != null) compAgg[a.competitor].outrankingShare.push(a.outrankingShare);
            if (a.topOfPageRate != null) compAgg[a.competitor].topOfPageRate.push(a.topOfPageRate);
            if (a.absTopOfPageRate != null) compAgg[a.competitor].absTopOfPageRate.push(a.absTopOfPageRate);
        });

        const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

        const topComp = Object.entries(compAgg)
            .map(([name, d]) => ({
                name,
                overlap: avg(d.overlapRate),
                outranking: avg(d.outrankingShare),
                topOfPage: avg(d.topOfPageRate),
                campaigns: d.overlapRate.length,
            }))
            .sort((a, b) => (b.overlap || 0) - (a.overlap || 0))
            .slice(0, 7)
            .map(c => {
                const overlap = c.overlap != null ? `${(c.overlap * 100).toFixed(0)}%` : 'N/A';
                const outranking = c.outranking != null ? `${(c.outranking * 100).toFixed(0)}%` : 'N/A';
                const topPage = c.topOfPage != null ? `${(c.topOfPage * 100).toFixed(0)}%` : 'N/A';
                return `${c.name}: overlap ${overlap}, outranking ${outranking}, top-of-page ${topPage} (${c.campaigns} campaigns)`;
            });
        sections.push(`## ${isEn ? 'Competitive Pressure (Auction Insights)' : 'Конкурентен натиск (Auction Insights)'}\n${topComp.join('\n')}`);
    }

    // 6. Landing Pages (top 8 by spend)
    if (ctx.landingPages.length > 0) {
        const top = ctx.landingPages
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 8)
            .map(lp => {
                const url = lp.landingPageUrl.replace(/^https?:\/\/[^/]+/, '');
                const cvr = lp.clicks > 0 ? ((lp.conversions / lp.clicks) * 100).toFixed(2) : '0';
                const roas = lp.cost > 0 ? (lp.conversionValue / lp.cost).toFixed(2) : '0';
                const speed = lp.speedScore != null ? `speed: ${lp.speedScore}/100` : '';
                const mobile = lp.mobileFriendlyClicksPercentage != null ? `mobile: ${(lp.mobileFriendlyClicksPercentage * 100).toFixed(0)}%` : '';
                const flags = [speed, mobile].filter(Boolean).join(', ');
                return `${url}: €${lp.cost.toFixed(0)}, CVR ${cvr}%, ROAS ${roas}x${flags ? ` [${flags}]` : ''}`;
            });
        sections.push(`## ${isEn ? 'Landing Page Health (by spend)' : 'Здраве на Landing Pages (по разход)'}\n${top.join('\n')}`);
    }

    // 7. Conversion Actions (aggregate across campaigns)
    if (ctx.conversionActions.length > 0) {
        const actionAgg: Record<string, { conv: number; value: number; category: string }> = {};
        ctx.conversionActions.forEach(ca => {
            if (!actionAgg[ca.conversionAction]) {
                actionAgg[ca.conversionAction] = { conv: 0, value: 0, category: ca.conversionCategory };
            }
            actionAgg[ca.conversionAction].conv += ca.conversions;
            actionAgg[ca.conversionAction].value += ca.conversionValue;
        });
        const totalConv = Object.values(actionAgg).reduce((s, a) => s + a.conv, 0);
        const lines = Object.entries(actionAgg)
            .sort(([, a], [, b]) => b.conv - a.conv)
            .slice(0, 6)
            .map(([name, d]) => {
                const pct = totalConv > 0 ? ((d.conv / totalConv) * 100).toFixed(0) : '0';
                return `${name} (${d.category}): ${d.conv.toFixed(1)} conv (${pct}%), €${d.value.toFixed(0)} value`;
            });
        sections.push(`## ${isEn ? 'Conversion Actions' : 'Конверсионни действия'}\n${lines.join('\n')}`);
    }

    if (sections.length === 0) return '';

    return `=== ${isEn ? 'CONTEXT SIGNALS' : 'КОНТЕКСТНИ СИГНАЛИ'} ===\n${isEn
        ? 'Use these dimensional breakdowns to enrich your analysis. Flag any significant skews.'
        : 'Използвай тези разбивки по измерения за обогатяване на анализа. Маркирай значителни изкривявания.'
    }\n\n${sections.join('\n\n')}`;
}

export function formatPMaxContextForPrompt(ctx: PMaxContext, language: 'bg' | 'en' = 'bg'): string {
    const isEn = language === 'en';
    const sections: string[] = [];

    // 1. Asset Groups performance
    if (ctx.assetGroups.length > 0) {
        const totalSpend = ctx.assetGroups.reduce((s: number, ag: any) => s + (ag.cost || 0), 0);
        const totalConv = ctx.assetGroups.reduce((s: number, ag: any) => s + (ag.conversions || 0), 0);

        const lines = ctx.assetGroups
            .sort((a: any, b: any) => (b.cost || 0) - (a.cost || 0))
            .slice(0, 10)
            .map((ag: any) => {
                const spendPct = totalSpend > 0 ? ((ag.cost / totalSpend) * 100).toFixed(0) : '0';
                const convPct = totalConv > 0 ? ((ag.conversions / totalConv) * 100).toFixed(0) : '0';
                const roas = ag.cost > 0 ? ((ag.conversionValue || 0) / ag.cost).toFixed(2) : '0';
                return `${ag.name}: €${(ag.cost || 0).toFixed(0)} (${spendPct}% spend), ${(ag.conversions || 0).toFixed(1)} conv (${convPct}%), ROAS ${roas}x, Ad Strength: ${ag.adStrength || 'N/A'}`;
            });

        sections.push(`## ${isEn ? 'PMax Asset Groups (by spend)' : 'PMax Asset Groups (по разход)'}\n${lines.join('\n')}`);
    }

    // 2. Asset inventory (missing assets detection)
    if (ctx.assetInventory.length > 0) {
        const lines = ctx.assetInventory.map(inv => {
            const warnings: string[] = [];
            if (inv.videos === 0) warnings.push(isEn ? 'NO VIDEO' : 'НЯМА ВИДЕО');
            if (inv.headlines < 5) warnings.push(isEn ? `only ${inv.headlines} headlines` : `само ${inv.headlines} заглавия`);
            if (inv.images < 3) warnings.push(isEn ? `only ${inv.images} images` : `само ${inv.images} изображения`);
            const flag = warnings.length > 0 ? ` ⚠ ${warnings.join(', ')}` : '';
            return `${inv.assetGroupName}: ${inv.headlines}H/${inv.descriptions}D/${inv.images}img/${inv.videos}vid/${inv.logos}logo${flag}`;
        });

        sections.push(`## ${isEn ? 'PMax Asset Inventory' : 'PMax инвентар на ресурси'}\n${lines.join('\n')}`);
    }

    // 3. Search Insights (top categories)
    if (ctx.searchInsights.length > 0) {
        const totalClicks = ctx.searchInsights.reduce((s, si) => s + si.clicks, 0);
        const lines = ctx.searchInsights
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 10)
            .map(si => {
                const pct = totalClicks > 0 ? ((si.clicks / totalClicks) * 100).toFixed(0) : '0';
                const cvr = si.clicks > 0 ? ((si.conversions / si.clicks) * 100).toFixed(2) : '0';
                return `${si.categoryLabel}: ${si.clicks} clicks (${pct}%), ${si.conversions.toFixed(1)} conv, CVR ${cvr}%`;
            });

        sections.push(`## ${isEn ? 'PMax Search Categories' : 'PMax търсени категории'}\n${lines.join('\n')}`);
    }

    if (sections.length === 0) return '';

    return `=== ${isEn ? 'PMAX CONTEXT SIGNALS' : 'PMAX КОНТЕКСТНИ СИГНАЛИ'} ===\n\n${sections.join('\n\n')}`;
}
