export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readAccessTokenFromCookie,
    verifyAccess,
} from '@/lib/auth/common';

/**
 * users テーブルに対応する型
 * - 既存フロントが配列で受ける前提（users: Users[]）のため型名はそのままに
 */
type Users = {
    id: string;
    username: string;
    level: number;
    exp: number;
};

/** 認証系の応答はキャッシュさせない */
const NO_STORE = { 'Cache-Control': 'no-store' as const };

/**
 * ログイン中ユーザー（1件）を取得
 * - フロント互換のため配列で返す（0 or 1 要素）
 */
async function dbGetUsers(userId: string): Promise<Users[]> {

    const rows = await sql`
        SELECT id, username, level, exp
        FROM users
        WHERE id = ${userId}
        LIMIT 1
    `;
    return rows as Users[];
}

/**
 * GET /api/users
 * - 認証済みユーザー自身のレコード（最大1件）を配列で返す
 */
export async function handleGetUsers() {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' },
                { status: 401, headers: NO_STORE }
            );
        }
        const payload = await verifyAccess(token);

        const users = await dbGetUsers(String(payload.sub));
        return NextResponse.json(
            { ok: true, users },
            { status: 200, headers: NO_STORE }
        );
    } catch (e) {
        // if (process.env.NODE_ENV === 'development') console.error('handleGetUsers failed:', e);
        return NextResponse.json(
            { ok: false, error: 'failed_to_fetch' },
            { status: 500, headers: NO_STORE }
        );
    }
}

/**
 * POST /api/users
 * - 現状未サポート。将来的にプロフィール更新等を実装する場合はここに追加
 * - 明示的に 405 を返す（Allow ヘッダを付与）
 */
export async function handlePostUsers(_req: Request) {
    return NextResponse.json(
        { ok: false, error: 'method_not_allowed' },
        {
            status: 405,
            headers: {
                ...NO_STORE,
                Allow: 'GET',
            },
        }
    );
}
