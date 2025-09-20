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

type Props = Readonly<{
    children: ReactNode;
}>;

export default async function ProtectedLayout({ children }: Props) {
    // 1) このファイル内で cookies() を触ることで動的化を担保
    //    （readAccessTokenFromCookie が内部で cookies() を使っていない場合の保険）
    cookies();

    const token = await readAccessTokenFromCookie();

    if (!token) {
        // TODO: 可能なら /login?next=... を検討（Middlewareで現在URL取得して付与が安全）
        redirect('/login');
    }

    try {
        await verifyAccess(token);
    } catch (err) {
        // 2) 想定外エラーの最低限ログ（本番では専用ロガーに送る）
        console.error('[ProtectedLayout] verifyAccess failed:', err);
        redirect('/login');
    }

    return (
        <>
            <ToastProvider>
                <Header />

                {/* 共通の背景とレイアウトシェル（サイドバー + メイン） */}
                <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
                    <div className="mx-auto max-w-6xl p-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                            {/* 共通サイドバー */}
                            <Sidebar />

                            {/* メイン（各ページの children を配置） */}
                            <main className="space-y-4" aria-live="polite">
                                {children}
                            </main>
                        </div>
                    </div>
                </div>

                <Footer />
            </ToastProvider>
        </>
    );
}
