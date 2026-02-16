import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const customerId = searchParams.get("customerId");

        // Query the most recent 20 reports from the whole database
        const { data: allRecent, error: dbError } = await supabaseAdmin
            .from('gads_reports')
            .select('id, customer_id, title, created_at')
            .order('created_at', { ascending: false })
            .limit(20);

        return NextResponse.json({
            debugInfo: {
                now: new Date().toISOString(),
                serverTime: Date.now(),
                requestedCustomerId: customerId
            },
            totalInResult: allRecent?.length || 0,
            recentReports: allRecent,
            error: dbError
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
