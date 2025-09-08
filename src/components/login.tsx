'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * クッキー値を取得（URLエンコード考慮）
 * - 値が URL エンコードされているケースで decode して返す
 */
function readCookie(name: string) {
    const raw = document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + '='))
        ?.split('=')[1];
    return raw ? decodeURIComponent(raw) : undefined;
}

/**
 * ローカル開発環境判定（UI上のデバッグ操作の可視可否に使用）
 * - localhost / 127.0.0.1 / ::1 / 特定のLAN IP を対象に
 * - 必要に応じてパターンは拡張してください
 */
function useIsLocalhost() {
    const [isLocal, setIsLocal] = useState(false);
    useEffect(() => {
        const host = window.location.hostname;
        const local = /^(localhost|127\.0\.0\.1|::1|192\.168\.10\.103)$/.test(host);
        setIsLocal(local);
    }, []);
    return isLocal;
}

export default function Page() {
    // ---- フォーム状態 ----
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // ---- UI状態 ----
    const [msg, setMsg] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const router = useRouter();
    const isLocal = useIsLocalhost();

    /**
     * ログイン処理
     * - 2重送信防止（submitting ガード）
     * - 通信例外時のメッセージ
     * - 成功時は push ではなく replace（戻るでログインに戻らない）
     */
    const login = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;

        const emailTrimmed = email.trim();
        const passwordTrimmed = password; // パスワードは trim しない方針もあるが、ここではそのまま

        if (!emailTrimmed || !passwordTrimmed) {
            setMsg('メールアドレスとパスワードを入力してください');
            return;
        }

        try {
            setSubmitting(true);
            setMsg('ログイン中…');

            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email: emailTrimmed, password: passwordTrimmed })
            });

            // サーバーメッセージが常に JSON と限らないため try/catch
            type LoginResponse = {
                email?: string;
                error?: string;
            };

            // any 撤去。unknown→narrow でも可だが、ここでは期待スキーマに型付け
            let data: LoginResponse = {};
            try {
                data = (await res.json()) as LoginResponse;
            } catch {
                // JSONでない応答もあり得るので無視（例：テキスト/空レス）
            }

            if (res.ok) {
                setMsg(`OK: ${data?.email ?? emailTrimmed}`);
                router.replace('/home'); // ← push だと戻るでログインに戻れてしまうため
            } else {
                setMsg(`NG: ${data?.error ?? '認証に失敗しました'}`);
            }
        } catch (err) {
            console.error('login failed:', err);
            setMsg('ネットワークエラーが発生しました');
        } finally {
            setSubmitting(false);
        }
    }, [email, password, router, submitting]);

    /** 自分の状態確認（デバッグ用） */
    const me = useCallback(async () => {
        try {
            const res = await fetch('/api/me', { credentials: 'include' });
            const data = await res.json().catch(() => ({}));
            setMsg(res.ok ? `ログイン中: ${data?.email ?? '(no email)'}` : '未ログイン');
        } catch (err) {
            console.error('me failed:', err);
            setMsg('状態確認に失敗（ネットワークエラー）');
        }
    }, []);

    /** 保護API呼び出し（デバッグ用） */
    const callProtected = useCallback(async () => {
        setMsg('保護API呼び出し中…');
        try {
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
            const data = await res.json().catch(() => ({}));
            setMsg(res.ok ? `Protected OK: ${data?.data ?? ''}` : `Protected NG: ${data?.error ?? ''}`);
        } catch (err) {
            console.error('protected failed:', err);
            setMsg('Protected NG: ネットワークエラー');
        }
    }, []);

    /** アクセストークン更新（デバッグ用） */
    const refresh = useCallback(async () => {
        try {
            const csrf = readCookie('csrf_token') ?? '';
            const res = await fetch('/api/refresh', {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrf },
                credentials: 'include'
            });
            setMsg(res.ok ? 'アクセストークン更新OK' : '更新失敗');
        } catch (err) {
            console.error('refresh failed:', err);
            setMsg('更新失敗（ネットワークエラー）');
        }
    }, []);

    /** ログアウト（デバッグ用） */
    const logout = useCallback(async () => {
        try {
            const csrf = readCookie('csrf_token') ?? '';
            await fetch('/api/logout', {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrf },
                credentials: 'include'
            });
            setMsg('ログアウトしました');
        } catch (err) {
            console.error('logout failed:', err);
            setMsg('ログアウトに失敗（ネットワークエラー）');
        }
    }, []);

    return (
        <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-950 dark:to-black">
            <div className="mx-auto max-w-md px-4 py-16">
                {/* ヘッダーロゴ・見出し */}
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

                {/* フォーム本体 */}
                <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 backdrop-blur p-6 shadow-sm">
                    <form onSubmit={login} className="space-y-4" noValidate>
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
                                inputMode="email"
                                required
                                aria-required="true"
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
                                    aria-required="true"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                                    aria-label="パスワード表示切替"
                                    aria-pressed={showPassword}
                                >
                                    {showPassword ? '隠す' : '表示'}
                                </button>
                            </div>
                        </div>

                        <button
                            className="w-full rounded-xl bg-black text-white py-3 font-medium shadow-sm hover:shadow-md active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed"
                            disabled={submitting || !email.trim() || !password}
                            aria-disabled={submitting || !email.trim() || !password}
                        >
                            {submitting ? 'ログイン中…' : 'ログイン'}
                        </button>
                    </form>

                    {/* ローカル環境でのみ出すデバッグ操作群 */}
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

                            {msg && (
                                <p className="mt-4 text-sm text-gray-700 dark:text-gray-300">
                                    {msg}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* 規約リンク（内部リンクは Link を使用） */}
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    ログインすると{' '}
                    <Link href="/terms" className="underline underline-offset-2 hover:opacity-80">
                        利用規約
                    </Link>{' '}
                    と{' '}
                    <Link href="/privacy" className="underline underline-offset-2 hover:opacity-80">
                        プライバシー
                    </Link>{' '}
                    に同意したものとみなされます。
                </p>
            </div>
        </main>
    );
}
