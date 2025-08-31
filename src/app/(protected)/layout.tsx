export const runtime = 'nodejs';

import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { readAccessTokenFromCookie, verifyAccess } from '@/lib/auth/common';

/**
 * 認証が必要なページ用のレイアウト
 * 
 * - サーバーコンポーネントとして実行されるため、初期レンダリング時に
 *   クライアントへ返す前に認証チェックが走る。
 * - ログインしていない場合や JWT が不正な場合は `/login` に即リダイレクト。
 * - チラつき（画面が一瞬表示される現象）を防止できる。
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
    // Cookie からアクセストークンを取得
    const token = await readAccessTokenFromCookie();
    if (!token) redirect('/login'); // トークンが無ければ即ログインページへ

    try {
        // JWT を検証（署名や有効期限を確認）
        await verifyAccess(token);
    } catch {
        // 検証に失敗したらログインページへリダイレクト
        redirect('/login');
    }

    // 認証に成功した場合のみ子コンポーネントを描画
    return <>{children}</>;
}
