export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readRefreshTokenFromCookie,
    requireCsrf,
    hashToken,
    clearAllAuthCookies,
    verifyRefresh
} from './common';

/**
 * ログアウト
 * - CSRF を検証（失敗しても最終的にクッキーは消す → UX重視/Idempotent）
 * - refresh クッキーがあれば検証→セッションレコードを削除（ハッシュ一致で安全に）
 * - いつでも最終的に全認証クッキーを削除して `{ ok: true }` を返す
 *
 * セキュリティ方針:
 * - トークンが不正/期限切れでも「成功」とする（存在の有無を示さない＝列挙対策）
 * - DBの削除は `id` + `refresh_hash` の一致で限定（セッションのなりすまし防止）
 */
export async function handleLogout() {
    // レスポンスをまとめて返す小さなヘルパー
    const finalize = () => {
        const res = NextResponse.json({ ok: true });
        clearAllAuthCookies(res); // アクセス/リフレッシュ/CSRFの各クッキーを必ず削除
        return res;
    };

    try {
        // 1) CSRF チェック（失敗しても最終的にはクッキー削除して ok で返す）
        await requireCsrf();

        // 2) refresh クッキーがあれば、そのセッションを失効させる
        const token = await readRefreshTokenFromCookie();
        if (token) {
            try {
                // refresh の署名・期限・typ を検証（payload 取得）
                const payload = await verifyRefresh(token);

                // jti をセッションIDとして使用している前提
                const sessionId = String(payload.jti);
                const h = hashToken(token);

                // 同一ユーザーの他セッションを壊さないように、ID とハッシュでピンポイント削除
                await sql`
                    DELETE FROM sessions
                    WHERE id = ${sessionId} AND refresh_hash = ${h}
                `;
            } catch {
                // - 検証失敗（失効/改ざん/フォーマット不正など）
                // - DBエラー
                // いずれもユーザーには知らせず、最後にクッキーを削除して成功を返す
            }
        }

        // 3) 最終的にクッキーを削除して成功
        return finalize();
    } catch {
        // CSRF 検証や上位の例外があっても、クッキーは常に削除して成功レスポンス
        return finalize();
    }
}
