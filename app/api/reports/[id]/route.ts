import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { deleteReport } from "@/lib/pinecone";

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

        const success = await deleteReport(id);

        if (!success) {
            return NextResponse.json({ error: "Failed to delete report" }, { status: 500 });
        }

        return NextResponse.json({ success: true, deletedId: id });
    } catch (error: any) {
        console.error("Error deleting report:", error);
        return NextResponse.json({ error: error.message || "Failed to delete report" }, { status: 500 });
    }
}
