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
        activeUsers24h: 0
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
                    <h1 className="text-3xl font-bold tracking-tight text-white">Activity Monitor</h1>
                    <p className="text-slate-400 mt-1">Real-time tracking of user interactions and AI usage.</p>
                </div>
                <button
                    onClick={fetchLogs}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors border border-slate-700"
                >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-3">
                {/* Active Users Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <div className="flex flex-row items-center justify-between pb-2">
                        <div className="text-sm font-medium text-slate-400">Active Users (24h)</div>
                        <Users className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.activeUsers24h}</div>
                    <p className="text-xs text-slate-500">Unique active sessions</p>
                </div>

                {/* Logins Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <div className="flex flex-row items-center justify-between pb-2">
                        <div className="text-sm font-medium text-slate-400">Logins (24h)</div>
                        <LogIn className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.logins24h}</div>
                    <p className="text-xs text-slate-500">Successful sign-ins</p>
                </div>

                {/* AI Analysis Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <div className="flex flex-row items-center justify-between pb-2">
                        <div className="text-sm font-medium text-slate-400">AI Analyses (24h)</div>
                        <BrainCircuit className="h-4 w-4 text-purple-500" />
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.aiCalls24h}</div>
                    <p className="text-xs text-slate-500">Generated insights</p>
                </div>
            </div>

            {/* Activity Log Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
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
                                    <td className="px-6 py-4 font-mono text-xs text-slate-400 whitespace-nowrap">
                                        {new Date(log.created_at).toLocaleString('bg-BG')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-white">{log.gads_users?.name || 'Unknown'}</div>
                                        <div className="text-xs text-slate-500">{log.gads_users?.username}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
                                            ${log.event_type === 'LOGIN' ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900' :
                                                log.event_type === 'AI_ANALYSIS' ? 'bg-purple-950/30 text-purple-400 border-purple-900' :
                                                    log.event_type === 'HEARTBEAT' ? 'bg-slate-800 text-slate-400 border-slate-700' :
                                                        'bg-blue-950/30 text-blue-400 border-blue-900'}`}>
                                            {log.event_type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400 max-w-md truncate">
                                        <pre className="font-mono text-[10px] truncate">
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
    );
}
