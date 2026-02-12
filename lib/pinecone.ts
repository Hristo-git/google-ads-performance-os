import { Pinecone } from '@pinecone-database/pinecone';

if (!process.env.PINECONE_API_KEY) {
    console.warn('PINECONE_API_KEY is not defined in environment variables');
}

console.log(`[Pinecone] Initializing with:
  - API Key: ${process.env.PINECONE_API_KEY ? "Present" : "MISSING"}
  - Index Name: ${process.env.PINECONE_INDEX || 'google-ads-reports'} (Env var: ${process.env.PINECONE_INDEX})
`);

const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY || '',
});

export const index = pc.index(process.env.PINECONE_INDEX || 'google-ads-reports');

/**
 * Helper to get embeddings from Pinecone Inference API
 */
async function getEmbeddings(text: string, isQuery: boolean = false) {
    const apiKey = process.env.PINECONE_API_KEY || '';

    const payload = {
        model: "multilingual-e5-large",
        parameters: {
            input_type: isQuery ? "query" : "passage",
            truncate: "END"
        },
        inputs: [{ text }]
    };

    const res = await fetch('https://api.pinecone.io/embed', {
        method: 'POST',
        headers: {
            'Api-Key': apiKey,
            'Content-Type': 'application/json',
            'X-Pinecone-Api-Version': '2024-10'
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Embedding failed: ${res.status} - ${errorText}`);
    }

    const data = await res.json();
    return data.data[0].values;
}

export async function upsertReport(reportId: string, content: string, metadata: { customerId: string, [key: string]: any }) {
    try {
        console.log('[Pinecone] Generating embedding for report:', reportId);

        // 1. Get embedding manually
        const values = await getEmbeddings(content, false);

        // 2. Build the record with vector values
        const record = {
            id: reportId,
            values: values,
            metadata: {
                ...metadata,
                analysis_content: content.substring(0, 10000), // Pinecone metadata limit is 40KB, being safe
                timestamp: new Date().toISOString(),
            }
        };

        console.log('[Pinecone] Upserting vector to namespace "reports"');
        await index.namespace('reports').upsert({ records: [record] });

        console.log('[Pinecone] ✅ Successfully upserted report:', reportId);
        return true;
    } catch (error) {
        console.error('[Pinecone] ❌ Error upserting to Pinecone:', error);
        return false;
    }
}

export async function deleteReport(reportId: string): Promise<boolean> {
    try {
        console.log('[Pinecone] Deleting report:', reportId);
        await index.namespace('reports').deleteOne({ id: reportId });
        console.log('[Pinecone] Deleted report:', reportId);
        return true;
    } catch (error) {
        console.error('[Pinecone] Error deleting report:', error);
        return false;
    }
}

export async function querySimilarReports(query: string, customerId?: string, limit: number = 20) {
    try {
        console.log('[Pinecone] Generating embedding for query:', query);

        // 1. Get embedding manually
        const values = await getEmbeddings(query, true);

        // 2. Query using vector
        const queryOptions: any = {
            topK: limit,
            vector: values,
            includeMetadata: true,
        };

        if (customerId) {
            queryOptions.filter = { customerId: { '$eq': customerId } };
        }

        console.log('[Pinecone] Executing vector query on namespace "reports"');
        const results = await index.namespace('reports').query(queryOptions);

        console.log('[Pinecone] ✅ Query successful, matches:', results.matches?.length || 0);
        return results.matches;
    } catch (error) {
        console.error('[Pinecone] ❌ Error querying Pinecone:', error);
        return [];
    }
}
