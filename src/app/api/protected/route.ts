export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { readAccessTokenFromCookie, verifyAccess, requireCsrf } from '../_lib/auth';

export async function POST() {
    try {
        // 認可（JWT）→ CSRF の順で検証
        const token = await readAccessTokenFromCookie();
        if (!token) return NextResponse.json({ ok: false, error: 'no_auth' }, { status: 401 });
        await verifyAccess(token);
        await requireCsrf();

        // 本来の処理をここに
        return NextResponse.json({ ok: true, data: 'secret' });
    } catch (e) {
        const msg = (e as Error).message === 'csrf_mismatch' ? 'csrf_mismatch' : 'unauthorized';
        const status = msg === 'csrf_mismatch' ? 403 : 401;
        return NextResponse.json({ ok: false, error: msg }, { status });
    }
}
