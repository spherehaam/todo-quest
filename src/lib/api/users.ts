export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readAccessTokenFromCookie,
    verifyAccess,
} from '@/lib/auth/common';

type Users = {
    id: string;
    username: string;
    level: number;
    exp: number;
};

async function dbGetUsers(userId: string): Promise<Users[]> {
    console.log('userId123:', userId);

    const rows = await sql`
        SELECT id, username, level, exp
        FROM users
        WHERE id = ${userId}
    `;
    return rows as Users[];
}

export async function handleGetUsers() {
    try {
        // アクセストークンをCookieから取得
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' },
                { status: 401 }
            );
        }
        const payload = await verifyAccess(token);

        // DBからユーザー情報を取得
        const users = await dbGetUsers(String(payload.sub));
        return NextResponse.json({ ok: true, users });
    } catch {
        return NextResponse.json(
            { ok: false, error: 'failed_to_fetch' },
            { status: 500 }
        );
    }
}

export async function handlePostUsers(req: Request) {

}
