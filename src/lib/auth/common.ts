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

/** ホスト名の正規化（小文字化・ポート除去） */
function normalizeHost(input: string): string {
    return input.toLowerCase().replace(/:\d+$/, '');
}

/** 許可ホスト／信頼サフィックスとの比較（サブドメイン許容） */
function hostMatches(givenHost: string, allowedHosts: string[], trustedSuffixes: string[] = []): boolean {
    const g = normalizeHost(givenHost);
    return (
        allowedHosts.some((a) => {
            const ah = normalizeHost(a);
            return g === ah || g.endsWith('.' + ah);
        }) ||
        trustedSuffixes.some((suf) => {
            const s = suf.replace(/^\./, '').toLowerCase();
            return g === s || g.endsWith('.' + s);
        })
    );
}

/**
 * CSRF 検証
 * - Double Submit Cookie（Cookie とヘッダの一致）を主軸に
 * - 追加防御: Sec-Fetch-Site が cross-site なら拒否
 * - Origin/Referer は「存在するときだけ」堅牢なホスト比較で確認（無ければ通す）
 */
export async function requireCsrf() {
    const c = await cookies();
    const h = await headers();

    const csrfCookie = c.get(COOKIE_CSRF)?.value ?? '';
    const csrfHeader = h.get('x-csrf-token') ?? h.get('X-CSRF-Token') ?? '';

    // 1) Double Submit 一致
    if (!csrfCookie || !csrfHeader || !safeEqual(csrfCookie, csrfHeader)) {
        throw new Error('csrf_mismatch');
    }

    // 2) 追加防御: 明らかなクロスサイト起点は拒否
    const secFetchSite = h.get('sec-fetch-site'); // 'same-origin' | 'same-site' | 'cross-site' | 'none'
    if (secFetchSite && secFetchSite === 'cross-site') {
        throw new Error('csrf_mismatch');
    }

    // 3) Origin/Referer は在るときだけ許可ホストに合致するかチェック（無ければスキップして通す）
    const origin = h.get('origin');
    const referer = h.get('referer');

    // 自分自身のホスト（プロキシ考慮）
    const selfHost =
        h.get('x-forwarded-host') ??
        h.get('host') ??
        new URL('http://localhost').host; // フォールバック

    const allowedHosts = [
        selfHost,
        process.env.PUBLIC_BASE_HOST ?? '',   // 例: 'example.com'
        'localhost',
        '127.0.0.1',
    ].filter(Boolean);

    const trustedSuffixes = [
        process.env.PUBLIC_TRUSTED_SUFFIX ?? '', // 例: '.vercel.app'
    ].filter(Boolean);

    const headerHostOk = (val: string | null): boolean => {
        if (!val) return true; // 無ければ通す（壊れにくさ優先）
        try {
            const host = new URL(val).host;
            return hostMatches(host, allowedHosts, trustedSuffixes);
        } catch {
            // 不正URLは拒否
            return false;
        }
    };

    if (!headerHostOk(origin) || !headerHostOk(referer)) {
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
