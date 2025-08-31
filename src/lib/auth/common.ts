export const runtime = 'nodejs';

import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import crypto from 'crypto';

/**
 * 環境が production かどうかの判定
 * - Cookie の secure オプションなどで利用
 */
const isProd = process.env.NODE_ENV === 'production';

/**
 * Cookie の sameSite 設定
 * - 'lax': 同一サイト内の基本的な動作に安全
 * - 'none': クロスサイトで Cookie を送る場合に必要（HTTPS 必須）
 */
const SAMESITE: 'lax' | 'none' = 'lax';

/**
 * Cookie 名やトークン有効期限の定義
 */
export const COOKIE_ACCESS = 'auth';        // アクセストークン
export const COOKIE_REFRESH = 'refresh';    // リフレッシュトークン
export const COOKIE_CSRF = 'csrf_token';    // CSRF 用トークン
export const ACCESS_TTL_SEC = 15 * 60;      // アクセストークン寿命 = 15分
export const REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // リフレッシュトークン寿命 = 7日

/**
 * JWT 秘密鍵を取得
 * - 環境変数 JWT_SECRET を使用
 */
function getSecret() {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET is not set');
    return new TextEncoder().encode(s);
}

/**
 * 任意の文字列を SHA256 でハッシュ化
 * - セッションIDやリフレッシュトークンの DB 保管時に利用想定
 */
export function hashToken(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * アクセストークン生成
 * - 有効期限: 15分
 * - typ = access
 */
export async function signAccessToken(user: { id: string; email: string }) {
    return await new SignJWT({ sub: user.id, email: user.email, typ: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TTL_SEC}s`)
        .sign(getSecret());
}

/**
 * リフレッシュトークン生成
 * - 有効期限: 7日
 * - typ = refresh, jti = セッションID
 */
export async function signRefreshToken(
    user: { id: string; email: string },
    sessionId: string
) {
    return await new SignJWT({
        sub: user.id,
        email: user.email,
        typ: 'refresh',
        jti: sessionId,
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${REFRESH_TTL_SEC}s`)
        .sign(getSecret());
}

/**
 * アクセストークンを検証
 * - typ が "access" であることを確認
 */
export async function verifyAccess(token: string) {
    const { payload } = await jwtVerify(token, getSecret(), {
        algorithms: ['HS256'],
    });
    if (payload.typ !== 'access') throw new Error('wrong token type');
    return payload as JWTPayload & { email: string };
}

/**
 * リフレッシュトークンを検証
 * - typ が "refresh" であることを確認
 */
export async function verifyRefresh(token: string) {
    const { payload } = await jwtVerify(token, getSecret(), {
        algorithms: ['HS256'],
    });
    if (payload.typ !== 'refresh') throw new Error('wrong token type');
    return payload as JWTPayload & { email: string; jti: string };
}

/**
 * CSRF トークン検証（ダブルサブミットクッキー方式）
 * - Cookie に保存された csrf_token
 * - リクエストヘッダーの X-CSRF-Token
 * 両方を比較し、一致しなければエラー
 */
export async function requireCsrf() {
    const c = await cookies();
    const h = await headers();
    const csrfCookie = c.get(COOKIE_CSRF)?.value ?? '';
    const csrfHeader = h.get('X-CSRF-Token') ?? '';
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        throw new Error('csrf_mismatch');
    }
}

/**
 * Cookie セット用ラッパー（NextResponse 想定）
 * - 各種トークンをレスポンスにセット
 */
export function setAccessCookie(res: NextResponse, token: string) {
    res.cookies.set(COOKIE_ACCESS, token, {
        httpOnly: true,
        secure: isProd,
        sameSite: SAMESITE,
        path: '/',
        maxAge: ACCESS_TTL_SEC,
    });
}

export function setRefreshCookie(res: NextResponse, token: string) {
    res.cookies.set(COOKIE_REFRESH, token, {
        httpOnly: true,
        secure: isProd,
        sameSite: SAMESITE,
        path: '/',
        maxAge: REFRESH_TTL_SEC,
    });
}

export function setCsrfCookie(res: NextResponse, value: string) {
    res.cookies.set(COOKIE_CSRF, value, {
        httpOnly: false, // JSから参照可能にして二重送信チェックに利用
        secure: isProd,
        sameSite: SAMESITE,
        path: '/',
        maxAge: REFRESH_TTL_SEC,
    });
}

/**
 * Cookie 読み取りユーティリティ
 */
export async function readAccessTokenFromCookie() {
    const c = await cookies();
    return c.get(COOKIE_ACCESS)?.value ?? '';
}

export async function readRefreshTokenFromCookie() {
    const c = await cookies();
    return c.get(COOKIE_REFRESH)?.value ?? '';
}

/**
 * 認証関連 Cookie をすべて削除
 * - ログアウト時などに利用
 */
export function clearAllAuthCookies(res: NextResponse) {
    res.cookies.set(COOKIE_ACCESS, '', { path: '/', maxAge: 0 });
    res.cookies.set(COOKIE_REFRESH, '', { path: '/', maxAge: 0 });
    res.cookies.set(COOKIE_CSRF, '', { path: '/', maxAge: 0 });
}
