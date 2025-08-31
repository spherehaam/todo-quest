import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // 守りたいパス
    const needsAuth =
        pathname.startsWith('/home');

    if (!needsAuth) return NextResponse.next();

    // ここでは軽量に Cookie の有無だけチェック
    const hasAuth = req.cookies.get('auth');
    if (!hasAuth) {
        const url = new URL('/login', req.url);
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/home/:path*'],
};
