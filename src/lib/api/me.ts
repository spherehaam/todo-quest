export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { readAccessTokenFromCookie, verifyAccess } from '@/lib/auth/common';

/**
 * /api/me のハンドラ
 * - Cookie からアクセストークンを読み取り、ユーザー情報を返す
 * - 未認証またはトークンが無効な場合は 401 を返す
 */
export async function handleGetMe(): Promise<NextResponse> {
    // 常にキャッシュさせない
    const noStore = { 'Cache-Control': 'no-store' as const };

    try {
        // 1. Cookie からアクセストークン取得
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' as const },
                { status: 401, headers: noStore }
            );
        }

        // 2. トークン検証
        const payload = (await verifyAccess(token)) as {
            sub: string;
            email?: string | null;
        };

        // 3. 成功時はユーザーIDとメールを返却
        return NextResponse.json(
            { ok: true, id: payload.sub, email: payload.email ?? null },
            { status: 200, headers: noStore }
        );
    } catch {
        // 4. 検証失敗時
        return NextResponse.json(
            { ok: false, error: 'invalid_or_expired' as const },
            { status: 401, headers: noStore }
        );
    }
}
