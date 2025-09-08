export const runtime = 'nodejs';

import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import crypto from 'crypto';

/** 本番判定（HTTPS 前提の挙動に関与） */
const isProd = process.env.NODE_ENV === 'production';

/**
 * SameSite 設定
 * - 'none' を使うなら Secure=true が必須（ブラウザが Set-Cookie を黙殺する）
 * - デフォルトは lax（通常のフォーム/リンク遷移は送信されるが、クロスサイトはブロック）
 */
const SAMESITE: 'lax' | 'none' = 'lax';

export const COOKIE_ACCESS = 'auth';
export const COOKIE_REFRESH = 'refresh';
export const COOKIE_CSRF = 'csrf_token';

/** 有効期限（秒） */
export const ACCESS_TTL_SEC = 15 * 60; // 15 minutes
export const REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

/** JWT 秘密鍵を取得（未設定は起動時エラーに） */
function getSecret() {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET is not set');
    return new TextEncoder().encode(s);
}

/** 任意トークンをDB等で持つ場合のハッシュ化（可逆でない） */
export function hashToken(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

/** アクセストークン発行（短命） */
export async function signAccessToken(user: { id: string; email: string }) {
    return await new SignJWT({ sub: user.id, email: user.email, typ: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TTL_SEC}s`)
        .sign(getSecret());
}

/** リフレッシュトークン発行（長命・セッションIDを持たせる） */
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

/** アクセストークン検証（タイプ/期限/署名） */
export async function verifyAccess(token: string) {
    const { payload } = await jwtVerify(token, getSecret(), {
        algorithms: ['HS256'],
        clockTolerance: '5s', // サーバ間のわずかな時計ズレを吸収
    });
    if (payload.typ !== 'access') throw new Error('wrong token type');
    return payload as JWTPayload & { email: string };
}

/** リフレッシュトークン検証 */
export async function verifyRefresh(token: string) {
    const { payload } = await jwtVerify(token, getSecret(), {
        algorithms: ['HS256'],
        clockTolerance: '5s',
    });
    if (payload.typ !== 'refresh') throw new Error('wrong token type');
    return payload as JWTPayload & { email: string; jti: string };
}

/** timing-safe な比較（長さが違えば false） */
function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}

/**
 * CSRF 検証
 * - Double Submit Cookie（Cookie とヘッダの一致）
 * - かつ Origin/Referer が同一オリジンなら OK（ヘッダが存在する場合のみ検査）
 */
export async function requireCsrf() {
    const c = await cookies();
    const h = await headers();

    const csrfCookie = c.get(COOKIE_CSRF)?.value ?? '';
    const csrfHeader = h.get('X-CSRF-Token') ?? '';

    // Double Submit 一致
    if (!csrfCookie || !csrfHeader || !safeEqual(csrfCookie, csrfHeader)) {
        throw new Error('csrf_mismatch');
    }

    // 追加防御: Origin/Referer が存在する場合は必ず同一オリジン
    const origin = h.get('Origin') ?? '';
    const referer = h.get('Referer') ?? '';
    const host = h.get('Host') ?? '';
    const expectedSuffix = `://${host}`;

    const sameOrigin =
        (!origin || origin.endsWith(expectedSuffix)) &&
        (!referer || referer.includes(`://${host}/`));

    if (!sameOrigin) {
        throw new Error('csrf_mismatch');
    }
}

/** アクセストークンを HttpOnly Cookie に保存 */
export function setAccessCookie(res: NextResponse, token: string) {
    const secure = isProd || SAMESITE === 'none';
    res.cookies.set(COOKIE_ACCESS, token, {
        httpOnly: true,
        secure,
        sameSite: SAMESITE,
        path: '/',
        maxAge: ACCESS_TTL_SEC,
    });
}

/** リフレッシュトークンを HttpOnly Cookie に保存 */
export function setRefreshCookie(res: NextResponse, token: string) {
    const secure = isProd || SAMESITE === 'none';
    res.cookies.set(COOKIE_REFRESH, token, {
        httpOnly: true,
        secure,
        sameSite: SAMESITE,
        path: '/',
        maxAge: REFRESH_TTL_SEC,
    });
}

/** フロントから読める CSRF Cookie を設定 */
export function setCsrfCookie(res: NextResponse, value: string) {
    const secure = isProd || SAMESITE === 'none';
    res.cookies.set(COOKIE_CSRF, value, {
        httpOnly: false, // フロントJSから読み出す想定（Double Submit 用）
        secure,
        sameSite: SAMESITE,
        path: '/',
        maxAge: REFRESH_TTL_SEC,
    });
}

/** Cookie からアクセストークン読取（存在しなければ空文字） */
export async function readAccessTokenFromCookie() {
    const c = await cookies();
    return c.get(COOKIE_ACCESS)?.value ?? '';
}

/** Cookie からリフレッシュトークン読取（存在しなければ空文字） */
export async function readRefreshTokenFromCookie() {
    const c = await cookies();
    return c.get(COOKIE_REFRESH)?.value ?? '';
}

/** 全認証系 Cookie を削除 */
export function clearAllAuthCookies(res: NextResponse) {
    res.cookies.delete(COOKIE_ACCESS);
    res.cookies.delete(COOKIE_REFRESH);
    res.cookies.delete(COOKIE_CSRF);
}
