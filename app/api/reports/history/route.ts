import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { querySimilarReports } from "@/lib/pinecone";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const customerId = searchParams.get("customerId") || undefined;
        const query = searchParams.get("query") || "";
        const limit = parseInt(searchParams.get("limit") || "10");

        const searchQuery = query || "analysis"; // Default to broad search if empty to show recent
        const matches = await querySimilarReports(searchQuery, customerId, limit);

        const reports = matches.map((m: any) => ({
            id: m.id,
            score: m.score,
            timestamp: m.metadata?.timestamp,
            templateId: m.metadata?.templateId,
            audience: m.metadata?.audience,
            reportTitle: m.metadata?.reportTitle,
            analysis: m.metadata?.analysis_content || m.analysis_content,
        }));

        return NextResponse.json({ reports });
    } catch (error: any) {
        console.error("History search error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to search history" },
            { status: 500 }
        );
    }
}
