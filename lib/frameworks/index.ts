import fs from 'fs';
import path from 'path';
import { querySimilarFrameworks } from '@/lib/pinecone';

const CORE_PATH = path.resolve(process.cwd(), 'lib', 'frameworks', 'core-principles.md');

let cachedCore: string | null = null;

/**
 * Synchronous load of the curated core-principles.md. Cached at module level.
 */
export function loadCoreFrameworks(): string {
    if (cachedCore !== null) return cachedCore;
    try {
        cachedCore = fs.readFileSync(CORE_PATH, 'utf-8');
    } catch (err) {
        console.error('[frameworks] Failed to load core-principles.md:', (err as Error).message);
        cachedCore = '';
    }
    return cachedCore;
}

/**
 * Build a compact "pain summary" string that drives the RAG query.
 * We look at dominant campaign types + headline performance signals.
 */
function buildSummaryQuery(data: any): string {
    const parts: string[] = [];

    const campaigns: any[] = data?.campaigns || [];
    const ads: any[] = data?.ads || [];
    const adGroups: any[] = data?.adGroups || [];

    // Dominant campaign channel types
    const channelCounts = new Map<string, number>();
    for (const c of campaigns) {
        const ch = c.advertisingChannelType || 'UNKNOWN';
        channelCounts.set(ch, (channelCounts.get(ch) || 0) + 1);
    }
    const topChannels = [...channelCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k);
    if (topChannels.length) parts.push(`channels: ${topChannels.join(', ')}`);

    // Pain signals
    const poorAds = ads.filter(a => a.adStrength === 'POOR' || a.adStrength === 'AVERAGE').length;
    if (poorAds > 0) parts.push(`${poorAds} ads with POOR/AVERAGE strength`);

    const avgCtr = ads.length
        ? ads.reduce((s, a) => s + (a.ctr || 0), 0) / ads.length
        : 0;
    if (avgCtr > 0 && avgCtr < 2) parts.push('low CTR');

    const poorAdGroups = adGroups.filter((ag: any) => ag.adStrength === 'POOR').length;
    if (poorAdGroups > 0) parts.push('weak ad group strength');

    if (data?.profitabilityInputs?.cm2Percent && data.profitabilityInputs.cm2Percent < 25) {
        parts.push('thin CM2 margin');
    }

    parts.push('creative conversion framework ad copy rewrite');
    return parts.join(', ');
}

/**
 * Build the combined FRAMEWORK KNOWLEDGE block injected into the prompt.
 * Composes the curated core-principles.md with top-k RAG chunks pulled from
 * the Pinecone `frameworks` namespace.
 */
export async function buildFrameworksBlock(data: any): Promise<string> {
    const core = loadCoreFrameworks();
    const query = buildSummaryQuery(data);

    let ragSection = '';
    try {
        const matches = await querySimilarFrameworks(query, 3);
        if (matches.length > 0) {
            const snippets = matches
                .map((m: any, idx: number) => {
                    const fwName = m.metadata?.frameworkName || 'Framework';
                    const content = (m.metadata?.content as string) || '';
                    return `### Retrieved ${idx + 1}: ${fwName}\n\n${content.trim()}`;
                })
                .join('\n\n---\n\n');
            ragSection = `\n\n## Retrieved Framework Excerpts (top-${matches.length} most relevant)\n\n${snippets}\n`;
        }
    } catch (err) {
        console.error('[frameworks] RAG lookup failed, continuing with core only:', (err as Error).message);
    }

    return `# FRAMEWORK KNOWLEDGE BASE\n\n${core}${ragSection}`;
}
