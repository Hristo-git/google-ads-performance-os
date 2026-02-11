"use client";

import { SessionProvider } from "next-auth/react";

import { ActivityTracker } from "./ActivityTracker";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider refetchOnWindowFocus={false}>
            <ActivityTracker />
            {children}
        </SessionProvider>
    );
}
