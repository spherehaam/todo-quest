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
    hashToken
} from './common';

type LoginBody = {
    email?: string;
    password?: string;
};

/**
 * ログイン処理
 * 1) 入力バリデーション
 * 2) ユーザー検索（メール一致）
 * 3) パスワード照合（bcrypt）
 * 4) セッション行を作成して ID を取得
 * 5) リフレッシュトークン作成（jti = セッションID）、ハッシュをDB保存
 * 6) アクセス/リフレッシュ/CSRF の各Cookieをセット
 * 7) 結果を返却
 *
 * ※ エラーレスポンスはユーザー列挙対策のため極力同一メッセージ/コードに統一
 */
export async function handleLogin(req: Request) {
    try {
        // --- 入力のパースと軽いバリデーション ---
        let body: LoginBody;
        try {
            body = (await req.json()) as LoginBody;
        } catch {
            return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
        }

        // メールは大文字/空白を正規化（DBがCITEXTでない場合の一致性担保）
        const email = (body.email ?? '').trim().toLowerCase();
        const password = body.password ?? '';

        if (!email || !password) {
            return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
        }

        // --- ユーザーの取得 ---
        type UserRow = { id: string; email: string; password_hash: string };
        const rows = (await sql`
            SELECT id, email, password_hash
            FROM users
            WHERE LOWER(email) = ${email}
            LIMIT 1
        `) as UserRow[];

        // 同一メッセージにすることでユーザー列挙を抑止
        if (rows.length === 0) {
            return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
        }

        const user = rows[0];

        // --- パスワード照合 ---
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
        }

        // --- セッション作成 & トークン発行 ---
        type InsertedRow = { id: string };
        const inserted = (await sql`
            INSERT INTO sessions (user_id, refresh_hash, expires_at)
            VALUES (${user.id}, ${'temp'}, now() + interval '7 days')
            RETURNING id
        `) as InsertedRow[];

        const sessionId = inserted[0].id;

        // Step2: Access/Refresh トークンを発行
        const access = await signAccessToken({ id: user.id, email: user.email });
        const refresh = await signRefreshToken({ id: user.id, email: user.email }, sessionId);

        // Step3: refresh のハッシュを保存
        const refreshHash = hashToken(refresh);
        await sql`
            UPDATE sessions
            SET refresh_hash = ${refreshHash}
            WHERE id = ${sessionId}
        `;

        // CSRFトークン生成（32バイトランダム値）
        const csrf = crypto.randomBytes(32).toString('hex');

        // --- Cookie セット & レスポンス ---
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
