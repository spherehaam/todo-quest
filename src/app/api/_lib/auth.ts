export const runtime = 'nodejs';

import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import crypto from 'crypto';

const isProd = process.env.NODE_ENV === 'production';
const SAMESITE: 'lax' | 'none' = isProd ? 'lax' : 'lax'; // クロスサイトが必要なら 'none' に変更
const COOKIE_ACCESS = 'auth';       // 短命アクセスJWT
const COOKIE_REFRESH = 'refresh';   // 長命リフレッシュJWT
const COOKIE_CSRF = 'csrf_token';   // ダブルサブミット用
const ACCESS_TTL_SEC = 15 * 60;     // 15分
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // 7日

function getSecret() {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET is not set');
    return new TextEncoder().encode(s);
}

export function hashToken(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

export async function signAccessToken(user: { id: string; email: string }) {
    return await new SignJWT({ sub: user.id, email: user.email, typ: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TTL_SEC}s`)
        .sign(getSecret());
}

export async function signRefreshToken(user: { id: string; email: string }, sessionId: string) {
    // jti = セッションIDを内包しておくと追跡が楽
    return await new SignJWT({ sub: user.id, email: user.email, typ: 'refresh', jti: sessionId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${REFRESH_TTL_SEC}s`)
        .sign(getSecret());
}

export async function verifyAccess(token: string) {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    if (payload.typ !== 'access') throw new Error('wrong token type');
    return payload as JWTPayload & { email: string };
}

export async function verifyRefresh(token: string) {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    if (payload.typ !== 'refresh') throw new Error('wrong token type');
    return payload as JWTPayload & { email: string; jti: string };
}

export async function requireCsrf() {
    const c = await cookies();
    const h = await headers();
    const csrfCookie = c.get(COOKIE_CSRF)?.value ?? '';
    const csrfHeader = h.get('X-CSRF-Token') ?? '';
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        throw new Error('csrf_mismatch');
    }
}

export function setAccessCookie(res: Response, token: string) {
    // NextResponse を受け取ってから .cookies.set する想定
    // 型の都合で any を許容
    // @ts-expect-error
    res.cookies.set({
        name: COOKIE_ACCESS,
        value: token,
        httpOnly: true,
        secure: isProd,
        sameSite: SAMESITE,
        path: '/',
        maxAge: ACCESS_TTL_SEC
    });
}

export function setRefreshCookie(res: Response, token: string) {
    // @ts-expect-error
    res.cookies.set({
        name: COOKIE_REFRESH,
        value: token,
        httpOnly: true,
        secure: isProd,
        sameSite: SAMESITE,
        path: '/',
        maxAge: REFRESH_TTL_SEC
    });
}

export function setCsrfCookie(res: Response, value: string) {
    // JSから読めるように httpOnly: false
    // @ts-expect-error
    res.cookies.set({
        name: COOKIE_CSRF,
        value,
        httpOnly: false,
        secure: isProd,
        sameSite: SAMESITE,
        path: '/',
        maxAge: REFRESH_TTL_SEC
    });
}

export async function readAccessTokenFromCookie() {
    const c = await cookies();
    return c.get(COOKIE_ACCESS)?.value ?? '';
}
export async function readRefreshTokenFromCookie() {
    const c = await cookies();
    return c.get(COOKIE_REFRESH)?.value ?? '';
}

export async function clearAllAuthCookies(res: Response) {
    // @ts-expect-error
    res.cookies.set({ name: COOKIE_ACCESS, value: '', path: '/', maxAge: 0 });
    // @ts-expect-error
    res.cookies.set({ name: COOKIE_REFRESH, value: '', path: '/', maxAge: 0 });
    // @ts-expect-error
    res.cookies.set({ name: COOKIE_CSRF, value: '', path: '/', maxAge: 0 });
}
