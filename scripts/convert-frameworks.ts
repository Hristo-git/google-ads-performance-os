/**
 * Convert the D2C performance marketing framework .docx files from
 * tmp/references/ into plain-text Markdown for later chunking + embedding.
 *
 * Usage:
 *   npx tsx scripts/convert-frameworks.ts
 *
 * Prerequisites:
 *   npm i -D mammoth
 */
import fs from 'fs/promises';
import path from 'path';
// @ts-expect-error — mammoth has no types package installed
import mammoth from 'mammoth';

const SOURCE_DIR = path.resolve(process.cwd(), 'tmp', 'references');
const OUT_DIR = path.resolve(process.cwd(), 'scripts', 'framework-content');

function slugify(name: string): string {
    return name
        .replace(/\.docx$/i, '')
        .replace(/[_]+/g, '-')
        .replace(/[^a-zA-Z0-9\-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

function titleFromFilename(name: string): string {
    return name
        .replace(/\.docx$/i, '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function main() {
    await fs.mkdir(OUT_DIR, { recursive: true });

    let files: string[] = [];
    try {
        files = (await fs.readdir(SOURCE_DIR)).filter(f => f.toLowerCase().endsWith('.docx'));
    } catch (err) {
        console.error(`[convert-frameworks] Source dir not found: ${SOURCE_DIR}`);
        process.exit(1);
    }

    if (files.length === 0) {
        console.warn('[convert-frameworks] No .docx files found');
        return;
    }

    console.log(`[convert-frameworks] Found ${files.length} .docx files in ${SOURCE_DIR}`);

    const index: Array<{
        slug: string;
        title: string;
        sourceFile: string;
        wordCount: number;
        outputFile: string;
    }> = [];

    for (const file of files) {
        const srcPath = path.join(SOURCE_DIR, file);
        const slug = slugify(file);
        const title = titleFromFilename(file);
        const outPath = path.join(OUT_DIR, `${slug}.md`);

        try {
            const result = await mammoth.convertToMarkdown({ path: srcPath });
            const markdown = `# ${title}\n\nSource: ${file}\n\n${result.value.trim()}\n`;
            await fs.writeFile(outPath, markdown, 'utf-8');
            const wordCount = markdown.split(/\s+/).length;
            index.push({ slug, title, sourceFile: file, wordCount, outputFile: `${slug}.md` });
            console.log(`  ✓ ${file} → ${slug}.md (${wordCount} words)`);
        } catch (err) {
            console.error(`  ✗ ${file} failed:`, (err as Error).message);
        }
    }

    await fs.writeFile(
        path.join(OUT_DIR, '_index.json'),
        JSON.stringify(index, null, 2),
        'utf-8'
    );

    console.log(`\n[convert-frameworks] Done. ${index.length}/${files.length} converted.`);
    console.log(`[convert-frameworks] Output: ${OUT_DIR}`);
}

main().catch(err => {
    console.error('[convert-frameworks] Fatal error:', err);
    process.exit(1);
});
