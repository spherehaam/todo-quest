export const runtime = 'nodejs';
// 認証/CSRF依存のAPIは静的キャッシュを避ける
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { readAccessTokenFromCookie, verifyAccess, requireCsrf } from '@/lib/auth/common';

type ProtectedOk = { ok: true; data: string };
type ProtectedErr =
    | { ok: false; error: 'no_auth' }             // トークン未添付
    | { ok: false; error: 'invalid_or_expired' }  // トークン無効/期限切れ
    | { ok: false; error: 'csrf_mismatch' }       // CSRF不一致
    | { ok: false; error: 'internal_error' };     // 想定外

/** 統一JSON応答（no-store を強制） */
function json<T extends object>(body: T, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            Pragma: 'no-cache'
        }
    });
}

/**
 * POST /api/protected の実処理
 * - アクセストークン検証 → CSRF検証 の順でチェック
 * - 401/403/500 を使い分け、UIの遷移判断や表示を簡潔に
 */
export async function handlePostProtected() {
    try {
        // 1) 認証: Cookieからアクセストークンを取得
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return json<ProtectedErr>({ ok: false, error: 'no_auth' }, 401);
        }

        // 2) 検証: 署名/期限/クレームを検証
        try {
            await verifyAccess(token);
        } catch {
            // 署名不正/期限切れなどは 401
            return json<ProtectedErr>({ ok: false, error: 'invalid_or_expired' }, 401);
        }

        // 3) CSRF: フォーム/非GET操作はCSRF検証
        try {
            await requireCsrf();
        } catch (e) {
            // ライブラリ側で 'csrf_mismatch' を投げる想定
            const isCsrf = (e as Error)?.message === 'csrf_mismatch';
            if (isCsrf) {
                return json<ProtectedErr>({ ok: false, error: 'csrf_mismatch' }, 403);
            }
            // 想定外のエラー（ここで 500）
            console.error('[handlePostProtected] CSRF check unexpected error:', e);
            return json<ProtectedErr>({ ok: false, error: 'internal_error' }, 500);
        }

        // 4) 成功
        return json<ProtectedOk>({ ok: true, data: 'secret' }, 200);
    } catch (err) {
        // 想定外のトップレベル例外は 500
        console.error('[handlePostProtected] unexpected error:', err);
        return json<ProtectedErr>({ ok: false, error: 'internal_error' }, 500);
    }
}