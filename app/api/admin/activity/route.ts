import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'admin') {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '50');

        // Fetch logs
        const { data: logs, error } = await supabaseAdmin
            .from('user_activity_logs')
            .select('*, gads_users(username, name)')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        // Calculate simple stats (last 24h)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const { count: logins24h } = await supabaseAdmin
            .from('user_activity_logs')
            .select('*', { count: 'exact', head: true })
            .eq('event_type', 'LOGIN')
            .gte('created_at', yesterday.toISOString());

        const { count: aiCalls24h } = await supabaseAdmin
            .from('user_activity_logs')
            .select('*', { count: 'exact', head: true })
            .eq('event_type', 'AI_ANALYSIS')
            .gte('created_at', yesterday.toISOString());

        // Count unique active users (last 24h)
        // Note: Supabase JS doesn't do distinct count easily without RPC or raw query, 
        // so we'll approximate active users from recent heartbeats/logins if needed, 
        // or just fetch distinct user_ids.
        // Simplified approach: just count unique users from a recent window query
        const { data: activeUsersData } = await supabaseAdmin
            .from('user_activity_logs')
            .select('user_id')
            .gte('created_at', yesterday.toISOString());

        const activeUsers24h = new Set(activeUsersData?.map(d => d.user_id)).size;


        return NextResponse.json({
            logs,
            stats: {
                logins24h: logins24h || 0,
                aiCalls24h: aiCalls24h || 0,
                activeUsers24h: activeUsers24h || 0
            }
        });

    } catch (error: any) {
        console.error("Failed to fetch activity logs:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
