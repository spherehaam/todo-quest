export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readRefreshTokenFromCookie,   // Cookie から refresh JWT を読む（HttpOnly）
    requireCsrf,                  // ダブルサブミット方式で CSRF 検証
    hashToken,                    // JWT を SHA-256 でハッシュ化（DB照合用）
    clearAllAuthCookies,          // アクセス/リフレッシュ/CSRF Cookie を削除
    verifyRefresh                 // refresh JWT の署名・期限・typ=refresh を検証
} from './common';

/**
 * POST /api/logout
 *
 * 目的:
 * - CSRF を検証（変更系 API のため必須）
 * - refresh JWT が正当であれば、そのセッション行を DB から削除（サーバー側無効化）
 * - いずれの場合でもクライアント側の Cookie は消す（クライアント無効化）
 *
 * 振る舞い:
 * - CSRF 失敗・トークン検証失敗でも 200 を返して Cookie を削除（ログアウトは冪等）
 *   → 攻撃者に「当たり/外れ」のヒントを与えないための実務的挙動
 */
export async function handleLogout() {
    try {
        // 1) 変更系エンドポイントなので CSRF を必須にする
        await requireCsrf();

        // 2) Cookie に refresh があれば、可能ならサーバー側セッションも無効化する
        const token = await readRefreshTokenFromCookie();
        if (token) {
            try {
                // refresh の署名・期限・typ を検証
                const payload = await verifyRefresh(token);

                // jti（= sessionId）を取り出し、DB のセッション行を削除
                const sessionId = String(payload.jti);
                const h = hashToken(token);
                await sql`
                    DELETE FROM sessions
                    WHERE id = ${sessionId} AND refresh_hash = ${h}
                `;
            } catch {
                // refresh が壊れている / 期限切れ などの場合は
                // DB 側では何もしない（後で Cookie は必ず消す）
            }
        }

        // 3) クライアント側の Cookie を削除（ここが最重要）
        const res = NextResponse.json({ ok: true });
        clearAllAuthCookies(res); // 同期処理なので await 不要
        return res;
    } catch {
        // CSRF 失敗などでも、ログアウトは冪等に成功扱いで Cookie を消す
        const res = NextResponse.json({ ok: true });
        clearAllAuthCookies(res);
        return res;
    }
}
