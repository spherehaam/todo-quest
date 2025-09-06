export const runtime = 'nodejs';
// 認証状態に依存するエンドポイントは静的キャッシュを避ける
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { readAccessTokenFromCookie, verifyAccess } from '@/lib/auth/common';

type MeOk = { ok: true; id: string; email: string };
type MeErr =
    | { ok: false; error: 'no_auth' }
    | { ok: false; error: 'invalid_or_expired' }
    | { ok: false; error: 'internal_error' };

function json<T extends object>(body: T, status = 200) {
    // 認証系は明示的に no-store（中間キャッシュもブラウザも保存しない）
    return NextResponse.json(body, {
        status,
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            Pragma: 'no-cache'
        }
    });
}

/**
 * GET /api/me の実処理
 * - Cookie からアクセストークンを読み取り、検証に成功したらユーザー情報を返す
 * - トークン不在/無効は 401、その他の予期せぬ失敗は 500 を返す
 */
export async function handleGetMe() {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) {
            // 未認証
            return json<MeErr>({ ok: false, error: 'no_auth' }, 401);
        }

        // 署名・期限・クレームを検証
        const payload = await verifyAccess(token);

        // 期待するクレームが無い場合の安全策（型ガード）
        const userId = (payload as any)?.sub;
        const email = (payload as any)?.email;
        if (typeof userId !== 'string' || typeof email !== 'string') {
            // クレーム欠落はクライアントには 401（再ログインを促す）
            return json<MeErr>({ ok: false, error: 'invalid_or_expired' }, 401);
        }

        return json<MeOk>({ ok: true, id: userId, email });
    } catch (err) {
        // verifyAccess 由来の失敗は基本 401 に寄せる
        // ただし、想定外の実行時エラーは 500 にする
        const msg = (err as Error)?.message ?? '';
        const authLike =
            msg.toLowerCase().includes('token') ||
            msg.toLowerCase().includes('jwt') ||
            msg.toLowerCase().includes('expired') ||
            msg.toLowerCase().includes('invalid');

        if (authLike) {
            return json<MeErr>({ ok: false, error: 'invalid_or_expired' }, 401);
        }

        // 予期せぬ例外はログだけ残して 500
        console.error('[handleGetMe] unexpected error:', err);
        return json<MeErr>({ ok: false, error: 'internal_error' }, 500);
    }
}