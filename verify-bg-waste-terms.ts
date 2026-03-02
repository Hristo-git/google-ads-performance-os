import dotenv from "dotenv";
import fs from "fs";
dotenv.config({ path: ".env.local" });

async function main() {
    const { getSearchTerms } = await import("./lib/google-ads.ts");
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN!;
    const bgClientId = "5334827744"; // Videnov.BG Direct Client Account

    // Last Month (January 2026)
    const dateRange = {
        start: "2026-01-01",
        end: "2026-01-31"
    };

    console.log(`=== BG ACCOUNT: WASTED SEARCH TERMS (Jan 2026) ===\n`);

    try {
        const searchTerms = await getSearchTerms(refreshToken, bgClientId, dateRange);

        // Filter and aggregate search terms with 0 conversions and cost > 0
        const zeroConvTermsMap = new Map<string, number>();

        for (const st of searchTerms) {
            if (st.conversions === 0 && st.cost > 0) {
                const term = st.term.toLowerCase();
                const currentCost = zeroConvTermsMap.get(term) || 0;
                zeroConvTermsMap.set(term, currentCost + st.cost);
            }
        }

        // Convert to array and sort by cost descending
        const sortedWastedTerms = Array.from(zeroConvTermsMap.entries())
            .map(([term, cost]) => ({ term, cost }))
            .sort((a, b) => b.cost - a.cost);

        console.log(`Top 50 Wasted Search Terms by Cost:\n`);

        let report = `Top 50 Wasted Search Terms by Cost:\n\n`;
        report += `| Search Term | Cost (€) |\n`;
        report += `|---|---|\n`;

        for (let i = 0; i < Math.min(50, sortedWastedTerms.length); i++) {
            const { term, cost } = sortedWastedTerms[i];
            console.log(`${i + 1}. "${term}": €${cost.toFixed(2)}`);
            report += `| ${term} | €${cost.toFixed(2)} |\n`;
        }

        fs.writeFileSync("wasted_terms_report.md", report);
        console.log(`\nReport saved to wasted_terms_report.md`);

    } catch (e) {
        console.error(`\n[FATAL ERROR]`, e);
    }
}

main();
