import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getReports, GadsReport } from '../lib/supabase';

// Helper: Split analysis into two documents (Copied from AIReportsHub.tsx)
function splitDocuments(markdown: string): { executive: string; technical: string; hasTwo: boolean } {
    const splitPatterns = [
        /---\s*\n##\s*DOCUMENT\s*2[:\s]/i,
        /---\s*\n##\s*ДОКУМЕНТ\s*2[:\s]/i,
        /##\s*DOCUMENT\s*2[:\s]/i,
        /##\s*ДОКУМЕНТ\s*2[:\s]/i,
        /---\s*\n###?\s*ТЕХНИЧЕСКИ АНАЛИЗ/i,
        /---\s*\n###?\s*TECHNICAL ANALYSIS/i,
    ];

    if (!markdown) return { executive: '', technical: '', hasTwo: false };

    for (const pattern of splitPatterns) {
        const match = markdown.search(pattern);
        if (match > 0) {
            return {
                executive: markdown.substring(0, match).trim(),
                technical: markdown.substring(match).trim(),
                hasTwo: true,
            };
        }
    }

    return { executive: markdown, technical: '', hasTwo: false };
}

async function checkReports() {
    try {
        console.log("Fetching last 100 reports from Supabase...");
        const reports = await getReports(undefined, 100);

        if (reports.length === 0) {
            console.log("No reports found.");
            return;
        }

        console.log(`Analyzing ${reports.length} reports...\n`);

        const stats: Record<string, { total: number; bothSections: number }> = {};

        const results = reports.map(r => {
            const { hasTwo } = splitDocuments(r.analysis || '');
            const templateId = r.template_id || 'unknown';

            if (!stats[templateId]) {
                stats[templateId] = { total: 0, bothSections: 0 };
            }
            stats[templateId].total++;
            if (hasTwo) {
                stats[templateId].bothSections++;
            }

            // Look for potential headers that might have caused failure
            let failureReason = '';
            if (!hasTwo && r.analysis) {
                const potentialHeaders = r.analysis.match(/##\s*[^\n]+/g) || [];
                const techHeaders = potentialHeaders.filter(h => h.toLowerCase().includes('technical') || h.toLowerCase().includes('технически'));
                if (techHeaders.length > 0) {
                    failureReason = `Found header but no split: ${techHeaders.join(', ')}`;
                } else {
                    failureReason = 'No technical header found';
                    if (r.analysis.length < 500) failureReason = 'Analysis too short';
                }
            }

            return {
                id: r.id.substring(0, 8),
                template: templateId,
                title: r.title?.substring(0, 40),
                created_at: new Date(r.created_at || '').toLocaleDateString(),
                hasBoth: hasTwo ? '✅' : '❌',
                failure: failureReason
            };
        });

        console.table(results);

        console.log("\nSummary by Template:");
        const summaryTable = Object.entries(stats).map(([template, s]) => ({
            Template: template,
            Total: s.total,
            'Both Sections': s.bothSections,
            'Success Rate': `${((s.bothSections / s.total) * 100).toFixed(1)}%`
        }));
        console.table(summaryTable);

        const totalBoth = reports.filter(r => splitDocuments(r.analysis || '').hasTwo).length;
        console.log(`\nOverall Success Rate: ${totalBoth}/${reports.length} (${((totalBoth / reports.length) * 100).toFixed(1)}%)`);

    } catch (error) {
        console.error("Error checking reports:", error);
    }
}

checkReports();
