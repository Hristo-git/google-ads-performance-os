import { supabaseAdmin } from "@/lib/supabase";

export type ActivityEventType = 'LOGIN' | 'API_CALL' | 'AI_ANALYSIS' | 'HEARTBEAT' | 'PAGE_VIEW';

export async function logActivity(userId: string, eventType: ActivityEventType, metadata: any = {}) {
    try {
        // Ensure metadata is an object
        const meta = typeof metadata === 'object' ? metadata : { value: metadata };

        const { error } = await supabaseAdmin
            .from('user_activity_logs')
            .insert({
                user_id: userId,
                event_type: eventType,
                metadata: meta,
            });

        if (error) {
            console.error(`[ActivityLogger] Failed to log ${eventType}:`, error);
        } else {
            // console.log(`[ActivityLogger] Logged ${eventType} for user ${userId}`);
        }
    } catch (err) {
        console.error(`[ActivityLogger] Unexpected error logging ${eventType}:`, err);
    }
}
