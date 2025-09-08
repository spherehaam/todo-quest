export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { readAccessTokenFromCookie, verifyAccess, requireCsrf } from '@/lib/auth/common';

/**
 * /api/protected の POST ハンドラー
 * - アクセストークン（JWT）を Cookie から取得し検証
 * - CSRF トークンを検証
 * - 認証 & CSRF が通れば保護されたリソースを返す
 */
export async function handlePostProtected() {
    try {
        // 1) 認可（JWT）の検証
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' },
                { status: 401 }
            );
        }
        await verifyAccess(token);

        // 2) CSRF 検証
        await requireCsrf();

        // 3) 本来の保護処理（ここでは固定文字列を返却）
        return NextResponse.json({ ok: true, data: 'secret' });
    } catch (e) {
        // CSRF mismatch とそれ以外でステータスを分ける
        const msg =
            (e as Error).message === 'csrf_mismatch'
                ? 'csrf_mismatch'
                : 'unauthorized';
        const status = msg === 'csrf_mismatch' ? 403 : 401;

        return NextResponse.json({ ok: false, error: msg }, { status });
    }
}
