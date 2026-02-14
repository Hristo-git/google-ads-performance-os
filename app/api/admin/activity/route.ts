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

        // Calculate session time and other stats per user (last X days)
        const { data: userDataXh } = await supabaseAdmin
            .from('user_activity_logs')
            .select('user_id, event_type, gads_users(name, username)')
            .gte('created_at', startDateIso);

        const userSummary: Record<string, { name: string, username: string, sessionMinutes: number, aiCalls: number, apiCalls: number }> = {};

        userDataXh?.forEach(row => {
            const uid = row.user_id;
            const gUser = Array.isArray(row.gads_users) ? row.gads_users[0] : row.gads_users;

            if (!userSummary[uid]) {
                userSummary[uid] = {
                    name: gUser?.name || 'Unknown',
                    username: gUser?.username || 'Unknown',
                    sessionMinutes: 0,
                    aiCalls: 0,
                    apiCalls: 0
                };
            }
            if (row.event_type === 'HEARTBEAT') userSummary[uid].sessionMinutes++;
            if (row.event_type === 'AI_ANALYSIS') userSummary[uid].aiCalls++;
            if (row.event_type === 'API_CALL') userSummary[uid].apiCalls++;
        });

        const activeUsersXh = Object.keys(userSummary).length;

        return NextResponse.json({
            logs,
            stats: {
                logins24h: loginsXh || 0,
                aiCalls24h: aiCallsXh || 0,
                apiCalls24h: apiCallsXh || 0,
                activeUsers24h: activeUsersXh,
                userSummary
            }
        });

    } catch (error: any) {
        console.error("Failed to fetch activity logs:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
