/**
 * Next.js runtime モード設定
 * - Node.js 実行環境を強制
 * - dynamic rendering を明示（キャッシュを無効化）
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { readAccessTokenFromCookie, verifyAccess } from '@/lib/auth/common';
import Header from '@/components/header';
import Footer from '@/components/footer';
import Sidebar from '@/components/sidebar';
import { ToastProvider } from '@/components/toast';

/**
 * ProtectedLayout の Props 型定義
 * - children を必須にして Readonly で固定
 */
type Props = Readonly<{
    children: ReactNode;
}>;

/**
 * 認証保護されたレイアウト
 * - Cookie からアクセストークンを取得
 * - トークンが無い／検証に失敗した場合は /login にリダイレクト
 * - 成功時は共通レイアウト（ヘッダー／サイドバー／フッター）を表示
 */
export default async function ProtectedLayout({ children }: Props) {
    // cookies() を呼ぶことで、このレイアウトを "動的" にする効果がある
    cookies();

    // アクセストークンを Cookie から取得
    const token = await readAccessTokenFromCookie();

    // トークンが存在しない場合はログインへリダイレクト
    if (!token) {
        redirect('/login');
    }

    try {
        // トークンを検証
        await verifyAccess(token);
    } catch (err) {
        // 検証に失敗した場合はエラーログを出力し、ログイン画面へ
        console.error('[ProtectedLayout] verifyAccess failed:', err);
        redirect('/login');
    }

    // 認証済みユーザーに対してレイアウトを返す
    return (
        <ToastProvider>
            {/* 共通ヘッダー */}
            <Header />

            {/* ページ全体のラッパー */}
            <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
                <div className="mx-auto max-w-6xl p-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                        {/* 左サイドバー */}
                        <Sidebar />

                        {/* メインコンテンツ領域 */}
                        <main className="space-y-4" aria-live="polite">
                            {children}
                        </main>
                    </div>
                </div>
            </div>

            {/* 共通フッター */}
            <Footer />
        </ToastProvider>
    );
}
