export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sql } from '@/lib/db';
import {
    signAccessToken,
    signRefreshToken,
    setAccessCookie,
    setRefreshCookie,
    setCsrfCookie,
    hashToken,
} from './common';

/**
 * ログイン API リクエストボディ
 */
type LoginBody = {
    email?: string;
    password?: string;
};

/**
 * POST /api/login ハンドラ
 * 1) JSON ボディの検証
 * 2) ユーザー検索（メールアドレスは小文字に正規化）
 * 3) パスワードハッシュ検証（bcrypt）
 * 4) セッション作成（refresh トークンのハッシュを保存）
 * 5) アクセス/リフレッシュ/CSRF の各 Cookie を設定
 *
 * ※ 処理内容は変更せず、コメントと整形のみ
 */
export async function handleLogin(req: Request) {
    try {
        // --- 1) JSON ボディの検証 ---
        let body: LoginBody;
        try {
            body = (await req.json()) as LoginBody;
        } catch {
            return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
        }

        const email = (body.email ?? '').trim().toLowerCase();
        const password = body.password ?? '';

        if (!email || !password) {
            return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
        }

        // --- 2) ユーザー検索 ---
        type UserRow = { id: string; email: string; password_hash: string };
        const rows = (await sql`
            SELECT id, email, password_hash
            FROM users
            WHERE LOWER(email) = ${email}
            LIMIT 1
        `) as UserRow[];

        if (rows.length === 0) {
            return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
        }

        const user = rows[0];

        // --- 3) パスワードハッシュ検証 ---
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
        }

        // --- 4) セッション作成 ---
        // ひとまず仮の refresh_hash='temp' で行を作成→トークン生成後にハッシュ更新
        type InsertedRow = { id: string };
        const inserted = (await sql`
            INSERT INTO sessions (user_id, refresh_hash, expires_at)
            VALUES (${user.id}, ${'temp'}, now() + interval '7 days')
            RETURNING id
        `) as InsertedRow[];

        const sessionId = inserted[0].id;

        // JWT を発行（access/refresh）
        const access = await signAccessToken({ id: user.id, email: user.email });
        const refresh = await signRefreshToken({ id: user.id, email: user.email }, sessionId);

        // refresh のハッシュを DB に保存
        const refreshHash = hashToken(refresh);
        await sql`
            UPDATE sessions
            SET refresh_hash = ${refreshHash}
            WHERE id = ${sessionId}
        `;

        // CSRF トークンは 32byte ランダム（16進）
        const csrf = crypto.randomBytes(32).toString('hex');

        // --- 5) Cookie 設定 & 成功レスポンス ---
        const res = NextResponse.json({ ok: true, email: user.email });
        setAccessCookie(res, access);
        setRefreshCookie(res, refresh);
        setCsrfCookie(res, csrf);

        return res;
    } catch (err) {
        console.error('[handleLogin] unexpected error:', err);
        return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
    }
}
