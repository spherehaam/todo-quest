export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { readAccessTokenFromCookie, verifyAccess } from '@/lib/auth/common';
import Header from '@/components/header';
import Footer from '@/components/footer';

type Props = Readonly<{
    children: ReactNode;
}>;

export default async function ProtectedLayout({ children }: Props) {
    // 1) このファイル内で cookies() を触ることで動的化を担保
    //    （readAccessTokenFromCookie が内部で cookies() を使っていない場合の保険）
    cookies();

    const token = await readAccessTokenFromCookie();

    if (!token) {
        // TODO: 可能なら /login?next=... を検討（Middlewareで現在URL取得して付与するのが安全）
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
            <Header />
            <>{children}</>
            <Footer />
        </>
    );
}
