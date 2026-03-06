'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds for better resolution

export function ActivityTracker() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!session?.user?.id) return;

        const sendHeartbeat = async () => {
            // Include visibility status to see if they are active or backgrounded
            const visibility = document.visibilityState;

            try {
                await fetch('/api/activity/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: pathname,
                        visibility: visibility // 'visible' or 'hidden'
                    }),
                });
            } catch (err) {
                // Silent fail to avoid polluting console too much
            }
        };

        // Send immediately on mount/path change
        sendHeartbeat();

        // Set up interval
        intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                // Last-second effort to send exit heart-beat? 
                // Mostly handled by pathname change re-triggering sendHeartbeat
            }
        };
    }, [session?.user?.id, pathname]); // Re-run on path change or login status change

    return null; // Invisible component
}
