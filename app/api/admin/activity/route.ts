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
        const days = parseInt(searchParams.get('days') || '1');

        // Fetch logs (recent events, regardless of date filter, but limited)
        const { data: logs, error } = await supabaseAdmin
            .from('user_activity_logs')
            .select('*, gads_users(username, name)')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        // Calculate start date based on 'days' parameter
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateIso = startDate.toISOString();

        // Calculate simple stats (last X days)
        const { count: loginsXh } = await supabaseAdmin
            .from('user_activity_logs')
            .select('*', { count: 'exact', head: true })
            .eq('event_type', 'LOGIN')
            .gte('created_at', startDateIso);

        const { count: aiCallsXh } = await supabaseAdmin
            .from('user_activity_logs')
            .select('*', { count: 'exact', head: true })
            .eq('event_type', 'AI_ANALYSIS')
            .gte('created_at', startDateIso);

        const { count: apiCallsXh } = await supabaseAdmin
            .from('user_activity_logs')
            .select('*', { count: 'exact', head: true })
            .eq('event_type', 'API_CALL')
            .gte('created_at', startDateIso);

        // 1. Fetch all users to ensure we check statistics for everyone
        const { data: users, error: usersError } = await supabaseAdmin
            .from('gads_users')
            .select('id, name, username')
            .eq('is_active', true);

        if (usersError) throw usersError;

        // 2. Fetch aggregate stats for each user in parallel
        // This bypasses the 1000-row result limit because we use 'count' queries
        const userSummary: Record<string, { name: string, username: string, sessionMinutes: number, aiCalls: number, apiCalls: number }> = {};

        const userStatPromises = users.map(async (user) => {
            const userId = user.id;

            // Fetch counts for different event types
            const [heartbeats, pageViews, aiCalls, apiCalls] = await Promise.all([
                supabaseAdmin.from('user_activity_logs').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('event_type', 'HEARTBEAT').gte('created_at', startDateIso),
                supabaseAdmin.from('user_activity_logs').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('event_type', 'PAGE_VIEW').gte('created_at', startDateIso),
                supabaseAdmin.from('user_activity_logs').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('event_type', 'AI_ANALYSIS').gte('created_at', startDateIso),
                supabaseAdmin.from('user_activity_logs').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('event_type', 'API_CALL').gte('created_at', startDateIso)
            ]);

            const hbCount = heartbeats.count || 0;
            const pvCount = pageViews.count || 0;
            const aiCount = aiCalls.count || 0;
            const apiCount = apiCalls.count || 0;

            // If user has any activity, add to summary
            if (hbCount > 0 || pvCount > 0 || aiCount > 0 || apiCount > 0) {
                userSummary[userId] = {
                    name: user.name,
                    username: user.username,
                    // Count both heartbeats and page views as signs of active time
                    // Each one represents roughly a slice of the 30s interval logic
                    sessionMinutes: Math.round((hbCount + pvCount) * 0.5 * 10) / 10,
                    aiCalls: aiCount,
                    apiCalls: apiCount
                };
            }
        });

        await Promise.all(userStatPromises);

        const activeUsersCount = Object.keys(userSummary).length;

        return NextResponse.json({
            logs,
            stats: {
                logins24h: loginsXh || 0,
                aiCalls24h: aiCallsXh || 0,
                apiCalls24h: apiCallsXh || 0,
                activeUsers24h: activeUsersCount,
                userSummary
            }
        });

    } catch (error: any) {
        console.error("Failed to fetch activity logs:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
