'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Loader2, Users, Activity, LogIn, BrainCircuit, RefreshCw } from 'lucide-react';

export default function ActivityDashboard() {
    const { data: session } = useSession();
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<any[]>([]);
    const [stats, setStats] = useState({
        logins24h: 0,
        aiCalls24h: 0,
        activeUsers24h: 0,
        sessionMinutes: {} as Record<string, number>
    });

    useEffect(() => {
        if (session?.user?.role === 'admin') {
            fetchLogs();
        }
    }, [session]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/activity?limit=100');
            const data = await res.json();
            if (data.logs) setLogs(data.logs);
            if (data.stats) setStats(data.stats);
        } catch (error) {
            console.error("Failed to load logs", error);
        } finally {
            setLoading(false);
        }
    };

    // Calculate per-user stats from logs (last 100)
    const userStats = Array.from(new Set(logs.map(l => l.user_id))).map(uid => {
        const userLogs = logs.filter(l => l.user_id === uid);
        const user = userLogs[0]?.gads_users;
        return {
            id: uid,
            name: user?.name || 'Unknown',
            username: user?.username || 'Unknown',
            aiCalls: userLogs.filter(l => l.event_type === 'AI_ANALYSIS').length,
            sessionMinutes: stats.sessionMinutes[uid] || 0
        };
    }).sort((a, b) => b.sessionMinutes - a.sessionMinutes);

    const totalSessionMinutes = Object.values(stats.sessionMinutes).reduce((a, b) => a + b, 0);

    if (!session || session.user.role !== 'admin') {
        return <div className="p-8 text-center text-slate-400">Unauthorized Access</div>;
    }

    if (loading && logs.length === 0) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 p-6 space-y-6 text-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white italic">Activity Monitor</h1>
                    <p className="text-slate-400 mt-1">Real-time tracking of engagement, session time and AI usage.</p>
                </div>
                <div className="flex gap-3">
                    <a
                        href="/admin"
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors border border-slate-700"
                    >
                        ← Back to Admin
                    </a>
                    <button
                        onClick={fetchLogs}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors border border-indigo-400/20 shadow-lg shadow-indigo-500/20"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-4">
                {/* Total Engagement Time */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 bg-gradient-to-br from-indigo-500/10 to-transparent">
                    <div className="flex flex-row items-center justify-between pb-2">
                        <div className="text-sm font-medium text-slate-400">Total Engagement (24h)</div>
                        <Activity className="h-4 w-4 text-indigo-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {Math.floor(totalSessionMinutes / 60)}h {totalSessionMinutes % 60}m
                    </div>
                    <p className="text-xs text-slate-500">Aggregated session duration</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <div className="flex flex-row items-center justify-between pb-2">
                        <div className="text-sm font-medium text-slate-400">Active Users (24h)</div>
                        <Users className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.activeUsers24h}</div>
                    <p className="text-xs text-slate-500">Unique active sessions</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <div className="flex flex-row items-center justify-between pb-2">
                        <div className="text-sm font-medium text-slate-400">Logins (24h)</div>
                        <LogIn className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.logins24h}</div>
                    <p className="text-xs text-slate-500">Successful sign-ins</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <div className="flex flex-row items-center justify-between pb-2">
                        <div className="text-sm font-medium text-slate-400">AI Analyses (24h)</div>
                        <BrainCircuit className="h-4 w-4 text-purple-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.aiCalls24h}</div>
                    <p className="text-xs text-slate-500">Generated insights</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* User Table */}
                <div className="md:col-span-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden self-start">
                    <div className="p-4 border-b border-slate-800 bg-slate-950/30">
                        <h3 className="font-semibold text-white">Top Active Users</h3>
                    </div>
                    <div className="p-0">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-950/20 text-slate-500">
                                <tr>
                                    <th className="px-4 py-2 font-medium">User</th>
                                    <th className="px-4 py-2 font-medium text-right">Time</th>
                                    <th className="px-4 py-2 font-medium text-right">AI</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {userStats.map(u => (
                                    <tr key={u.id} className="hover:bg-slate-800/30">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-200">{u.name}</div>
                                            <div className="text-[10px] text-slate-500">{u.username}</div>
                                        </td>
                                        <td className="px-4 py-3 text-right text-indigo-400 font-medium">
                                            {u.sessionMinutes}m
                                        </td>
                                        <td className="px-4 py-3 text-right text-purple-400 font-medium">
                                            {u.aiCalls}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Activity Log Table */}
                <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="p-6 border-b border-slate-800">
                        <h3 className="text-lg font-semibold text-white">Recent Activity Stream</h3>
                        <p className="text-sm text-slate-400">Latest 100 events across the platform.</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-400 uppercase bg-slate-950/50 border-b border-slate-800">
                                <tr>
                                    <th className="px-6 py-3">Timestamp</th>
                                    <th className="px-6 py-3">User</th>
                                    <th className="px-6 py-3">Event Type</th>
                                    <th className="px-6 py-3">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                                            {new Date(log.created_at).toLocaleString('bg-BG')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-white">{log.gads_users?.name || 'Unknown'}</div>
                                            <div className="text-[10px] text-slate-500">{log.gads_users?.username}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase
                                                ${log.event_type === 'LOGIN' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                    log.event_type === 'AI_ANALYSIS' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                                        log.event_type === 'HEARTBEAT' ? 'bg-slate-800 text-slate-500 opacity-60' :
                                                            'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                                                {log.event_type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 max-w-xs truncate">
                                            <pre className="font-mono text-[9px] truncate">
                                                {JSON.stringify(log.metadata)}
                                            </pre>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
        </div >
    );
}
