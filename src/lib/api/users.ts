export const runtime = 'nodejs';
// 認証状態に依存するためキャッシュ禁止
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readAccessTokenFromCookie,
    verifyAccess,
} from '@/lib/auth/common';

/** 共通JSON応答（キャッシュ禁止を徹底） */
function json<T extends object>(body: T, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            Pragma: 'no-cache',
        },
    });
}

/** 単一ユーザー。テーブル構造上のフィールドだけを明示 */
type User = {
    id: string;
    username: string;
    level: number;
    exp: number;
};

/**
 * 自ユーザーの情報を1件取得
 * - 認証情報の sub（=userId）に紐づくレコードのみ返す
 * - LIMIT 1 で意図を明確化
 */
async function dbGetUserById(userId: string): Promise<User | null> {
    const rows = await sql/*sql*/`
        SELECT id, username, level, exp
        FROM users
        WHERE id = ${userId}
        LIMIT 1
    `;
    return (rows?.[0] as User) ?? null;
}

/**
 * GET /api/users
 * - ログイン中のユーザー情報のみ返す
 * - 互換性のため配列で返却（既存UIが users[] 前提の場合に配慮）
 */
export async function handleGetUsers() {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return json({ ok: false as const, error: 'no_auth' as const }, 401);
        }

        const payload = await verifyAccess(token);
        const meId = String(payload.sub);

        const user = await dbGetUserById(meId);
        if (!user) {
            // 認証は通るがレコードが無いケース（初期化漏れなど）
            return json({ ok: true as const, users: [] as User[] }, 200);
        }

        // 互換のため配列で返す
        return json({ ok: true as const, users: [user] as User[] }, 200);
    } catch (err) {
        console.error('[handleGetUsers] unexpected:', err);
        return json({ ok: false as const, error: 'failed_to_fetch' as const }, 500);
    }
}

/**
 * POST /api/users
 * - 本APIでは未サポートを明示（クライアント側の分岐が楽）
 * - 将来、プロフィール更新などを実装する場合はここに CSRF/バリデーションを追加
 */
export async function handlePostUsers(_req: Request) {
    return json({ ok: false as const, error: 'method_not_allowed' as const }, 405);
}