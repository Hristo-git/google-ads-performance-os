export interface SearchTermData {
    searchTerm: string;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
}

export interface NGramMetrics {
    gram: string;
    count: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
    roas: number;
    cpa: number;
}

export interface NGramAnalysisResult {
    oneGrams: NGramMetrics[];
    twoGrams: NGramMetrics[];
    threeGrams: NGramMetrics[];
    topWinning: NGramMetrics[];
    topWasteful: NGramMetrics[];
}

export function processNGrams(searchTerms: SearchTermData[]): NGramAnalysisResult {
    const oneGramMap = new Map<string, NGramMetrics>();
    const twoGramMap = new Map<string, NGramMetrics>();
    const threeGramMap = new Map<string, NGramMetrics>();

    // Helper to update map
    const updateMap = (map: Map<string, NGramMetrics>, gram: string, data: SearchTermData) => {
        const cleanGram = gram.toLowerCase().trim();
        if (!cleanGram) return;

        const current = map.get(cleanGram) || {
            gram: cleanGram,
            count: 0,
            clicks: 0,
            cost: 0,
            conversions: 0,
            conversionValue: 0,
            roas: 0,
            cpa: 0
        };

        current.count += 1;
        current.clicks += data.clicks;
        current.cost += data.cost;
        current.conversions += data.conversions;
        current.conversionValue += data.conversionValue;

        map.set(cleanGram, current);
    };

    searchTerms.forEach(term => {
        const words = term.searchTerm.split(/\s+/).filter(w => w.length > 0);

        // 1-Grams
        const uniqueWords = new Set(words.map(w => w.toLowerCase()));
        uniqueWords.forEach(word => updateMap(oneGramMap, word, term));

        // 2-Grams
        for (let i = 0; i < words.length - 1; i++) {
            const biGram = `${words[i]} ${words[i + 1]}`.toLowerCase();
            updateMap(twoGramMap, biGram, term);
        }

        // 3-Grams
        for (let i = 0; i < words.length - 2; i++) {
            const triGram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`.toLowerCase();
            updateMap(threeGramMap, triGram, term);
        }
    });

    // Helper to finalize metrics (ROAS, CPA) and sort
    const finalize = (map: Map<string, NGramMetrics>) => {
        return Array.from(map.values()).map(m => ({
            ...m,
            roas: m.cost > 0 ? m.conversionValue / m.cost : 0,
            cpa: m.conversions > 0 ? m.cost / m.conversions : 0
        }));
    };

    const oneGrams = finalize(oneGramMap);
    const twoGrams = finalize(twoGramMap);
    const threeGrams = finalize(threeGramMap);

    const allGrams = [...oneGrams, ...twoGrams, ...threeGrams];

    // Winning: High ROAS (e.g. > 3), Significant Spend (e.g. top 20% of spenders?) or just top Conversion Value
    // Let's go with Top Conversion Value for "Winning" to be safe
    const topWinning = [...allGrams]
        .filter(g => g.conversions > 0)
        .sort((a, b) => b.conversionValue - a.conversionValue)
        .slice(0, 5);

    // Wasteful: High Spend, Low ROAS (e.g. < 1) or 0 Conversions
    const topWasteful = [...allGrams]
        .filter(g => g.roas < 1 || g.conversions === 0)
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5);

    return {
        oneGrams: oneGrams.sort((a, b) => b.cost - a.cost),
        twoGrams: twoGrams.sort((a, b) => b.cost - a.cost),
        threeGrams: threeGrams.sort((a, b) => b.cost - a.cost),
        topWinning,
        topWasteful
    };
}
