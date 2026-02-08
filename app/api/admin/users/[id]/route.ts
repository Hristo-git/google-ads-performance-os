import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { updateUser, deleteUser, getUserAllowedAccounts, supabaseAdmin } from '@/lib/supabase';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/admin/users/[id] - Get a specific user
export async function GET(request: NextRequest, { params }: RouteParams) {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data: user, error } = await supabaseAdmin
        .from('gads_users')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const allowedAccountIds = await getUserAllowedAccounts(id);

    // Remove password_hash from response
    const { password_hash, ...safeUser } = user;

    return NextResponse.json({ ...safeUser, allowedAccountIds });
}

// PUT /api/admin/users/[id] - Update a user
export async function PUT(request: NextRequest, { params }: RouteParams) {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        const body = await request.json();

        const { name, email, role, password, is_active } = body;

        const success = await updateUser(id, {
            name,
            email,
            role,
            password,
            is_active
        });

        if (!success) {
            return NextResponse.json(
                { error: 'Failed to update user' },
                { status: 400 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// DELETE /api/admin/users/[id] - Delete a user
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Prevent self-deletion
    if (session.user.id === id) {
        return NextResponse.json(
            { error: 'Cannot delete your own account' },
            { status: 400 }
        );
    }

    const success = await deleteUser(id);

    if (!success) {
        return NextResponse.json(
            { error: 'Failed to delete user' },
            { status: 400 }
        );
    }

    return NextResponse.json({ success: true });
}
