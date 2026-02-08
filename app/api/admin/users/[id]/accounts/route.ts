import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getUserAllowedAccounts, updateUserAccounts } from '@/lib/supabase';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/admin/users/[id]/accounts - Get user's allowed accounts
export async function GET(request: NextRequest, { params }: RouteParams) {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const accountIds = await getUserAllowedAccounts(id);

    return NextResponse.json({ accountIds });
}

// PUT /api/admin/users/[id]/accounts - Update user's allowed accounts
export async function PUT(request: NextRequest, { params }: RouteParams) {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        const body = await request.json();
        const { accountIds } = body;

        if (!Array.isArray(accountIds)) {
            return NextResponse.json(
                { error: 'accountIds must be an array' },
                { status: 400 }
            );
        }

        const success = await updateUserAccounts(id, accountIds);

        if (!success) {
            return NextResponse.json(
                { error: 'Failed to update user accounts' },
                { status: 400 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating user accounts:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
