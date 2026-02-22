/**
 * lib/bidding-labels.ts
 *
 * Single source of truth for Google Ads bidding strategy labels.
 * Previously duplicated in: analyze/route.ts, analyze/stream/route.ts, prompts-v2.ts
 */

export const BIDDING_LABELS: Record<number | string, string> = {
    0: 'Unspecified',
    1: 'Unknown',
    2: 'Manual CPC',
    3: 'Manual CPM',
    4: 'Manual CPV',
    5: 'Maximize Conversions',
    6: 'Maximize Conversion Value',
    7: 'Target CPA',
    8: 'Target ROAS',
    9: 'Target Impression Share',
    10: 'Manual CPC (Enhanced)',
    11: 'Maximize Conversions',
    12: 'Maximize Conversion Value',
    13: 'Target Spend',
};

export function getBiddingLabel(code: number | string | undefined | null): string {
    if (code === undefined || code === null) return 'N/A';
    // If already a readable string (not a pure number), return as-is
    if (typeof code === 'string' && isNaN(Number(code))) return code;
    return BIDDING_LABELS[code] || BIDDING_LABELS[Number(code)] || 'Unknown Bidding Strategy';
}

export function enrichCampaignData<T extends { biddingStrategyType?: number | string | null }>(
    campaigns: T[]
): (Omit<T, 'biddingStrategyType'> & { biddingStrategyLabel: string })[] {
    return campaigns.map(c => {
        const label = getBiddingLabel(c.biddingStrategyType);
        const { biddingStrategyType: _raw, ...rest } = c as any;
        return { ...rest, biddingStrategyLabel: label };
    });
}
