export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    verifyRefresh,          // refresh JWT の署名・期限・typ=refresh を検証
    signAccessToken,        // 新しい access JWT を発行
    signRefreshToken,       // 新しい refresh JWT を発行（同一セッション jti を維持）
    readRefreshTokenFromCookie, // HttpOnly Cookie から refresh JWT を読む
    requireCsrf,            // ダブルサブミットで CSRF 検証（変更系 API なので必須）
    hashToken,              // JWT を SHA-256 でハッシュ化（DB 照合用）
    setAccessCookie,        // access Cookie をセット
    setRefreshCookie        // refresh Cookie をセット
} from './common';

/**
 * POST /api/refresh
 *
 * 目的:
 * - 既存の refresh JWT を検証し、access/refresh をローテーションして更新する
 * - セッション固定（jti=セッションID）は保持しつつ、refresh の実体は都度更新
 *
 * セキュリティ:
 * - CSRF 必須（Cookie ベースの変更系 API のため）
 * - DB 側には refresh のハッシュのみ保存し、実体は保存しない（漏えい耐性）
 * - DB に保存されたハッシュと一致する場合のみローテーション（盗難対策）
 */
export async function handleRefresh() {
    try {
        // 1) 変更系エンドポイントなので CSRF を先に検証
        await requireCsrf();

        // 2) Cookie から refresh JWT を取得（HttpOnly）
        const token = await readRefreshTokenFromCookie();
        if (!token) {
            return NextResponse.json({ ok: false, error: 'no_refresh' }, { status: 401 });
        }

        // 3) refresh JWT の署名・期限・typ=refresh を検証
        const payload = await verifyRefresh(token);
        const userId = String(payload.sub);
        const sessionId = String(payload.jti);
        const email = String(payload.email ?? '');

        // 4) DB のセッション行と突き合わせ（ハッシュ一致が必須）
        const currentHash = hashToken(token);
        const rows = await sql`
            SELECT refresh_hash
            FROM sessions
            WHERE id = ${sessionId} AND user_id = ${userId}
            LIMIT 1
        ` as { refresh_hash: string }[];

        if (rows.length === 0 || rows[0].refresh_hash !== currentHash) {
            // セッションが存在しない or すでにローテーション済み／不一致
            return NextResponse.json({ ok: false, error: 'refresh_invalid' }, { status: 401 });
        }

        // 5) アクセス/リフレッシュをローテーション発行
        //    - jti（= sessionId）は固定のまま
        const access = await signAccessToken({ id: userId, email });
        const refresh = await signRefreshToken({ id: userId, email }, sessionId);
        const newHash = hashToken(refresh);

        // 6) DB のハッシュを新しい値に更新（ワンタイム的に前の refresh は無効化）
        await sql`
            UPDATE sessions
            SET refresh_hash = ${newHash}, expires_at = now() + interval '7 days'
            WHERE id = ${sessionId}
        `;

        // 7) Cookie を差し替え（クライアント側有効化）
        const res = NextResponse.json({ ok: true });
        setAccessCookie(res, access);
        setRefreshCookie(res, refresh);
        return res;
    } catch (e) {
        // CSRF 失敗は 403、それ以外（検証失敗など）は 401 に寄せる
        const status = (e as Error).message === 'csrf_mismatch' ? 403 : 401;
        return NextResponse.json({ ok: false, error: 'refresh_failed' }, { status });
    }
}
