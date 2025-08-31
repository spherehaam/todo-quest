export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sql } from '@/lib/db';
import {
    signAccessToken, signRefreshToken,
    setAccessCookie, setRefreshCookie, setCsrfCookie, hashToken
} from './common';

export async function handleLogin(req: Request) {
    try {
        const { email, password } = await req.json();
        if (!email || !password) {
            return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
        }

        const rows = await sql`
            SELECT id, email, password_hash
            FROM users
            WHERE email = ${email}
            LIMIT 1
        ` as { id: string; email: string; password_hash: string }[];

        if (rows.length === 0) {
            return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
        }

        const user = rows[0];
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
        }

        // セッション仮作成（refresh_hashは後で更新）
        const inserted = await sql`
        INSERT INTO sessions (user_id, refresh_hash, expires_at)
        VALUES (${user.id}, ${'temp'}, now() + interval '7 days')
        RETURNING id
        ` as { id: string }[];
        const sessionId = inserted[0].id;

        const access = await signAccessToken({ id: user.id, email: user.email });
        const refresh = await signRefreshToken({ id: user.id, email: user.email }, sessionId);

        // refresh のハッシュ保存
        const refreshHash = hashToken(refresh);
        await sql`UPDATE sessions SET refresh_hash = ${refreshHash} WHERE id = ${sessionId}`;

        const csrf = crypto.randomUUID();

        const res = NextResponse.json({ ok: true, email: user.email });
        setAccessCookie(res, access);
        setRefreshCookie(res, refresh);
        setCsrfCookie(res, csrf);
        return res;
    } catch (e) {
        console.error(e);
        return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
    }
}
