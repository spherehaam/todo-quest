export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    verifyRefresh, signAccessToken, signRefreshToken,
    readRefreshTokenFromCookie, requireCsrf,
    hashToken, setAccessCookie, setRefreshCookie
} from './common';

export async function handleRefresh() {
    try {
        await requireCsrf();

        const token = await readRefreshTokenFromCookie();
        if (!token) return NextResponse.json({ ok: false, error: 'no_refresh' }, { status: 401 });

        const payload = await verifyRefresh(token);
        const userId = payload.sub as string;
        const sessionId = payload.jti as string;

        const currentHash = hashToken(token);
        const rows = await sql`
            SELECT refresh_hash FROM sessions
            WHERE id = ${sessionId} AND user_id = ${userId}
            LIMIT 1
        ` as { refresh_hash: string }[];

        if (rows.length === 0 || rows[0].refresh_hash !== currentHash) {
            return NextResponse.json({ ok: false, error: 'refresh_invalid' }, { status: 401 });
        }

        // ローテーション
        const access = await signAccessToken({ id: userId, email: payload.email as string });
        const refresh = await signRefreshToken({ id: userId, email: payload.email as string }, sessionId);
        const newHash = hashToken(refresh);

        await sql`
            UPDATE sessions
            SET refresh_hash = ${newHash}, expires_at = now() + interval '7 days'
            WHERE id = ${sessionId}
        `;

        const res = NextResponse.json({ ok: true });
        setAccessCookie(res, access);
        setRefreshCookie(res, refresh);
        return res;
    } catch (e) {
        const status = (e as Error).message === 'csrf_mismatch' ? 403 : 401;
        return NextResponse.json({ ok: false, error: 'refresh_failed' }, { status });
    }
}
