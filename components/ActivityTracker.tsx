'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export function ActivityTracker() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const lastPathRef = useRef(pathname);

    // 1. Log PAGE_VIEW when path changes
    useEffect(() => {
        if (!session?.user?.id) return;

        const logPageView = async () => {
            try {
                await fetch('/api/activity/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: pathname,
                        eventType: 'PAGE_VIEW',
                        visibility: document.visibilityState
                    }),
                });
            } catch (err) { }
        };

        logPageView();
        lastPathRef.current = pathname;
    }, [session?.user?.id, pathname]);

    // 2. Continuous HEARTBEAT timer (doesn't reset on path change)
    useEffect(() => {
        if (!session?.user?.id) return;

        const sendHeartbeat = async () => {
            try {
                await fetch('/api/activity/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: lastPathRef.current,
                        eventType: 'HEARTBEAT',
                        visibility: document.visibilityState
                    }),
                });
            } catch (err) { }
        };

        const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
        return () => clearInterval(interval);
    }, [session?.user?.id]); // Only reset on login/logout

    return null;
}
