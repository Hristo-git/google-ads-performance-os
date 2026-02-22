/**
 * config/users.ts — LEGACY FILE, NOT USED BY AUTH
 *
 * Authentication is handled by Supabase (lib/supabase.ts + lib/auth-options.ts).
 * User records live in the `gads_users` table with bcrypt-hashed passwords
 * verified via the `verify_password` Supabase RPC function.
 *
 * This file is retained only as a type reference. Do NOT add credentials here.
 * To create users, use the Admin panel (/admin) or the Supabase dashboard.
 */

export interface User {
    id: string;
    name: string;
    username: string;
    role: 'admin' | 'viewer';
    allowedCustomerIds: string[]; // '*' for all, or specific account IDs
}

// No hardcoded users. Manage users via the Admin panel or Supabase dashboard.
export const users: User[] = [];

/** @deprecated Use Supabase auth — this function is no longer called by the auth flow */
export function getUser(_username: string): User | undefined {
    return undefined;
}
