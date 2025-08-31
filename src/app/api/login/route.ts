export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const sql = neon(process.env.NEON_DATABASE_URL!);

export async function POST(req: Request) {
    try {
        const { email, password } = await req.json();
        if (!email || !password) {
            return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
        }

        const rows = await sql`
            SELECT id, email, password_hash
            FROM users
            WHERE email = ${email}
            LIMIT 1
        ` as { id: string; email: string; password_hash: string }[];

        if (rows.length === 0) {
            return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
        }

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
        }

        const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
        const token = await new SignJWT({ sub: user.id, email: user.email })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(secret);

        const res = NextResponse.json({ ok: true, email: user.email });

        const isProd = process.env.NODE_ENV === 'production';
        res.cookies.set({
            name: 'auth',
            value: token,
            httpOnly: true,
            secure: isProd,
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7
        });

        return res;
    } catch (e) {
        console.error(e);
        return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
    }
}
