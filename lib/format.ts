/**
 * Shared number formatting utilities.
 * All UI-facing numbers use these helpers to ensure:
 *  - Thousands separator (en-US: comma)
 *  - Maximum 2 decimal places (unless caller specifies otherwise)
 */

/** Generic number: thousands separator, up to `maxDec` decimal places. */
export function fmtNum(n: number | null | undefined, maxDec = 2): string {
    if (n == null || isNaN(n as number)) return '—';
    return (n as number).toLocaleString('en-US', { maximumFractionDigits: maxDec });
}

/** Integer: thousands separator, no decimal places. */
export function fmtInt(n: number | null | undefined): string {
    if (n == null || isNaN(n as number)) return '—';
    return (n as number).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Currency: €1,234.56  (max 2 decimal places). */
export function fmtEuro(n: number | null | undefined, maxDec = 2): string {
    if (n == null || isNaN(n as number)) return '—';
    return `€${(n as number).toLocaleString('en-US', { maximumFractionDigits: maxDec })}`;
}

/** Percentage: 12.3%  (default 1 decimal place). */
export function fmtPct(n: number | null | undefined, maxDec = 1): string {
    if (n == null || isNaN(n as number)) return '—';
    return `${(n as number).toLocaleString('en-US', { maximumFractionDigits: maxDec })}%`;
}

/** ROAS / multiplier: 12.34x  (max 2 decimal places, shows — for falsy). */
export function fmtX(n: number | null | undefined): string {
    if (!n || isNaN(n as number)) return '—';
    return `${(n as number).toLocaleString('en-US', { maximumFractionDigits: 2 })}x`;
}
