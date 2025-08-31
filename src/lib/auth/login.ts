export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sql } from '@/lib/db';
import {
    signAccessToken,            // アクセスJWTを生成（短命: 15分）
    signRefreshToken,           // リフレッシュJWTを生成（長命: 7日, jti=セッションID）
    setAccessCookie,            // アクセスJWTを HttpOnly Cookie に設定
    setRefreshCookie,           // リフレッシュJWTを HttpOnly Cookie に設定
    setCsrfCookie,              // CSRFトークンを non-HttpOnly Cookie に設定（ダブルサブミット用）
    hashToken                   // リフレッシュJWTをハッシュ化（DB保存向け）
} from './common';

/** 受信するログインリクエストの型 */
type LoginBody = {
    email?: string;
    password?: string;
};

/**
 * POST /api/login
 * - 資格情報（email, password）を検証
 * - ユーザー存在チェック＆パスワード照合
 * - セッション行（sessions）を作成
 * - アクセス/リフレッシュJWT発行、Cookie へ設定
 * - CSRFトークンを発行し Cookie に設定（ダブルサブミット方式用）
 */
export async function handleLogin(req: Request) {
    try {
        // 1) 入力パース & バリデーション
        let body: LoginBody = {};
        try {
            body = (await req.json()) as LoginBody;
        } catch {
            return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
        }

        const email = (body.email ?? '').trim();
        const password = body.password ?? '';
        if (!email || !password) {
            return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
        }

        // 2) ユーザー検索（メールアドレスはユニーク前提）
        //    - Neon の tagged template は any[] 推論になるため、明示的に型アサーション
        const rows = await sql`
            SELECT id, email, password_hash
            FROM users
            WHERE email = ${email}
            LIMIT 1
        ` as { id: string; email: string; password_hash: string }[];

        if (rows.length === 0) {
            // ユーザーを特定させないため、存在/不一致は同じエラーを返す
            return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
        }

        const user = rows[0];

        // 3) パスワード照合（bcrypt）
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
        }

        // 4) セッション作成（まずプレースホルダで作り、あとで refresh_hash を更新）
        //    - 期限管理: DB側の expires_at でガベコレ可能
        const inserted = await sql`
            INSERT INTO sessions (user_id, refresh_hash, expires_at)
            VALUES (${user.id}, ${'temp'}, now() + interval '7 days')
            RETURNING id
        ` as { id: string }[];
        const sessionId = inserted[0].id;

        // 5) JWT 発行（アクセス & リフレッシュ）
        //    - リフレッシュJWTには jti として sessionId を格納
        const access = await signAccessToken({ id: user.id, email: user.email });
        const refresh = await signRefreshToken({ id: user.id, email: user.email }, sessionId);

        // 6) リフレッシュJWTのハッシュをDBへ保存（盗難対策）
        const refreshHash = hashToken(refresh);
        await sql`
            UPDATE sessions
            SET refresh_hash = ${refreshHash}
            WHERE id = ${sessionId}
        `;

        // 7) CSRFトークン発行（ダブルサブミット用）
        const csrf = crypto.randomUUID();

        // 8) レスポンス作成 & Cookie 設定
        //    - アクセスJWT: HttpOnly / 短寿命
        //    - リフレッシュJWT: HttpOnly / 長寿命
        //    - CSRF: non-HttpOnly（JSから読み取り、X-CSRF-Token ヘッダに載せる）
        const res = NextResponse.json({ ok: true, email: user.email });
        setAccessCookie(res, access);
        setRefreshCookie(res, refresh);
        setCsrfCookie(res, csrf);

        return res;
    } catch (e) {
        // 予期しないエラーは 500
        console.error(e);
        return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
    }
}
