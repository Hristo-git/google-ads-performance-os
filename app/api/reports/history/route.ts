import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getReports } from "@/lib/supabase";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            console.log("[History API] Unauthorized access attempt");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const customerId = searchParams.get("customerId") || undefined;
        const query = searchParams.get("query");
        const limit = parseInt(searchParams.get("limit") || "20");

        console.log(`[History API] Fetching reports for customer: ${customerId}, query: ${query}, limit: ${limit}`);

        const reports = await getReports(customerId, limit);
        console.log(`[History API] Found ${reports.length} reports in database`);

        // Transform the response to match frontend expectations
        const transformedReports = reports.map(report => ({
            id: report.id,
            customerId: report.customer_id,
            templateId: report.template_id,
            reportTitle: report.title,
            analysis: report.analysis,
            audience: report.audience,
            timestamp: report.created_at,
            language: report.language,
            model: report.model,
            metadata: report.metadata,
        }));

        return NextResponse.json({ reports: transformedReports });
    } catch (error: any) {
        console.error("History search error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to search history" },
            { status: 500 }
        );
    }
}
