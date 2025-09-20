export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readAccessTokenFromCookie,
    verifyAccess,
} from '@/lib/auth/common';

/** Users テーブルの最小スキーマ */
type Users = {
    id: string;
    username: string;
    level: number;
    exp: number;
};

/** 認証系レスポンスはキャッシュさせない */
const NO_STORE = { 'Cache-Control': 'no-store' as const };

/**
 * DB から特定ユーザーを取得
 * - id をキーに1件だけ返す
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
 * GET /api/users 用ハンドラ
 * - 認証トークンを検証
 * - ユーザー情報を返す
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

        // アクセストークンを検証してユーザーIDを取得
        const payload = await verifyAccess(token);

        // DB からユーザー情報を取得
        const users = await dbGetUsers(String(payload.sub));

        return NextResponse.json(
            { ok: true, users },
            { status: 200, headers: NO_STORE }
        );
    } catch {
        // 想定外エラーは 500
        return NextResponse.json(
            { ok: false, error: 'failed_to_fetch' },
            { status: 500, headers: NO_STORE }
        );
    }
}

/**
 * POST /api/users 用ハンドラ
 * - まだ未実装のため 501 を返す
 */
export async function handlePostUsers(req: Request) {
    void req; // 未使用パラメータ警告を抑制

    return NextResponse.json(
        { ok: false, error: 'not_implemented' },
        { status: 501 }
    );
}
