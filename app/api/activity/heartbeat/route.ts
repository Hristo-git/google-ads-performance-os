import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { logActivity } from "@/lib/activity-logger";

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { path, eventType = 'HEARTBEAT', visibility } = body;

        // Log specified event type
        await logActivity(session.user.id, eventType, {
            path,
            visibility
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to log heartbeat" }, { status: 500 });
    }
}
