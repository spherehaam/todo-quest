export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { readAccessTokenFromCookie, verifyAccess } from '@/lib/auth/common';

/**
 * /api/me 相当のハンドラ
 * - 認証クッキーからアクセストークンを読み取り、検証に成功したらユーザー情報を返す
 * - 認証失敗/未ログイン時は 401 を返す（メッセージは error フィールドで区別）
 * - センシティブな応答のため、明示的に Cache-Control: no-store を付与
 */
export async function handleGetMe(): Promise<NextResponse> {
    // 共通ヘッダ（キャッシュ抑止）
    const noStore = { 'Cache-Control': 'no-store' as const };

    try {
        // アクセストークンを Cookie から読み取り
        const token = await readAccessTokenFromCookie();
        if (!token) {
            // 未ログイン（トークンなし）: 401
            return NextResponse.json(
                { ok: false, error: 'no_auth' as const },
                { status: 401, headers: noStore }
            );
        }

        // トークン検証（失効・改ざん等は verifyAccess 内で例外化される想定）
        const payload = await verifyAccess(token) as { sub: string; email?: string | null };

        // 必要最小限のユーザー情報を返す（ID / Email）
        return NextResponse.json(
            { ok: true, id: payload.sub, email: payload.email ?? null },
            { status: 200, headers: noStore }
        );
    } catch (err) {
        // 失効・改ざんなどの一般的な認証エラー: 401
        // 開発中のみ詳細を見たい場合は以下を有効化
        // if (process.env.NODE_ENV === 'development') console.debug('verifyAccess failed:', err);
        return NextResponse.json(
            { ok: false, error: 'invalid_or_expired' as const },
            { status: 401, headers: noStore }
        );
    }
}
