import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// アクセス制御に使うCookie名（共通化しているなら同名に揃える）
const AUTH_COOKIE = 'auth';

/**
 * /home 以下は要ログイン。
 * - 認証Cookieが未設定 or 空文字なら /login へリダイレクト
 * - 元のURLに戻れるよう ?next= を付与
 *
 * 注:
 * - JWT検証など重い処理はMiddleware(Edge)では避けるのが無難。
 *   期限切れ判定はサーバー側(ルートハンドラ/レイアウト)で最終チェックする想定。
 */
export function middleware(req: NextRequest) {
    // このファイルでは matcher で /home を限定しているため、ここでは認証判定のみ行う
    const cookie = req.cookies.get(AUTH_COOKIE);
    const hasAuth = !!cookie && !!cookie.value;

    if (hasAuth) {
        // Cookieはある → しきい値としては通す（有効性はサーバー側で検証）
        return NextResponse.next();
    }

    // 未ログイン: /login にリダイレクト。遷移元を ?next= に保持
    const url = new URL('/login', req.url);
    const original = req.nextUrl.pathname + req.nextUrl.search; // hashはブラウザ側のみで送られない
    url.searchParams.set('next', original);

    return NextResponse.redirect(url);
}

/**
 * このミドルウェアを適用するパス。
 * - 静的アセットやAPIには当てず、/home 配下だけに限定
 * - 必要に応じて追加でパスを増やしていく（例: '/dashboard/:path*' など）
 */
export const config = {
    matcher: ['/home/:path*'],
};
