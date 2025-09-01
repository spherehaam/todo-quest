'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * クッキーから指定したキーの値を読み取るユーティリティ関数
 */
function readCookie(name: string) {
    return document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + '='))
        ?.split('=')[1];
}

/**
 * ローカル環境判定（クライアント）:
 * - SSR 初回は常に false（サーバーと一致させる）
 * - マウント後にだけ window を参照して更新
 */
function useIsLocalhost() {
    const [isLocal, setIsLocal] = useState(false);
    useEffect(() => {
        setIsLocal(/^(localhost|192\.168\.10\.103)$/.test(window.location.hostname));
    }, []);
    return isLocal;
}

/**
 * ログイン画面コンポーネント
 * - ユーザー名/パスワード入力
 * - /api/login にリクエスト
 * - ログイン成功時は /home へ遷移
 * - デバッグボタンはローカル環境のみ表示
 */
export default function Page() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [msg, setMsg] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const router = useRouter();
    const isLocal = useIsLocalhost();

    /**
     * ログイン処理
     */
    async function login(e: React.FormEvent) {
        e.preventDefault();
        try {
            setSubmitting(true);
            setMsg('ログイン中...');
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (res.ok) {
                setMsg(`OK: ${data.email}`);
                router.push('/home');
            } else {
                setMsg(`NG: ${data.error}`);
            }
        } finally {
            setSubmitting(false);
        }
    }

    /**
     * 現在のログイン状態を確認 (/api/me)
     */
    async function me() {
        const res = await fetch('/api/me', { credentials: 'include' });
        const data = await res.json();
        setMsg(res.ok ? `ログイン中: ${data.email}` : '未ログイン');
    }

    /**
     * 認証＋CSRF 保護された API 呼び出し (/api/protected)
     */
    async function callProtected() {
        setMsg('保護API呼び出し中…');
        const csrf = readCookie('csrf_token') ?? '';
        const res = await fetch('/api/protected', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrf
            },
            credentials: 'include',
            body: JSON.stringify({})
        });
        const data = await res.json();
        setMsg(res.ok ? `Protected OK: ${data.data}` : `Protected NG: ${data.error}`);
    }

    /**
     * アクセストークンを更新 (/api/refresh)
     */
    async function refresh() {
        const csrf = readCookie('csrf_token') ?? '';
        const res = await fetch('/api/refresh', {
            method: 'POST',
            headers: { 'X-CSRF-Token': csrf },
            credentials: 'include'
        });
        setMsg(res.ok ? 'アクセストークン更新OK' : '更新失敗');
    }

    /**
     * ログアウト処理 (/api/logout)
     */
    async function logout() {
        const csrf = readCookie('csrf_token') ?? '';
        await fetch('/api/logout', {
            method: 'POST',
            headers: { 'X-CSRF-Token': csrf },
            credentials: 'include'
        });
        setMsg('ログアウトしました');
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-950 dark:to-black">
            <div className="mx-auto max-w-md px-4 py-16">
                {/* ロゴ/タイトル */}
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-black/90 dark:bg-white/90 flex items-center justify-center shadow">
                        <span className="text-white dark:text-black text-xl font-bold">TQ</span>
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                        Todo Quest へログイン
                    </h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        アカウント情報を入力してください
                    </p>
                </div>

                {/* カード */}
                <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 backdrop-blur p-6 shadow-sm">
                    {/* ログインフォーム */}
                    <form onSubmit={login} className="space-y-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                メールアドレス
                            </label>
                            <input
                                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-black/10 dark:focus:ring-white/10 transition"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                autoComplete="username"
                                required
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                パスワード
                            </label>
                            <div className="relative">
                                <input
                                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 pr-12 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-black/10 dark:focus:ring-white/10 transition"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                                    aria-label="パスワード表示切替"
                                >
                                    {showPassword ? '隠す' : '表示'}
                                </button>
                            </div>
                        </div>

                        <button
                            className="w-full rounded-xl bg-black text-white py-3 font-medium shadow-sm hover:shadow-md active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed"
                            disabled={submitting}
                        >
                            {submitting ? 'ログイン中…' : 'ログイン'}
                        </button>
                    </form>

                    {/* デバッグボタン群：ローカルのみ表示（マウント後に切り替わる） */}
                    {isLocal && (
                        <div className="mt-6">
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Debug (local only)
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                                    onClick={me}
                                >
                                    状態確認
                                </button>
                                <button
                                    className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                                    onClick={callProtected}
                                >
                                    保護POST
                                </button>
                                <button
                                    className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                                    onClick={refresh}
                                >
                                    リフレッシュ
                                </button>
                                <button
                                    className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                                    onClick={logout}
                                >
                                    ログアウト
                                </button>
                            </div>

                            {/* メッセージ表示 */}
                            {msg && (
                                <p className="mt-4 text-sm text-gray-700 dark:text-gray-300">
                                    {msg}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* フッター的補足 */}
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    ログインすると <a href="/terms" className="underline">利用規約</a> と
                    <a href="/privacy" className="underline ml-1">プライバシー</a> に同意したものとみなされます。
                </p>
            </div>
        </main>
    );
}
