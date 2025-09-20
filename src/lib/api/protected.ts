export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
    readAccessTokenFromCookie,
    verifyAccess,
    requireCsrf,
} from '@/lib/auth/common';

/**
 * /api/protected (POST)
 * - 認証済みユーザーのみアクセス可能
 * - CSRF トークン検証も必須
 */
export async function handlePostProtected(): Promise<NextResponse> {
    // 常にキャッシュさせない
    const noStoreHeaders = { 'Cache-Control': 'no-store' as const };

    try {
        // 1. Cookie からアクセストークンを取得
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' as const },
                { status: 401, headers: noStoreHeaders }
            );
        }

        // 2. アクセストークン検証
        await verifyAccess(token);

        // 3. CSRF トークン検証
        await requireCsrf();

        // 4. 認証成功 → 秘密データを返す
        return NextResponse.json(
            { ok: true, data: 'secret' as const },
            { status: 200, headers: noStoreHeaders }
        );
    } catch (err) {
        // エラー内容を文字列化
        const message =
            typeof err === 'object' && err !== null && 'message' in err
                ? String((err as { message?: unknown }).message)
                : '';

        // CSRF 検証エラーかどうか判定
        const isCsrfMismatch = message === 'csrf_mismatch';
        const status = isCsrfMismatch ? 403 : 401;
        const code = isCsrfMismatch ? 'csrf_mismatch' : 'unauthorized';

        return NextResponse.json(
            { ok: false, error: code },
            { status, headers: noStoreHeaders }
        );
    }
}
