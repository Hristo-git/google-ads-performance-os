/**
 * Chunk the converted framework markdown files and upsert embeddings
 * into the Pinecone `frameworks` namespace.
 *
 * Usage (one-time after convert-frameworks.ts):
 *   npx tsx scripts/embed-frameworks.ts
 *
 * Prerequisites:
 *   - scripts/framework-content/*.md produced by convert-frameworks.ts
 *   - PINECONE_API_KEY and PINECONE_INDEX env vars set in .env.local
 */
import fs from 'fs/promises';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const CONTENT_DIR = path.resolve(process.cwd(), 'scripts', 'framework-content');

// ~1000 tokens ≈ 4000 chars (conservative); 100 token overlap ≈ 400 chars
const CHUNK_SIZE = 4000;
const CHUNK_OVERLAP = 400;

function chunkText(text: string, size: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + size, text.length);
        chunks.push(text.slice(start, end));
        if (end >= text.length) break;
        start = end - overlap;
    }
    return chunks;
}

interface IndexEntry {
    slug: string;
    title: string;
    sourceFile: string;
    wordCount: number;
    outputFile: string;
}

async function main() {
    let indexEntries: IndexEntry[] = [];
    try {
        const indexPath = path.join(CONTENT_DIR, '_index.json');
        indexEntries = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
    } catch (err) {
        console.error(`[embed-frameworks] Run convert-frameworks.ts first. Missing: ${CONTENT_DIR}/_index.json`);
        process.exit(1);
    }

    console.log(`[embed-frameworks] Embedding ${indexEntries.length} frameworks into Pinecone namespace "frameworks"`);

    const { upsertFramework } = await import('../lib/pinecone');

    let totalChunks = 0;
    let succeeded = 0;
    let failed = 0;

    for (const entry of indexEntries) {
        const filePath = path.join(CONTENT_DIR, entry.outputFile);
        let content: string;
        try {
            content = await fs.readFile(filePath, 'utf-8');
        } catch (err) {
            console.error(`  ✗ Cannot read ${entry.outputFile}:`, (err as Error).message);
            failed++;
            continue;
        }

        const chunks = chunkText(content, CHUNK_SIZE, CHUNK_OVERLAP);
        console.log(`  → ${entry.title}: ${chunks.length} chunks`);

        for (let i = 0; i < chunks.length; i++) {
            const chunkId = `${entry.slug}__c${i}`;
            const ok = await upsertFramework(chunkId, chunks[i], {
                frameworkName: entry.title,
                sourceFile: entry.sourceFile,
                chunkIndex: i,
                totalChunks: chunks.length,
            });
            totalChunks++;
            if (ok) succeeded++;
            else failed++;
        }
    }

    console.log(`\n[embed-frameworks] Done. Chunks: ${totalChunks} | OK: ${succeeded} | Failed: ${failed}`);
}

main().catch(err => {
    console.error('[embed-frameworks] Fatal error:', err);
    process.exit(1);
});
