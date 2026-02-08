import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAllUsers, createUser, GadsUser } from '@/lib/supabase';

// GET /api/admin/users - List all users
export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getAllUsers();

    // Remove password_hash from response
    const safeUsers = users.map(({ password_hash, ...user }) => user);

    return NextResponse.json(safeUsers);
}

// POST /api/admin/users - Create a new user
export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();

        const { username, password, name, email, role, allowedAccountIds } = body;

        if (!username || !password || !name || !role) {
            return NextResponse.json(
                { error: 'Missing required fields: username, password, name, role' },
                { status: 400 }
            );
        }

        try {
            const user = await createUser({
                username,
                password,
                name,
                email,
                role,
                allowedAccountIds: allowedAccountIds || []
            });

            // Remove password_hash from response
            const { password_hash, ...safeUser } = user;

            return NextResponse.json(safeUser, { status: 201 });
        } catch (error: any) {
            console.error('Error creating user:', error);
            return NextResponse.json(
                { error: error.message || 'Failed to create user' },
                { status: 400 }
            );
        }
    } catch (error) {
        console.error('Critical error in POST /api/admin/users:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
