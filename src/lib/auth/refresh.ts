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
    setRefreshCookie
} from './common';

/**
 * アクセス/リフレッシュの再発行（Refresh ローテーション）
 *
 * フロー
 * 1) CSRF 検証
 * 2) Refresh JWT を検証（署名/typ/exp/jti/sub）
 * 3) DB セッション行の refresh_hash と一致するか確認（トークン窃取対策）
 * 4) 新しい Access/Refresh を発行（jti=既存セッションIDを継続）し、DB の refresh_hash を新値で更新
 * 5) Cookie を更新して `{ ok: true }` を返却
 *
 * セキュリティ要点
 * - 常に「DB保存はハッシュ、クッキーは生値」。照合はハッシュ一致で行う。
 * - UPDATE でも id + user_id を条件に含め、対象セッションの絞り込みを厳格化。
 * - 返却エラーは情報を最小化（観測可能性を下げる）。
 */
export async function handleRefresh() {
    try {
        // 1) CSRF チェック（失敗時は 403）
        await requireCsrf();

        // 2) クッキーから Refresh を取得（未所持は 401）
        const token = await readRefreshTokenFromCookie();
        if (!token) {
            return NextResponse.json({ ok: false, error: 'no_refresh' }, { status: 401 });
        }

        // 3) Refresh JWT の検証（署名/typ/exp/jti/sub）
        const payload = await verifyRefresh(token);
        const userId = String(payload.sub);
        const sessionId = String(payload.jti);
        // email は JWT 由来。厳密にはDBから再読込が堅牢だが、負荷と要件次第
        const email = String(payload.email ?? '');

        // 4) DB に保存されている refresh_hash と突き合わせて一致検証
        type SessionRow = { refresh_hash: string };
        const rows = (await sql`
            SELECT refresh_hash
            FROM sessions
            WHERE id = ${sessionId} AND user_id = ${userId}
            LIMIT 1
        `) as SessionRow[];

        const currentHash = hashToken(token);
        if (rows.length === 0 || rows[0].refresh_hash !== currentHash) {
            // セッションが見つからない or ハッシュ不一致 → 無効化扱い
            return NextResponse.json({ ok: false, error: 'refresh_invalid' }, { status: 401 });
        }

        // 5) 新しいトークンを発行し、DB の refresh_hash を更新（Refresh ローテーション）
        const access = await signAccessToken({ id: userId, email });
        const refresh = await signRefreshToken({ id: userId, email }, sessionId);
        const newHash = hashToken(refresh);

        await sql`
            UPDATE sessions
            SET refresh_hash = ${newHash}, expires_at = now() + interval '7 days'
            WHERE id = ${sessionId} AND user_id = ${userId}
        `;

        // 6) Cookie を更新して返却
        const res = NextResponse.json({ ok: true });
        setAccessCookie(res, access);
        setRefreshCookie(res, refresh);
        return res;
    } catch (e) {
        // CSRF 失敗は 403、それ以外の失敗は 401 で包括
        const isCsrf = e instanceof Error && e.message === 'csrf_mismatch';
        const status = isCsrf ? 403 : 401;
        return NextResponse.json({ ok: false, error: 'refresh_failed' }, { status });
    }
}
