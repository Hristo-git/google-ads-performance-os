import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const customerId = searchParams.get("customerId");

        // 1. Check direct Supabase query
        let query = supabaseAdmin
            .from('gads_reports')
            .select('id, customer_id, title, created_at')
            .order('created_at', { ascending: false })
            .limit(5);

        if (customerId) {
            query = query.eq('customer_id', customerId);
        }

        const { data: directReports, error: directError } = await query;

        return NextResponse.json({
            session: {
                user: session.user.email,
                customerId: customerId || 'not provided'
            },
            supabase: {
                url: process.env.SUPABASE_URL ? 'PRESENT' : 'MISSING',
                hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
            },
            reportsFound: directReports?.length || 0,
            recentReports: directReports,
            error: directError
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
