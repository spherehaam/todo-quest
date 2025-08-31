export const runtime = 'nodejs';

import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import crypto from 'crypto';

const isProd = process.env.NODE_ENV === 'production';
const SAMESITE: 'lax' | 'none' = 'lax'; // クロスドメインが必要なら 'none'（HTTPS必須）

export const COOKIE_ACCESS = 'auth';
export const COOKIE_REFRESH = 'refresh';
export const COOKIE_CSRF = 'csrf_token';
export const ACCESS_TTL_SEC = 15 * 60;           // 15分
export const REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // 7日

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

export async function verifyAccess(token: string) {
    const { payload } = await jwtVerify(token, getSecret(), {
        algorithms: ['HS256'],
    });
    if (payload.typ !== 'access') throw new Error('wrong token type');
    return payload as JWTPayload & { email: string };
}

export async function verifyRefresh(token: string) {
    const { payload } = await jwtVerify(token, getSecret(), {
        algorithms: ['HS256'],
    });
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

/**
 * Cookie セット用ラッパー（NextResponse 想定）
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
        httpOnly: false, // JSから読める
        secure: isProd,
        sameSite: SAMESITE,
        path: '/',
        maxAge: REFRESH_TTL_SEC,
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

export function clearAllAuthCookies(res: NextResponse) {
    res.cookies.set(COOKIE_ACCESS, '', { path: '/', maxAge: 0 });
    res.cookies.set(COOKIE_REFRESH, '', { path: '/', maxAge: 0 });
    res.cookies.set(COOKIE_CSRF, '', { path: '/', maxAge: 0 });
}
