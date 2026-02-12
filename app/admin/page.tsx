import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { redirect } from "next/navigation";
import UserManagementPanel from "@/components/admin/UserManagementPanel";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        redirect("/login");
    }

    if (session.user.role !== 'admin') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-red-400 mb-4">Access Denied</h1>
                    <p className="text-gray-400">You do not have permission to access this page.</p>
                    <a href="/" className="mt-4 inline-block text-blue-400 hover:text-blue-300">
                        ← Back to Dashboard
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                            Admin Panel
                        </h1>
                        <p className="text-gray-400 mt-1">Manage users and account access</p>
                    </div>
                    <div className="flex gap-4">
                        <a
                            href="/admin/activity"
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Activity Monitor
                        </a>
                        <a
                            href="/"
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                        >
                            ← Back to Dashboard
                        </a>
                    </div>
                </div>

                <UserManagementPanel />
            </div>
        </div>
    );
}
