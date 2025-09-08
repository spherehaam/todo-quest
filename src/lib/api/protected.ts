export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { readAccessTokenFromCookie, verifyAccess, requireCsrf } from '@/lib/auth/common';

/**
 * 保護API（POST）
 * - 認証クッキーからアクセストークンを取得 → 検証
 * - CSRFトークン検証（ヘッダ 'X-CSRF-Token' を想定）
 * - 成功時: { ok: true, data: 'secret' }
 * - 失敗時: 'csrf_mismatch' は 403、それ以外は 401
 * - センシティブな応答につき Cache-Control: no-store を明示
 */
export async function handlePostProtected(): Promise<NextResponse> {
    // すべてのレスポンスに付与する共通ヘッダ
    const noStoreHeaders = { 'Cache-Control': 'no-store' as const };

    try {
        // 1) 認証トークン
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' as const },
                { status: 401, headers: noStoreHeaders }
            );
        }

        // 2) アクセストークン検証（失効・改ざん時は例外）
        await verifyAccess(token);

        // 3) CSRF 検証（不一致時は 'csrf_mismatch' を投げる想定）
        await requireCsrf();

        // 4) 成功レスポンス
        return NextResponse.json(
            { ok: true, data: 'secret' as const },
            { status: 200, headers: noStoreHeaders }
        );
    } catch (err) {
        // 例外から安全に message を抽出（非 Error オブジェクトにも耐性）
        const message =
            typeof err === 'object' && err !== null && 'message' in err
                ? String((err as { message?: unknown }).message)
                : '';

        const isCsrfMismatch = message === 'csrf_mismatch';
        const status = isCsrfMismatch ? 403 : 401;
        const code = (isCsrfMismatch ? 'csrf_mismatch' : 'unauthorized');

        return NextResponse.json(
            { ok: false, error: code },
            { status, headers: noStoreHeaders }
        );
    }
}
