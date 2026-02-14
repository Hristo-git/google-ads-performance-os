import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getReports } from "@/lib/supabase";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const customerId = searchParams.get("customerId") || undefined;
        // query param is ignored for now as we are doing chronological history, 
        // but could be added back with ILIKE search in supabase if needed.
        const limit = parseInt(searchParams.get("limit") || "20");

        const reports = await getReports(customerId, limit);

        return NextResponse.json({ reports });
    } catch (error: any) {
        console.error("History search error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to search history" },
            { status: 500 }
        );
    }
}
