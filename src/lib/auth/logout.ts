export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readRefreshTokenFromCookie,
    requireCsrf,
    hashToken,
    clearAllAuthCookies,
    verifyRefresh,
} from './common';

/**
 * POST /api/logout ハンドラ
 * - CSRF 検証
 * - refresh トークンがあれば検証→対応するセッション行を削除
 * - Cookie を全削除して完了
 *
 * ※ 処理は変更せず、コメントと整形のみ
 */
export async function handleLogout() {
    // 成否に関わらず同じ成功レスポンスで Cookie を消す
    const finalize = () => {
        const res = NextResponse.json({ ok: true });
        clearAllAuthCookies(res);
        return res;
    };

    try {
        // CSRF 対策（ヘッダ/Origin等の整合性チェック）
        await requireCsrf();

        // Cookie から refresh を取得してセッション失効
        const token = await readRefreshTokenFromCookie();
        if (token) {
            try {
                // refresh JWT の形式/署名を検証
                const payload = await verifyRefresh(token);

                const sessionId = String(payload.jti);
                const h = hashToken(token);

                // セッションは refresh のハッシュで照合（生値は保存しない）
                await sql`
                    DELETE FROM sessions
                    WHERE id = ${sessionId} AND refresh_hash = ${h}
                `;
            } catch {
                // refresh が壊れている/期限切れ等は無視（ログアウトは続行）
            }
        }

        return finalize();
    } catch {
        // CSRF 失敗やその他例外時もクッキーは確実に削除
        return finalize();
    }
}
