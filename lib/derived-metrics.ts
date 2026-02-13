// lib/derived-metrics.ts — Pre-calculated metrics for AI analysis prompts
// These are injected into prompts so the LLM uses real numbers, not assumptions.

interface AnyRecord { [key: string]: any; }

// ── Derived Metrics Calculator ──────────────────────────────────────

export function calculateDerivedMetrics(
    campaigns?: AnyRecord[],
    adGroups?: AnyRecord[],
    deviceData?: AnyRecord[]
): string {
    const sections: string[] = [];
    sections.push('=== PRE-CALCULATED DERIVED METRICS ===');
    sections.push('USE THESE VALUES — do NOT recalculate. These are computed from the raw data.');

    // ── Campaign-level derived metrics ──
    if (campaigns?.length) {
        // Count ad groups per campaign for signal density
        const agCountByCampaign: Record<string, number> = {};
        if (adGroups?.length) {
            for (const ag of adGroups) {
                const cId = String(ag.campaignId || ag.campaign_id || '');
                if (cId) agCountByCampaign[cId] = (agCountByCampaign[cId] || 0) + 1;
            }
        }

        sections.push('');
        sections.push('## Campaign-Level Derived Metrics');
        sections.push('| Campaign | Implied AOV | CVR | CPC | Rev/Click | Conv/€ | ROAS | Lost IS Total | Signal Density |');
        sections.push('|----------|-------------|-----|-----|-----------|--------|------|---------------|----------------|');

        const fragmented: string[] = [];
        const moderate: string[] = [];
        const healthy: string[] = [];

        for (const c of campaigns) {
            const cost = Number(c.cost) || 0;
            const clicks = Number(c.clicks) || 0;
            const conv = Number(c.conversions) || 0;
            const convValue = Number(c.conversionValue || c.conversion_value) || 0;
            const lostRank = c.searchLostISRank ?? c.search_lost_is_rank ?? null;
            const lostBudget = c.searchLostISBudget ?? c.search_lost_is_budget ?? null;

            const aov = conv > 0 ? convValue / conv : null;
            const cvr = clicks > 0 ? (conv / clicks) * 100 : null;
            const cpc = clicks > 0 ? cost / clicks : null;
            const revPerClick = clicks > 0 ? convValue / clicks : null;
            const convPerEuro = cost > 0 ? conv / cost : null;
            const roas = cost > 0 ? convValue / cost : null;
            const lostTotal = (lostRank != null && lostBudget != null)
                ? (Number(lostRank) + Number(lostBudget)) * 100
                : null;

            const agCount = agCountByCampaign[String(c.id)] || 0;
            const sigDensity = agCount > 0 ? conv / agCount : null;
            let sigLabel = 'N/A';
            if (sigDensity !== null) {
                if (sigDensity < 1) { sigLabel = 'fragmented'; fragmented.push(c.name); }
                else if (sigDensity <= 3) { sigLabel = 'moderate'; moderate.push(c.name); }
                else { sigLabel = 'healthy'; healthy.push(c.name); }
            }

            const fmt = (v: number | null, dec = 2, prefix = '', suffix = '') =>
                v !== null ? `${prefix}${v.toFixed(dec)}${suffix}` : 'N/A';

            sections.push(
                `| ${(c.name || '').slice(0, 35)} | ${fmt(aov, 0, '€')} | ${fmt(cvr, 1, '', '%')} | ${fmt(cpc, 2, '€')} | ${fmt(revPerClick, 2, '€')} | ${fmt(convPerEuro, 3)} | ${fmt(roas, 1, '', 'x')} | ${fmt(lostTotal, 1, '', '%')} | ${sigDensity !== null ? sigDensity.toFixed(1) : 'N/A'} (${sigLabel}) |`
            );
        }

        // Signal density summary
        if (fragmented.length || moderate.length || healthy.length) {
            sections.push('');
            sections.push('## Signal Density Summary');
            if (fragmented.length) sections.push(`- **Fragmented** (<1 conv/ad group): ${fragmented.join(', ')}`);
            if (moderate.length) sections.push(`- **Moderate** (1-3 conv/ad group): ${moderate.join(', ')}`);
            if (healthy.length) sections.push(`- **Healthy** (>3 conv/ad group): ${healthy.join(', ')}`);
        }
    }

    // ── Ad Group-level derived metrics (top 20 by spend) ──
    if (adGroups?.length && campaigns?.length) {
        const campaignSpend: Record<string, number> = {};
        const campaignConv: Record<string, number> = {};
        const campaignNames: Record<string, string> = {};
        for (const c of campaigns) {
            campaignSpend[String(c.id)] = Number(c.cost) || 0;
            campaignConv[String(c.id)] = Number(c.conversions) || 0;
            campaignNames[String(c.id)] = c.name || '';
        }

        const sorted = [...adGroups].sort((a, b) => (Number(b.cost) || 0) - (Number(a.cost) || 0));
        const top = sorted.slice(0, 20);

        sections.push('');
        sections.push('## Ad Group-Level Derived Metrics (Top 20 by spend)');
        sections.push('| Ad Group | Campaign | CVR | CPC | %Spend of Campaign | %Conv of Campaign |');
        sections.push('|----------|----------|-----|-----|--------------------|-------------------|');

        for (const ag of top) {
            const cost = Number(ag.cost) || 0;
            const clicks = Number(ag.clicks) || 0;
            const conv = Number(ag.conversions) || 0;
            const cId = String(ag.campaignId || ag.campaign_id || '');
            const campSpend = campaignSpend[cId] || 0;
            const campConv = campaignConv[cId] || 0;

            const cvr = clicks > 0 ? (conv / clicks) * 100 : null;
            const cpc = clicks > 0 ? cost / clicks : null;
            const pctSpend = campSpend > 0 ? (cost / campSpend) * 100 : null;
            const pctConv = campConv > 0 ? (conv / campConv) * 100 : null;

            const fmt = (v: number | null, dec = 1, prefix = '', suffix = '') =>
                v !== null ? `${prefix}${v.toFixed(dec)}${suffix}` : 'N/A';

            sections.push(
                `| ${(ag.name || '').slice(0, 30)} | ${(campaignNames[cId] || '').slice(0, 25)} | ${fmt(cvr, 1, '', '%')} | ${fmt(cpc, 2, '€')} | ${fmt(pctSpend, 1, '', '%')} | ${fmt(pctConv, 1, '', '%')} |`
            );
        }
    }

    // ── Device-level derived metrics ──
    if (deviceData?.length) {
        const totalCost = deviceData.reduce((s, d) => s + (Number(d.cost) || 0), 0);
        const totalConv = deviceData.reduce((s, d) => s + (Number(d.conversions) || 0), 0);
        const totalClicks = deviceData.reduce((s, d) => s + (Number(d.clicks) || 0), 0);
        const totalConvValue = deviceData.reduce((s, d) => s + (Number(d.conversionValue || d.conversion_value) || 0), 0);
        const avgCvr = totalClicks > 0 ? (totalConv / totalClicks) * 100 : 0;

        sections.push('');
        sections.push('## Device-Level Derived Metrics');
        sections.push('| Device | CVR | CVR Gap vs Avg | AOV | Spend Share | Conv Share |');
        sections.push('|--------|-----|----------------|-----|-------------|------------|');

        for (const d of deviceData) {
            const cost = Number(d.cost) || 0;
            const clicks = Number(d.clicks) || 0;
            const conv = Number(d.conversions) || 0;
            const convValue = Number(d.conversionValue || d.conversion_value) || 0;

            const cvr = clicks > 0 ? (conv / clicks) * 100 : null;
            const cvrGap = cvr !== null && avgCvr > 0 ? ((cvr - avgCvr) / avgCvr) * 100 : null;
            const aov = conv > 0 ? convValue / conv : null;
            const spendShare = totalCost > 0 ? (cost / totalCost) * 100 : null;
            const convShare = totalConv > 0 ? (conv / totalConv) * 100 : null;

            const fmt = (v: number | null, dec = 1, prefix = '', suffix = '') =>
                v !== null ? `${prefix}${v.toFixed(dec)}${suffix}` : 'N/A';

            const device = d.device || d.name || 'Unknown';
            sections.push(
                `| ${device} | ${fmt(cvr, 1, '', '%')} | ${fmt(cvrGap, 0, cvrGap && cvrGap >= 0 ? '+' : '', '%')} | ${fmt(aov, 0, '€')} | ${fmt(spendShare, 1, '', '%')} | ${fmt(convShare, 1, '', '%')} |`
            );
        }
    }

    return sections.length > 2 ? sections.join('\n') : '';
}

