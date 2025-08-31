export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export async function GET() {
    try {
        const cookieStore = await cookies(); // ✅ Promiseを解決
        const token = cookieStore.get('auth')?.value;
        if (!token) {
            return NextResponse.json({ ok: false, error: 'no_auth' }, { status: 401 });
        }
        const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
        const { payload } = await jwtVerify(token, secret);
        return NextResponse.json({ ok: true, email: payload.email });
    } catch {
        return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 401 });
    }
}
