export const runtime = 'nodejs';

import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { readAccessTokenFromCookie, verifyAccess } from '@/lib/auth/common';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
    // サーバー側で Cookie を直接読む → JWT 検証 → 失敗なら即リダイレクト
    const token = await readAccessTokenFromCookie();
    if (!token) redirect('/login');

    try {
        await verifyAccess(token);
    } catch {
        redirect('/login');
    }

    return <>{children}</>;
}
