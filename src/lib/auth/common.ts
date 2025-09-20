export const runtime = 'nodejs';

import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import crypto from 'crypto';

/**
 * 実行環境フラグ
 */
const isProd = process.env.NODE_ENV === 'production';

/**
 * Cookie の SameSite 属性
 * - 'lax' を既定
 * - 3rd party 埋め込み等が必要な場合のみ 'none' にする
 */
const SAMESITE: 'lax' | 'none' = 'lax';

/** Cookie 名（固定） */
export const COOKIE_ACCESS = 'auth';
export const COOKIE_REFRESH = 'refresh';
export const COOKIE_CSRF = 'csrf_token';

/** TTL（秒） */
export const ACCESS_TTL_SEC = 15 * 60; // 15 minutes
export const REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

/**
 * 秘密鍵を取得してバイト列化
 * - 未設定なら起動時に例外（環境不備を即時検知）
 */
function getSecret() {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET is not set');
    return new TextEncoder().encode(s);
}

/**
 * トークンや識別子を SHA-256 でハッシュ
 * - DB に生値を保存しない用途などで使用
 */
export function hashToken(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * アクセストークンを署名
 * - typ: 'access'
 * - 署名アルゴリズム: HS256
 * - 有効期限: ACCESS_TTL_SEC
 */
export async function signAccessToken(user: { id: string; email: string }) {
    return await new SignJWT({ sub: user.id, email: user.email, typ: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TTL_SEC}s`)
        .sign(getSecret());
}

/**
 * リフレッシュトークンを署名
 * - typ: 'refresh'
 * - jti: セッションID（サーバ側で失効管理する想定）
 * - 有効期限: REFRESH_TTL_SEC
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
 * アクセストークンの検証
 * - typ が 'access' であることを確認
 * - clockTolerance で僅かな時計ズレを許容
 */
export async function verifyAccess(token: string) {
    const { payload } = await jwtVerify(token, getSecret(), {
        algorithms: ['HS256'],
        clockTolerance: '5s', // サーバ間のわずかな時計ズレを吸収
    });
    if (payload.typ !== 'access') throw new Error('wrong token type');
    return payload as JWTPayload & { email: string };
}

/**
 * リフレッシュトークンの検証
 * - typ が 'refresh' であることを確認
 */
export async function verifyRefresh(token: string) {
    const { payload } = await jwtVerify(token, getSecret(), {
        algorithms: ['HS256'],
        clockTolerance: '5s',
    });
    if (payload.typ !== 'refresh') throw new Error('wrong token type');
    return payload as JWTPayload & { email: string; jti: string };
}

/**
 * タイミング攻撃耐性のある比較
 */
function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}

/**
 * ホスト名の正規化（ポート除去・小文字化）
 */
function normalizeHost(input: string): string {
    return input.toLowerCase().replace(/:\d+$/, '');
}

/**
 * 許可ホスト or 信頼サフィックスに一致するか
 * - a.example.com は example.com 許可で OK
 * - trustedSuffixes には先頭のドット有無どちらでも可
 */
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
 * CSRF 検証（Cookie+Header, Fetch-Site, Origin/Referer の整合性）
 * - Cookie とヘッダーのトークン一致（timing safe）
 * - cross-site POST を拒否（Sec-Fetch-Site）
 * - Origin/Referer のホストが自分 or 許可ドメインかを確認
 *
 * 失敗時: Error('csrf_mismatch') を投げる
 */
export async function requireCsrf() {
    const c = await cookies();
    const h = await headers();

    // 1) Cookie-Header のトークン一致
    const csrfCookie = c.get(COOKIE_CSRF)?.value ?? '';
    const csrfHeader = h.get('x-csrf-token') ?? h.get('X-CSRF-Token') ?? '';
    if (!csrfCookie || !csrfHeader || !safeEqual(csrfCookie, csrfHeader)) {
        throw new Error('csrf_mismatch');
    }

    // 2) cross-site コンテキストを拒否
    const secFetchSite = h.get('sec-fetch-site'); // 'same-origin' | 'same-site' | 'cross-site' | 'none'
    if (secFetchSite && secFetchSite === 'cross-site') {
        throw new Error('csrf_mismatch');
    }

    // 3) Origin/Referer のホスト検証
    const origin = h.get('origin');
    const referer = h.get('referer');

    const selfHost =
        h.get('x-forwarded-host') ??
        h.get('host') ??
        new URL('http://localhost').host;

    const allowedHosts = [
        selfHost,
        process.env.PUBLIC_BASE_HOST ?? '',
        'localhost',
        '127.0.0.1',
    ].filter(Boolean);

    const trustedSuffixes = [
        process.env.PUBLIC_TRUSTED_SUFFIX ?? '',
    ].filter(Boolean);

    const headerHostOk = (val: string | null): boolean => {
        if (!val) return true; // ヘッダ未送信ならこの条件はパス
        try {
            const host = new URL(val).host;
            return hostMatches(host, allowedHosts, trustedSuffixes);
        } catch {
            return false; // 不正なURL
        }
    };

    if (!headerHostOk(origin) || !headerHostOk(referer)) {
        throw new Error('csrf_mismatch');
    }
}

/**
 * アクセストークン Cookie を設定
 * - httpOnly/secure/sameSite/path/maxAge を適切に付与
 */
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

/**
 * リフレッシュトークン Cookie を設定
 */
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

/**
 * CSRF トークン Cookie を設定（JS から参照できる）
 */
export function setCsrfCookie(res: NextResponse, value: string) {
    const secure = isProd || SAMESITE === 'none';
    res.cookies.set(COOKIE_CSRF, value, {
        httpOnly: false,
        secure,
        sameSite: SAMESITE,
        path: '/',
        maxAge: REFRESH_TTL_SEC,
    });
}

/** Cookie からアクセストークン読み出し */
export async function readAccessTokenFromCookie() {
    const c = await cookies();
    return c.get(COOKIE_ACCESS)?.value ?? '';
}

/** Cookie からリフレッシュトークン読み出し */
export async function readRefreshTokenFromCookie() {
    const c = await cookies();
    return c.get(COOKIE_REFRESH)?.value ?? '';
}

/** すべての認証関連 Cookie を削除 */
export function clearAllAuthCookies(res: NextResponse) {
    res.cookies.delete(COOKIE_ACCESS);
    res.cookies.delete(COOKIE_REFRESH);
    res.cookies.delete(COOKIE_CSRF);
}
