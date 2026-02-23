import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { deleteReport as deletePineconeReport } from "@/lib/pinecone";
import { deleteReport as deleteSupabaseReport } from "@/lib/supabase";

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Admin only
        if ((session.user as any).role !== 'admin') {
            return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
        }

        const { id } = await params;

        if (!id) {
            return NextResponse.json({ error: "Missing report ID" }, { status: 400 });
        }

        // Delete from both Supabase (SQL) and Pinecone (vector search)
        const [sqlSuccess, vectorSuccess] = await Promise.allSettled([
            deleteSupabaseReport(id),
            deletePineconeReport(id),
        ]);

        const sqlOk = sqlSuccess.status === 'fulfilled' && sqlSuccess.value;
        if (!sqlOk) {
            const reason = sqlSuccess.status === 'rejected' ? sqlSuccess.reason : 'Delete returned false';
            console.error('[DELETE] Supabase delete failed:', reason);
            return NextResponse.json({ error: "Failed to delete report from database" }, { status: 500 });
        }

        if (vectorSuccess.status === 'rejected') {
            // Non-fatal — Pinecone failure should not block the user
            console.error('[DELETE] Pinecone delete failed (non-fatal):', vectorSuccess.reason);
        }

        return NextResponse.json({ success: true, deletedId: id });
    } catch (error: any) {
        console.error("Error deleting report:", error);
        return NextResponse.json({ error: error.message || "Failed to delete report" }, { status: 500 });
    }
}
