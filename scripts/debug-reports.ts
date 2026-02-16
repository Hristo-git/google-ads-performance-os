import { getReports } from "@/lib/supabase";
import * as fs from 'fs';

async function compareReports() {
    try {
        console.log("Fetching last 5 reports...");
        const reports = await getReports(undefined, 5); // Fetch last 5

        if (reports.length === 0) {
            console.log("No reports found.");
            return;
        }

        console.log(`Found ${reports.length} reports.`);

        const reportSummaries = reports.map(r => ({
            id: r.id,
            created_at: r.created_at,
            title: r.title,
            length: r.analysis?.length,
            model: r.model,
            // Capture first 100 chars of analysis to see variance
            start_of_analysis: r.analysis?.substring(0, 100).replace(/\n/g, ' '),
            metadata: r.metadata
        }));

        console.table(reportSummaries);

        // Detailed Comparison of specific reports if requested
        // For now, just logging them to a file could be useful
        fs.writeFileSync('report_debug_log.json', JSON.stringify(reports, null, 2));
        console.log("Detailed report logs written to report_debug_log.json");

    } catch (error) {
        console.error("Error comparing reports:", error);
    }
}

compareReports();
