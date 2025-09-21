'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { showToast } from '@/components/toast';

/**
 * Cookie を読み取るユーティリティ
 * - URL デコード込み
 */
function readCookie(name: string) {
    const raw = document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + '='))
        ?.split('=')[1];
    return raw ? decodeURIComponent(raw) : undefined;
}

/**
 * 実行環境がローカルホストかどうかを判定するフック
 * - localhost / 127.0.0.1 / ::1 / 192.168.10.103 のいずれか
 * - デバッグ UI（保護API呼出し等）の表示制御に利用
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

/**
 * ログインページ
 * - 認証 API: POST /api/login
 * - ログイン状態: GET /api/me（デバッグ用）
 * - トークン更新/保護 API/ログアウトはローカル環境のみボタン表示
 *
 * ※ 処理は変更せず、コメントと軽微な整形のみ
 */
export default function Page() {
    // 入力フォーム
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // 進行状態/メッセージ
    const [msg, setMsg] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const router = useRouter();
    const isLocal = useIsLocalhost();

    /**
     * ログイン送信
     * - 成功: /home に遷移
     * - 失敗: toast + メッセージ表示
     */
    const login = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return; // 二重送信防止

        const emailTrimmed = email.trim();
        const passwordTrimmed = password;

        if (!emailTrimmed || !passwordTrimmed) {
            const m = 'メールアドレスとパスワードを入力してください';
            setMsg(m);
            showToast({ type: 'warning', message: m });
            return;
        }

        try {
            setSubmitting(true);
            setMsg('ログイン中…');

            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email: emailTrimmed, password: passwordTrimmed }),
            });

            type LoginResponse = { email?: string; error?: string };

            let data: LoginResponse = {};
            try {
                data = (await res.json()) as LoginResponse;
            } catch {
                // JSON でない応答にも耐える
            }

            if (res.ok) {
                const okMsg = `ようこそ、${data?.email ?? emailTrimmed} さん`;
                setMsg(`OK: ${data?.email ?? emailTrimmed}`);
                showToast({ type: 'success', message: okMsg });
                router.replace('/home');
            } else {
                const errMsg = data?.error ?? '認証に失敗しました';
                setMsg(`NG: ${errMsg}`);
                showToast({ type: 'error', message: errMsg });
            }
        } catch (err) {
            console.error('login failed:', err);
            const m = 'ネットワークエラーが発生しました';
            setMsg(m);
            showToast({ type: 'error', message: m });
        } finally {
            setSubmitting(false);
        }
    }, [email, password, router, submitting]);

    /**
     * デバッグ: /api/me で現在のログイン状態を確認
     */
    const me = useCallback(async () => {
        try {
            const res = await fetch('/api/me', { credentials: 'include' });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                const m = `ログイン中: ${data?.email ?? '(no email)'}`;
                setMsg(m);
                showToast({ type: 'info', message: m, duration: 2500 });
            } else {
                setMsg('未ログイン');
                showToast({ type: 'warning', message: '未ログインです' });
            }
        } catch (err) {
            console.error('me failed:', err);
            const m = '状態確認に失敗（ネットワークエラー）';
            setMsg(m);
            showToast({ type: 'error', message: m });
        }
    }, []);

    /**
     * デバッグ: 保護 API（POST /api/protected）を呼び出し
     * - CSRF トークン付与
     */
    const callProtected = useCallback(async () => {
        setMsg('保護API呼び出し中…');
        try {
            const csrf = readCookie('csrf_token') ?? '';
            const res = await fetch('/api/protected', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf,
                },
                credentials: 'include',
                body: JSON.stringify({}),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                const m = `Protected OK: ${data?.data ?? ''}`;
                setMsg(m);
                showToast({ type: 'success', message: '保護APIの呼び出しに成功しました。' });
            } else {
                const m = `Protected NG: ${data?.error ?? ''}`;
                setMsg(m);
                showToast({ type: 'error', message: data?.error ?? '保護APIの呼び出しに失敗しました。' });
            }
        } catch (err) {
            console.error('protected failed:', err);
            const m = 'Protected NG: ネットワークエラー';
            setMsg(m);
            showToast({ type: 'error', message: 'ネットワークエラーが発生しました' });
        }
    }, []);

    /**
     * デバッグ: アクセストークン更新（POST /api/refresh）
     */
    const refresh = useCallback(async () => {
        try {
            const csrf = readCookie('csrf_token') ?? '';
            const res = await fetch('/api/refresh', {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrf },
                credentials: 'include',
            });
            if (res.ok) {
                setMsg('アクセストークン更新OK');
                showToast({ type: 'success', message: 'アクセストークンを更新しました。' });
            } else {
                setMsg('更新失敗');
                showToast({ type: 'error', message: 'アクセストークンの更新に失敗しました。' });
            }
        } catch (err) {
            console.error('refresh failed:', err);
            const m = '更新失敗（ネットワークエラー）';
            setMsg(m);
            showToast({ type: 'error', message: m });
        }
    }, []);

    /**
     * デバッグ: ログアウト（POST /api/logout）
     */
    const logout = useCallback(async () => {
        try {
            const csrf = readCookie('csrf_token') ?? '';
            const res = await fetch('/api/logout', {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrf },
                credentials: 'include',
            });
            if (res.ok) {
                setMsg('ログアウトしました');
                showToast({ type: 'success', message: 'ログアウトしました。' });
            } else {
                setMsg('ログアウトに失敗しました');
                showToast({ type: 'error', message: 'ログアウトに失敗しました。' });
            }
        } catch (err) {
            console.error('logout failed:', err);
            const m = 'ログアウトに失敗（ネットワークエラー）';
            setMsg(m);
            showToast({ type: 'error', message: m });
        }
    }, []);

    return (
        <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-950 dark:to-black">
            <div className="mx-auto max-w-md px-4 py-16">
                {/* タイトル */}
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-black/90 dark:bg-white/90 flex items-center justify-center shadow">
                        <span className="text-white dark:text-black text-xl font-bold">TQ</span>
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">Todo Quest へログイン</h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">アカウント情報を入力してください</p>
                </div>

                {/* ログインフォーム */}
                <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 backdrop-blur p-6 shadow-sm">
                    <form onSubmit={login} className="space-y-4" noValidate>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">メールアドレス</label>
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
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">パスワード</label>
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

                        <Link
                            href="/signup"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:hover:bg-gray-800"
                        >
                            <span>新規アカウントの作成</span>
                        </Link>
                    </form>

                    {/* ローカル環境限定のデバッグボタン群 */}
                    {isLocal && (
                        <div className="mt-6">
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Debug (local only)</div>
                            <div className="grid grid-cols-2 gap-2">
                                <button className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition" onClick={me}>状態確認</button>
                                <button className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition" onClick={callProtected}>保護POST</button>
                                <button className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition" onClick={refresh}>リフレッシュ</button>
                                <button className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition" onClick={logout}>ログアウト</button>
                            </div>

                            {msg && <p className="mt-4 text-sm text-gray-700 dark:text-gray-300">{msg}</p>}
                        </div>
                    )}
                </div>

                {/* 規約とプライバシーへのリンク */}
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    ログインすると{' '}
                    <Link href="/terms" className="underline underline-offset-2 hover:opacity-80">利用規約</Link>{' '}
                    と{' '}
                    <Link href="/privacy" className="underline underline-offset-2 hover:opacity-80">プライバシー</Link>{' '}
                    に同意したものとみなされます。
                </p>
            </div>
        </main>
    );
}
