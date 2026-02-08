'use client';

import { useState, useEffect } from 'react';
import { ACCOUNTS } from '@/config/accounts';

interface User {
    id: string;
    username: string;
    name: string;
    email: string | null;
    role: 'admin' | 'viewer';
    is_active: boolean;
    created_at: string;
    allowedAccountIds?: string[];
}

export default function UserManagementPanel() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        name: '',
        email: '',
        role: 'viewer' as 'admin' | 'viewer',
        allowedAccountIds: [] as string[]
    });

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/users');
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            setUsers(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUserAccounts = async (userId: string): Promise<string[]> => {
        const res = await fetch(`/api/admin/users/${userId}/accounts`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.accountIds || [];
    };

    const handleEdit = async (user: User) => {
        const accountIds = await fetchUserAccounts(user.id);
        setEditingUser({ ...user, allowedAccountIds: accountIds });
        setFormData({
            username: user.username,
            password: '',
            name: user.name,
            email: user.email || '',
            role: user.role,
            allowedAccountIds: accountIds
        });
    };

    const handleCreate = () => {
        setEditingUser(null);
        setFormData({
            username: '',
            password: '',
            name: '',
            email: '',
            role: 'viewer',
            allowedAccountIds: []
        });
        setShowCreateForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            if (editingUser) {
                // Update user
                const res = await fetch(`/api/admin/users/${editingUser.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formData.name,
                        email: formData.email || null,
                        role: formData.role,
                        password: formData.password || undefined
                    })
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to update user');
                }

                // Update accounts
                await fetch(`/api/admin/users/${editingUser.id}/accounts`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accountIds: formData.allowedAccountIds })
                });

                setEditingUser(null);
            } else {
                // Create user
                const res = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to create user');
                }

                setShowCreateForm(false);
            }

            await fetchUsers();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
    };

    const handleDelete = async (userId: string, username: string) => {
        if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;

        try {
            const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete user');
            }
            await fetchUsers();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
    };

    const toggleAccountAccess = (accountId: string) => {
        setFormData(prev => ({
            ...prev,
            allowedAccountIds: prev.allowedAccountIds.includes(accountId)
                ? prev.allowedAccountIds.filter(id => id !== accountId)
                : [...prev.allowedAccountIds, accountId]
        }));
    };

    const toggleAllAccounts = () => {
        if (formData.allowedAccountIds.includes('*')) {
            setFormData(prev => ({ ...prev, allowedAccountIds: [] }));
        } else {
            setFormData(prev => ({ ...prev, allowedAccountIds: ['*'] }));
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {error && (
                <div className="p-4 bg-red-500/20 border border-red-500 text-red-200 rounded-lg">
                    {error}
                </div>
            )}

            {/* User Form */}
            {(showCreateForm || editingUser) && (
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <h2 className="text-xl font-bold mb-4">
                        {editingUser ? `Edit User: ${editingUser.username}` : 'Create New User'}
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    Username
                                </label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))}
                                    disabled={!!editingUser}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
                                    required={!editingUser}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    Password {editingUser && <span className="text-gray-500">(leave blank to keep)</span>}
                                </label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    required={!editingUser}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    Email (optional)
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                                Role
                            </label>
                            <select
                                value={formData.role}
                                onChange={e => setFormData(prev => ({ ...prev, role: e.target.value as 'admin' | 'viewer' }))}
                                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            >
                                <option value="viewer">Viewer</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Account Access
                            </label>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 p-2 bg-gray-700/50 rounded hover:bg-gray-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.allowedAccountIds.includes('*')}
                                        onChange={toggleAllAccounts}
                                        className="w-4 h-4 rounded border-gray-500"
                                    />
                                    <span className="font-medium text-blue-400">All Accounts (*)</span>
                                </label>

                                {!formData.allowedAccountIds.includes('*') && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                                        {ACCOUNTS.map(account => (
                                            <label
                                                key={account.id}
                                                className="flex items-center gap-2 p-2 bg-gray-700/50 rounded hover:bg-gray-700 cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={formData.allowedAccountIds.includes(account.id)}
                                                    onChange={() => toggleAccountAccess(account.id)}
                                                    className="w-4 h-4 rounded border-gray-500"
                                                />
                                                <span>{account.name}</span>
                                                <span className="text-xs text-gray-500">{account.id}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="submit"
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
                            >
                                {editingUser ? 'Save Changes' : 'Create User'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingUser(null);
                                    setShowCreateForm(false);
                                }}
                                className="px-6 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg font-medium transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Users Table */}
            <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
                <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                    <h2 className="text-xl font-bold">Users</h2>
                    <button
                        onClick={handleCreate}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                        <span>+</span> Add User
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-900/50">
                            <tr>
                                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Username</th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Name</th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Role</th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Status</th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Created</th>
                                <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {users.map(user => (
                                <tr key={user.id} className="hover:bg-gray-700/30">
                                    <td className="px-4 py-3 font-mono text-sm">{user.username}</td>
                                    <td className="px-4 py-3">{user.name}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${user.role === 'admin'
                                                ? 'bg-purple-500/20 text-purple-300'
                                                : 'bg-blue-500/20 text-blue-300'
                                            }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${user.is_active
                                                ? 'bg-green-500/20 text-green-300'
                                                : 'bg-red-500/20 text-red-300'
                                            }`}>
                                            {user.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-400">
                                        {new Date(user.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => handleEdit(user)}
                                            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 rounded transition-colors mr-2"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(user.id, user.username)}
                                            className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded transition-colors"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        No users found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