// ── Enhanced Data Inventory ─────────────────────────────────────────

export function buildEnhancedDataInventory(data: AnyRecord): string {
    const available: string[] = [];
    const notProvided: string[] = [];

    const check = (label: string, value: any) => {
        if (Array.isArray(value) && value.length > 0) {
            available.push(`${label}: Yes (${value.length})`);
        } else if (value && typeof value === 'string' && value.length > 0) {
            available.push(`${label}: Yes`);
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            available.push(`${label}: Yes`);
        } else {
            notProvided.push(label);
        }
    };

    check('Campaign metrics', data.campaigns);
    check('Ad group metrics', data.adGroups);
    check('Keywords with QS', data.keywords);
    check('Ads with strength', data.ads);
    check('Search terms', data.searchTerms);
    check('Strategic breakdown', data.strategicBreakdown);
    check('N-gram analysis', data.nGramAnalysis);

    // Context signals (parsed from contextBlock string)
    if (data.contextBlock) {
        const ctx = data.contextBlock as string;
        if (ctx.includes('Device Split') || ctx.includes('Device')) available.push('Device split: Yes');
        else notProvided.push('Device split');
        if (ctx.includes('Geographic') || ctx.includes('Geo') || ctx.includes('Region')) available.push('Geo split: Yes');
        else notProvided.push('Geo split');
        if (ctx.includes('Peak Hours') || ctx.includes('Hour')) available.push('Hour of day: Yes');
        else notProvided.push('Hour of day');
        if (ctx.includes('Day of Week') || ctx.includes('Day')) available.push('Day of week: Yes');
        else notProvided.push('Day of week');
        if (ctx.includes('Auction') || ctx.includes('Competitor')) available.push('Auction insights: Yes');
        else notProvided.push('Auction insights');
        if (ctx.includes('Landing Page') || ctx.includes('LP')) available.push('Landing page health: Yes');
        else notProvided.push('Landing page health');
        if (ctx.includes('Conversion Action') || ctx.includes('Conv. Action')) available.push('Conversion actions: Yes');
        else notProvided.push('Conversion actions');
    } else {
        notProvided.push('Device split', 'Geo split', 'Hour of day', 'Day of week', 'Auction insights', 'Landing page health', 'Conversion actions');
    }

    // PMax context
    if (data.pmaxBlock) {
        const pmax = data.pmaxBlock as string;
        if (pmax.includes('Asset Group')) available.push('PMax asset groups: Yes');
        else notProvided.push('PMax asset groups');
        if (pmax.includes('Search Categor') || pmax.includes('Search Theme')) available.push('PMax search categories: Yes');
        else notProvided.push('PMax search categories');
    } else {
        notProvided.push('PMax asset groups', 'PMax search categories');
    }

    const lines: string[] = [];
    lines.push('=== DATA INVENTORY ===');
    lines.push('AVAILABLE DATA:');
    for (const a of available) lines.push(`  - ${a}`);
    if (notProvided.length) {
        lines.push('');
        lines.push(`NOT PROVIDED: ${notProvided.join(', ')}`);
    }
    lines.push('');
    lines.push('RULES:');
    lines.push('- Do NOT claim any "Yes" data is missing or unavailable.');
    lines.push('- Do NOT fabricate or assume data marked as "NOT PROVIDED".');
    lines.push('- If analysis requires missing data, state the limitation explicitly.');

    return lines.join('\n');
}
