export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { readAccessTokenFromCookie, verifyAccess } from '@/lib/auth/common';

/**
 * /api/me の GET ハンドラー
 * - Cookie からアクセストークンを取得
 * - JWT 検証
 * - 成功時は email を返却
 * - 未ログイン or 無効トークンの場合は 401 を返却
 */
export async function handleGetMe() {
    try {
        // Cookie からアクセストークンを読む
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' },
                { status: 401 }
            );
        }

        // JWT 検証
        const payload = await verifyAccess(token);

        // 認証成功 → email を返す
        return NextResponse.json({ ok: true, id: payload.sub, email: payload.email });
    } catch {
        // 検証失敗 → エラーを返す
        return NextResponse.json(
            { ok: false, error: 'invalid_or_expired' },
            { status: 401 }
        );
    }
}
