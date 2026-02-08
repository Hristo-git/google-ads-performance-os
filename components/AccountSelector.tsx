'use client';

import { useRouter } from 'next/navigation';
import { ACCOUNTS } from '@/config/accounts';

interface AccountSelectorProps {
    allowedIds: string[];
    role: string; // 'admin' | 'viewer'
}

export default function AccountSelector({ allowedIds, role }: AccountSelectorProps) {
    const router = useRouter();

    const handleSelect = (id: string) => {
        router.push(`/?customerId=${id}`);
    };

    const isAdmin = role === 'admin' || allowedIds.includes('*');

    const displayAccounts = isAdmin
        ? ACCOUNTS
        : ACCOUNTS.filter(acc => allowedIds.includes(acc.id));

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white p-4">
            <div className="w-full max-w-4xl p-8 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700">
                <h2 className="text-3xl font-bold mb-2 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                    Select Account
                </h2>
                <p className="text-gray-400 text-center mb-8">
                    {isAdmin ? 'You have access to all countries' : 'Select an assigned account to view performance'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayAccounts.map((acc) => (
                        <button
                            key={acc.id}
                            onClick={() => handleSelect(acc.id)}
                            className="p-6 bg-gray-700/50 hover:bg-gray-600 border border-gray-600 rounded-xl transition-all hover:scale-[1.02] text-left group flex flex-col justify-between h-32"
                        >
                            <div>
                                <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
                                    {acc.country}
                                </div>
                                <h3 className="text-lg font-bold text-white group-hover:text-blue-300 transition-colors">
                                    {acc.name}
                                </h3>
                            </div>
                            <p className="text-xs text-gray-500 font-mono">
                                ID: {acc.id}
                            </p>
                        </button>
                    ))}

                    {displayAccounts.length === 0 && (
                        <div className="col-span-full text-center py-12 bg-gray-900/50 rounded-xl border border-dashed border-gray-700">
                            <p className="text-red-400 font-medium">No accounts assigned to this user.</p>
                            <p className="text-gray-500 text-sm mt-1">Please contact your administrator to grant access.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
