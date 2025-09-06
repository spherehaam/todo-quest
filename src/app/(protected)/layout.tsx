export const runtime = 'nodejs';
// 認証系のレイアウトは静的キャッシュさせない（重要）
export const dynamic = 'force-dynamic';
// あるいは revalidate を使う場合は下記でもOK（どちらか片方で十分）
// export const revalidate = 0;

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { readAccessTokenFromCookie, verifyAccess } from '@/lib/auth/common';

type ProtectedLayoutProps = {
    /** 認証必須領域の子要素 */
    children: ReactNode;
};

/**
 * 認証保護レイアウト
 * - サーバーコンポーネントとして動作（cookieの安全な取得/検証）
 * - トークンが無い/無効なら /login へ即時リダイレクト
 */
export default async function ProtectedLayout({ children }: ProtectedLayoutProps) {
    // Cookie からアクセストークンを取得（サーバー側の cookies() 前提実装を想定）
    const token = await readAccessTokenFromCookie();

    // トークンが無ければログインへ
    if (!token) {
        // redirect は例外を投げるため、以降の処理は実行されない
        redirect('/login');
    }

    try {
        // トークンの検証（署名/期限/権限など）
        await verifyAccess(token);
    } catch (err) {
        // ここで token をログに出さないこと（機微情報のため）
        console.error('[ProtectedLayout] verifyAccess failed:', err);
        // 期限切れなどで失敗したらログインへ誘導（理由をクエリで示すのも可）
        redirect('/login?reason=unauthorized');
    }

    // 検証OKなら子要素をそのまま表示
    return <>{children}</>;
}