export const runtime = 'nodejs';

import { sql } from '@/lib/db';
import bcrypt from 'bcryptjs';

/**
 * Users テーブル仕様
 * id: uuid PK
 * email: varchar(255) UNIQUE NOT NULL
 * username: varchar(50) UNIQUE NOT NULL
 * password_hash: varchar(255) NOT NULL
 * stripe_customer_id: varchar(255) NULL
 * level: int DEFAULT 1
 * exp: int DEFAULT 0
 * avatar_id: uuid NULL
 * title_id: uuid NULL
 * created_at: timestamptz DEFAULT now()
 * updated_at: timestamptz DEFAULT now()
 */

export type SignupInput = {
    email: string;
    username: string;
    password: string;
};

export type SignupResult =
    | { ok: true; userId: string }
    | { ok: false; error: string; detail?: string };

/** Email 形式の簡易チェック */
function isEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * 入力検証（サーバー側）
 */
export function validateSignupInput(input: SignupInput): { ok: true } | { ok: false; errors: string[] } {
    const errors: string[] = [];

    if (!input.email || !isEmail(input.email)) errors.push('invalid_email');

    const name = input.username?.trim();
    if (!name || name.length < 3) errors.push('invalid_username');

    const pw = input.password ?? '';
    if (pw.length < 8) errors.push('weak_password');

    if (errors.length) return { ok: false, errors };
    return { ok: true };
}

/**
 * 既存重複チェック（email / username）
 */
async function checkUnique(email: string, username: string) {
    const rows = await sql`
        SELECT email, username
        FROM users
        WHERE email = ${email} OR username = ${username}
    `;

    let emailTaken = false;
    let usernameTaken = false;

    for (const r of rows as any[]) {
        if (r.email === email) emailTaken = true;
        if (r.username === username) usernameTaken = true;
    }

    return { emailTaken, usernameTaken };
}

/**
 * ユーザー作成。
 * - email/username 正規化
 * - bcrypt でハッシュ化
 * - UNIQUE 衝突をアプリ側でも検知
 */
export async function createUser(input: SignupInput): Promise<SignupResult> {
    const v = validateSignupInput(input);
    if (v.ok === false) {
        return { ok: false, error: 'validation_error', detail: v.errors.join(',') };
    }

    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();

    const dup = await checkUnique(email, username);
    if (dup.emailTaken) return { ok: false, error: 'email_taken' };
    if (dup.usernameTaken) return { ok: false, error: 'username_taken' };

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(input.password, saltRounds);

    try {
        const rows = await sql`
            INSERT INTO users (id, email, username, password_hash, level, exp)
            VALUES (gen_random_uuid(), ${email}, ${username}, ${passwordHash}, 1, 0)
            RETURNING id
        `;

        const user = (rows as any[])[0];
        return { ok: true, userId: user.id };
    } catch (err: any) {
        const msg = typeof err?.message === 'string' ? err.message : '';
        if (msg.includes('users_email_key')) return { ok: false, error: 'email_taken' };
        if (msg.includes('users_username_key')) return { ok: false, error: 'username_taken' };
        return { ok: false, error: 'signup_failed', detail: msg };
    }
}

/**
 * API ルート用のハンドラ（/api/auth/signup から使用想定）
 * CSRF 検証は呼び出し側で行うこと。
 */
export async function handleSignup(body: unknown): Promise<SignupResult> {
    const { email, username, password } = (body || {}) as Partial<SignupInput>;

    if (!email || !username || !password) {
        return { ok: false, error: 'missing_params' };
    }

    return await createUser({ email, username, password });
}
