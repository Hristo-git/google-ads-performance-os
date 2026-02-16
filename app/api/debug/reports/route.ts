import { NextResponse } from "next/server";
import { getReports } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const reports = await getReports(undefined, 5);

        const summaries = reports.map(r => ({
            id: r.id,
            created_at: r.created_at,
            title: r.title,
            model: r.model,
            params: r.metadata?.settings,
            // Capture snippet to check for variability
            snippet: r.analysis ? r.analysis.substring(0, 200) : "N/A"
        }));

        return NextResponse.json({
            count: reports.length,
            reports: summaries
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
