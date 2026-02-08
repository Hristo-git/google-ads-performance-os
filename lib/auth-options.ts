import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { getUserByUsername, verifyPassword, getUserAllowedAccounts } from "@/lib/supabase";

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                if (!credentials?.username || !credentials?.password) {
                    return null;
                }

                try {
                    // Get user from Supabase
                    const user = await getUserByUsername(credentials.username);

                    if (!user) return null;

                    // Verify password using Supabase pgcrypto
                    const isValid = await verifyPassword(credentials.password, user.password_hash);

                    if (!isValid) return null;

                    // Get user's allowed accounts
                    const allowedAccountIds = await getUserAllowedAccounts(user.id);

                    return {
                        id: user.id,
                        name: user.name,
                        email: user.email || user.username,
                        role: user.role,
                        allowedCustomerIds: allowedAccountIds
                    };
                } catch (err) {
                    console.error('Auth error:', err);
                    return null;
                }
            }
        }),
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
                params: {
                    scope: "openid email profile https://www.googleapis.com/auth/adwords",
                    access_type: "offline",
                    prompt: "consent",
                },
            },
        }),
    ],
    session: {
        strategy: "jwt",
    },
    pages: {
        signIn: '/login',
    },
    callbacks: {
        async jwt({ token, user, account }) {
            if (user) {
                token.id = user.id;
                // @ts-expect-error - custom user properties
                token.role = user.role;
                // @ts-expect-error - custom user properties
                token.allowedCustomerIds = user.allowedCustomerIds;
            }
            if (account) {
                token.accessToken = account.access_token;
                token.refreshToken = account.refresh_token;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;
                session.user.role = token.role as 'admin' | 'viewer';
                session.user.allowedCustomerIds = token.allowedCustomerIds as string[];
                // @ts-expect-error - adding custom field
                session.accessToken = token.accessToken;
            }
            return session;
        },
    },
};
