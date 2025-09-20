export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    verifyRefresh,
    signAccessToken,
    signRefreshToken,
    readRefreshTokenFromCookie,
    requireCsrf,
    hashToken,
    setAccessCookie,
    setRefreshCookie,
} from './common';

/**
 * POST /api/refresh ハンドラ
 * 1) CSRF 検証（Cookie/Header/Origin/Referer）
 * 2) Cookie から refresh を読み取り & JWT 検証
 * 3) DB 上のセッションと refresh ハッシュの一致確認
 * 4) access を再発行 / refresh はローテーション（ハッシュ更新・期限延長）
 * 5) Cookie を再設定して 200 を返す
 *
 * ※ 処理内容はそのまま。コメントと整形のみ。
 */
export async function handleRefresh() {
    try {
        // --- 1) CSRF 検証 ---
        await requireCsrf();

        // --- 2) refresh を Cookie から取得 & 署名/typ 検証 ---
        const token = await readRefreshTokenFromCookie();
        if (!token) {
            return NextResponse.json({ ok: false, error: 'no_refresh' }, { status: 401 });
        }

        const payload = await verifyRefresh(token);
        const userId = String(payload.sub);
        const sessionId = String(payload.jti);
        const email = String(payload.email ?? '');

        // --- 3) セッション整合性チェック（DB のハッシュと一致するか） ---
        type SessionRow = { refresh_hash: string };
        const rows = (await sql`
            SELECT refresh_hash
            FROM sessions
            WHERE id = ${sessionId} AND user_id = ${userId}
            LIMIT 1
        `) as SessionRow[];

        const currentHash = hashToken(token);
        if (rows.length === 0 || rows[0].refresh_hash !== currentHash) {
            return NextResponse.json({ ok: false, error: 'refresh_invalid' }, { status: 401 });
        }

        // --- 4) トークン再発行（access 再発行 / refresh ローテーション） ---
        const access = await signAccessToken({ id: userId, email });
        const refresh = await signRefreshToken({ id: userId, email }, sessionId);
        const newHash = hashToken(refresh);

        await sql`
            UPDATE sessions
            SET refresh_hash = ${newHash}, expires_at = now() + interval '7 days'
            WHERE id = ${sessionId} AND user_id = ${userId}
        `;

        // --- 5) Cookie 再設定 → 成功レスポンス ---
        const res = NextResponse.json({ ok: true });
        setAccessCookie(res, access);
        setRefreshCookie(res, refresh);
        return res;
    } catch (e) {
        // CSRF 失敗は 403、それ以外は 401（一般化された失敗応答）
        const isCsrf = e instanceof Error && e.message === 'csrf_mismatch';
        const status = isCsrf ? 403 : 401;
        return NextResponse.json({ ok: false, error: 'refresh_failed' }, { status });
    }
}
