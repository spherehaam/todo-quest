export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { readAccessTokenFromCookie, verifyAccess } from '@/lib/auth/common';

export async function GET() {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) return NextResponse.json({ ok: false, error: 'no_auth' }, { status: 401 });
        const payload = await verifyAccess(token);
        return NextResponse.json({ ok: true, email: payload.email });
    } catch {
        return NextResponse.json({ ok: false, error: 'invalid_or_expired' }, { status: 401 });
    }
}
