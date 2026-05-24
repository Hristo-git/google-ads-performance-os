export interface AccountConfig {
    id: string;
    name: string;
    country: string;
    /** Accounts are billed in EUR; kept for display/labeling. */
    currency: string;
    /** Brand tokens (lowercase) used to classify branded search terms for this market. */
    brandTerms: string[];
    /** Contribution margin (0–1) used as the profitability target for this account. */
    defaultMargin: number;
}

export const ACCOUNTS: AccountConfig[] = [
    {
        id: '5334827744',
        name: 'Bulgaria (Videnov.BG)',
        country: 'BG',
        currency: 'EUR',
        brandTerms: ['виденов', 'videnov', 'видинов', 'videhov', 'videnov.bg', 'мебели виденов'],
        defaultMargin: 0.31,
    },
    {
        id: '8277239615',
        name: 'Romania (Vellea Home)',
        country: 'RO',
        currency: 'EUR',
        brandTerms: ['vellea', 'вилеа', 'vellea home'],
        defaultMargin: 0.31,
    },
    {
        id: '2106431288',
        name: 'Greece (Vellea Home)',
        country: 'GR',
        currency: 'EUR',
        brandTerms: ['vellea', 'вилеа', 'vellea home'],
        defaultMargin: 0.31,
    },
    {
        id: '4636875133',
        name: 'North Macedonia (Vellea Home)',
        country: 'NMK',
        currency: 'EUR',
        brandTerms: ['vellea', 'вилеа', 'vellea home'],
        defaultMargin: 0.31,
    },
    {
        id: '5512040658',
        name: 'Moldova (Vellea Home)',
        country: 'MD',
        currency: 'EUR',
        brandTerms: ['vellea', 'вилеа', 'vellea home'],
        defaultMargin: 0.31,
    },
];

export const DEFAULT_ACCOUNT_ID = '5334827744';

const FALLBACK_MARGIN = 0.31;

/** Lookup an account config by customerId. */
export function getAccountConfig(id?: string): AccountConfig | undefined {
    if (!id) return undefined;
    return ACCOUNTS.find(a => a.id === id);
}

/**
 * Brand tokens for an account. When the account is unknown, returns the union of
 * all configured brand tokens so classification degrades safely rather than missing
 * branded traffic entirely.
 */
export function getBrandTerms(id?: string): string[] {
    const cfg = getAccountConfig(id);
    if (cfg) return cfg.brandTerms;
    return Array.from(new Set(ACCOUNTS.flatMap(a => a.brandTerms)));
}

/** Profitability target margin (0–1) for an account, with a safe fallback. */
export function getDefaultMargin(id?: string): number {
    return getAccountConfig(id)?.defaultMargin ?? FALLBACK_MARGIN;
}
