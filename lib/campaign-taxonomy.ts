// Single source of truth for classifying a Google Ads campaign into a strategic
// "funnel" bucket. Previously this logic was copy-pasted (and had drifted) across
// Dashboard, GeographicPerformance, SegmentProfitabilityHeatmap and the Windsor
// campaigns route, so the same campaign could land in different buckets per view.

export type CampaignCategory =
    | 'brand'
    | 'pmax_sale'
    | 'pmax_aon'
    | 'search_dsa'
    | 'search_nonbrand'
    | 'upper_funnel'
    | 'shopping'
    | 'other';

// advertising_channel_type arrives either as the API string enum
// ('PERFORMANCE_MAX') or its numeric code ('10') depending on the data source.
const PMAX_CHANNELS = new Set(['PERFORMANCE_MAX', '10']);
const SHOPPING_CHANNELS = new Set(['SHOPPING', '4']);
// VIDEO=6, DISPLAY=3, DISCOVERY=12, DEMAND_GEN=14 (16 kept for older/ambiguous rows).
const UPPER_FUNNEL_CHANNELS = new Set(['VIDEO', 'DISPLAY', 'DEMAND_GEN', 'DISCOVERY', '6', '3', '12', '14', '16']);

const SALE_TOKENS = [
    '[sale]', 'sale', 'promo', 'promotion', 'bf', 'black friday', 'cyber',
    'discount', 'намал', 'промо', 'reducere', 'oferta', 'promotie',
];

// Matches "sn" only as a standalone token / prefix (e.g. "SN - Sofas"),
// never as a substring inside another word (e.g. "snacks", "business").
const SN_TOKEN = /(^|[\s\-_])sn([\s\-_]|$)/;
// Demand Gen / Display Network campaigns commonly use a DG/DN name prefix.
const DG_DN_PREFIX = /^(dg|dn)[\s\-_]/;

/**
 * Classify a campaign by its name and (optional) advertising channel type.
 * Order is significant: brand → PMax → DSA → Search NonBrand → upper funnel → shopping.
 */
export function classifyCampaign(name?: string, channelType?: string | number): CampaignCategory {
    const n = (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const ch = String(channelType ?? '');

    // (1) Brand ("brand protection" is covered by the "brand" substring)
    if (n.includes('brand') || n.includes('бренд') || n.includes('защита')) return 'brand';

    // (2/3) Performance Max — by channel type or name
    const isPMax = PMAX_CHANNELS.has(ch) || n.includes('pmax') || n.includes('performance');
    if (isPMax) {
        return SALE_TOKENS.some(t => n.includes(t)) ? 'pmax_sale' : 'pmax_aon';
    }

    // (4) Dynamic Search Ads
    if (n.includes('dsa')) return 'search_dsa';

    // (5) Search – NonBrand
    if (SN_TOKEN.test(n) || n.includes('search') || n.includes('wd_s')) return 'search_nonbrand';

    // (6) Video / Display / Demand Gen (upper funnel)
    if (
        UPPER_FUNNEL_CHANNELS.has(ch) ||
        n.includes('video') || n.includes('display') || n.includes('youtube') ||
        n.includes('yt') || n.includes('gdn') || DG_DN_PREFIX.test(n)
    ) {
        return 'upper_funnel';
    }

    // (7) Shopping
    if (n.includes('shop') || SHOPPING_CHANNELS.has(ch)) return 'shopping';

    return 'other';
}
