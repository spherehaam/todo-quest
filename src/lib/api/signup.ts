export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';

/** キャッシュ無効化ヘッダ（認証系は常に no-store） */
const NO_STORE = { 'Cache-Control': 'no-store' as const };

/** SELECT users 重複チェック用の行型 */
type DupUserRow = {
    email: string;
    username: string;
};

/** avatars / titles 取得用の行型 */
type IdRow = {
    id: string;
};

/** INSERT 後に返すユーザー行 */
type InsertedUser = {
    id: string;
    email: string;
    username: string;
    level: number;
    exp: number;
    avatar_id: string | null;
    title_id: string | null;
    created_at: string;
    updated_at: string;
};

async function duplicationCheck(email: string, username: string): Promise<void> {
    const rows = (await sql`
        SELECT email, username
        FROM users
        WHERE email = ${email} OR username = ${username}
    `) as DupUserRow[];

    if (rows.length > 0) {
        const hasEmail = rows.some((r) => r.email === email);
        const hasUsername = rows.some((r) => r.username === username);
        const code = hasEmail ? (hasUsername ? 'email_and_username_taken' : 'email_taken') : 'username_taken';
        throw Object.assign(new Error(code), { status: 409 as const });
    }
}

async function getAvatarIdByName(name: string): Promise<string> {
    const rows = (await sql`
        SELECT id FROM avatars WHERE name = ${name} LIMIT 1
    `) as IdRow[];

    if (rows.length === 0) {
        throw Object.assign(new Error(`avatar_not_found: ${name}`), { status: 500 as const });
    }
    return rows[0].id;
}

async function getTitleIdByName(name: string): Promise<string> {
    const rows = (await sql`
        SELECT id FROM titles WHERE name = ${name} LIMIT 1
    `) as IdRow[];

    if (rows.length === 0) {
        throw Object.assign(new Error(`title_not_found: ${name}`), { status: 500 as const });
    }
    return rows[0].id;
}

async function insertUser(params: {
    email: string;
    username: string;
    passwordHash: string;
    avatarId: string;
    titleId: string;
}): Promise<InsertedUser> {
    const { email, username, passwordHash, avatarId, titleId } = params;

    const rows = (await sql`
        INSERT INTO users (
            email,
            username,
            password_hash,
            stripe_customer_id,
            level,
            exp,
            avatar_id,
            title_id
        ) VALUES (
            ${email},
            ${username},
            ${passwordHash},
            NULL,
            DEFAULT,
            DEFAULT,
            ${avatarId}::uuid,
            ${titleId}::uuid
        )
        RETURNING
            id, email, username, level, exp, avatar_id, title_id, created_at, updated_at
    `) as InsertedUser[];

    return rows[0];
}

export async function handlePostSignup(req: Request) {
    type Body = {
        email?: string;
        username?: string;
        password?: string;
    };

    let body: Body = {};
    try {
        body = (await req.json()) as Body;
    } catch {
        body = {};
    }

    const email = String(body.email ?? '').trim().toLowerCase();
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');

    await duplicationCheck(email, username);

    const passwordHash = await bcrypt.hash(password, 12);

    const avatarId = await getAvatarIdByName('Starter Hat');
    const titleId = await getTitleIdByName('Beginner');

    const insert = await insertUser({ email, username, passwordHash, avatarId, titleId });

    return NextResponse.json({ ok: true, insert }, { status: 201, headers: NO_STORE });
}