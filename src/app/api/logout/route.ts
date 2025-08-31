export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

export async function GET() {
    const res = NextResponse.json({ ok: true });
    res.cookies.set({
        name: 'auth',
        value: '',
        httpOnly: true,
        path: '/',
        maxAge: 0
    });
    return res;
}
