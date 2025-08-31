export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readRefreshTokenFromCookie, requireCsrf,
    hashToken, clearAllAuthCookies, verifyRefresh
} from './common';

export async function handleLogout() {
    try {
        await requireCsrf();

        const token = await readRefreshTokenFromCookie();
        if (token) {
            try {
                const payload = await verifyRefresh(token);
                const sessionId = payload.jti as string;
                const h = hashToken(token);
                await sql`DELETE FROM sessions WHERE id = ${sessionId} AND refresh_hash = ${h}`;
            } catch {
                // 検証失敗でもCookieは消す
            }
        }

        const res = NextResponse.json({ ok: true });
        await clearAllAuthCookies(res);
        return res;
    } catch {
        const res = NextResponse.json({ ok: true });
        await clearAllAuthCookies(res);
        return res;
    }
}
