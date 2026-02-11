'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';

const HEARTBEAT_INTERVAL = 60000; // 60 seconds

export function ActivityTracker() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!session?.user) return;

        const sendHeartbeat = async () => {
            if (document.visibilityState === 'hidden') return; // Don't track if tab is hidden

            try {
                await fetch('/api/activity/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: pathname }),
                });
            } catch (err) {
                console.error('Failed to send heartbeat', err);
            }
        };

        // Send immediately on mount/path change
        sendHeartbeat();

        // Set up interval
        intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [session?.user, pathname]); // Re-run on path change or login

    return null; // Invisible component
}
