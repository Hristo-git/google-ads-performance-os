
import dotenv from 'dotenv';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function cleanupPinecone() {
    console.log("=== Pinecone Cleanup ===");

    const apiKey = process.env.PINECONE_API_KEY;
    // The one we want to KEEP
    const KEEP_INDEX = 'google-ads-reports';

    if (!apiKey) {
        console.error("❌ MISSING PINECONE_API_KEY");
        return;
    }

    const pc = new Pinecone({ apiKey });

    try {
        console.log("1. Listing Indexes...");
        const indexes = await pc.listIndexes();

        if (!indexes.indexes || indexes.indexes.length === 0) {
            console.log("No indexes found.");
            return;
        }

        console.log(`Found ${indexes.indexes.length} indexes.`);

        for (const idx of indexes.indexes) {
            const name = idx.name;

            if (name === KEEP_INDEX) {
                console.log(`\n🛡️  SKIPPING "${name}" (Target index with data)`);
                continue;
            }

            try {
                process.stdout.write(`\nChecking "${name}"... `);
                const pIndex = pc.index(name);
                const stats = await pIndex.describeIndexStats();
                const count = stats.totalRecordCount;

                if (count === 0) {
                    console.log(`Empty (0 records). Deleting... 🗑️`);
                    await pc.deleteIndex(name);
                    console.log(`   ✅ Deleted "${name}"`);
                } else {
                    console.log(`⚠️  Has ${count} records. SKIPPING deletion just in case. `);
                }
            } catch (e: any) {
                console.log(`❌ Error processing "${name}": ${e.message}`);
            }
        }

        console.log("\n=== Cleanup Complete ===");

    } catch (error: any) {
        console.error("\n❌ Pinecone Error:", error.message);
    }
}

cleanupPinecone();
