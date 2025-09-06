'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

/** Cookie 取得ユーティリティ（存在しない場合は undefined） */
function readCookie(name: string) {
    return document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + '='))
        ?.split('=')[1];
}

//  ローカル環境判定（localhost/127.*/::1/192.168.* 等）
function useIsLocalhost() {
    const [isLocal, setIsLocal] = useState(false);
    useEffect(() => {
        const h = window.location.hostname;
        const local =
            h === 'localhost' ||
            h === '::1' ||
            /^127\./.test(h) ||
            /^192\.168\./.test(h) ||
            /^10\./.test(h);
        setIsLocal(local);
    }, []);
    return isLocal;
}

/** fetch のレスポンスを安全に JSON へ（失敗時は {}） */
async function safeJson(res: Response): Promise<any> {
    try {
        return await res.json();
    } catch {
        return {};
    }
}

export default function Page() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [msg, setMsg] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [msgTone, setMsgTone] = useState<'neutral' | 'success' | 'error'>('neutral');

    const router = useRouter();
    const isLocal = useIsLocalhost();

    // アンマウント時に進行中のリクエストを中断するための AbortController
    const abortRef = useRef<AbortController | null>(null);
    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    /** メッセージ表示の共通関数（ARIA ライブリージョンで音声読み上げも想定） */
    const showMessage = useCallback((text: string, tone: 'neutral' | 'success' | 'error' = 'neutral') => {
        setMsgTone(tone);
        setMsg(text);
    }, []);

    /** ログイン処理 */
    const login = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        // 多重送信の抑止
        if (submitting) return;

        // 最小バリデーション（メールとパスワードの空チェック）
        if (!email || !password) {
            showMessage('メールアドレスとパスワードを入力してください。', 'error');
            return;
        }

        try {
            setSubmitting(true);
            showMessage('ログイン中…', 'neutral');

            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password }),
                signal: controller.signal
            });

            const data = await safeJson(res);

            if (res.ok) {
                // 成功時は戻るでログイン画面に戻らないよう replace
                showMessage('ログインに成功しました。', 'success');
                router.replace('/home');
            } else {
                // サーバーが返すエラー文言をそのまま出すのが望ましくない場合は、汎用メッセージに差し替える
                showMessage(data?.error ?? 'ログインに失敗しました。もう一度お試しください。', 'error');
            }
        } catch (err: unknown) {
            // Abort はユーザー操作/遷移に伴う正当なケースなのでメッセージは控えめに
            if ((err as any)?.name !== 'AbortError') {
                showMessage('通信に失敗しました。ネットワークをご確認ください。', 'error');
            }
        } finally {
            setSubmitting(false);
        }
    }, [email, password, router, showMessage, submitting]);

    /** セッション状態確認（デバッグ） */
    const me = useCallback(async () => {
        try {
            showMessage('状態確認中…', 'neutral');

            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            const res = await fetch('/api/me', { credentials: 'include', signal: controller.signal });
            const data = await safeJson(res);
            if (res.ok) {
                showMessage(`ログイン中: ${data.email ?? '(メール不明)'}`, 'success');
            } else {
                showMessage('未ログイン', 'error');
            }
        } catch (err: unknown) {
            if ((err as any)?.name !== 'AbortError') {
                showMessage('状態確認に失敗しました。', 'error');
            }
        }
    }, [showMessage]);

    /** CSRF Cookie が無い場合のフォールバック */
    function getCsrf(): string | undefined {
        return readCookie('csrf_token') || undefined;
    }

    /** 保護 API 呼び出し（デバッグ） */
    const callProtected = useCallback(async () => {
        try {
            showMessage('保護API呼び出し中…', 'neutral');

            const csrf = getCsrf();
            if (!csrf) {
                showMessage('CSRFトークンが見つかりません。先にログイン/リフレッシュを試してください。', 'error');
                return;
            }

            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            const res = await fetch('/api/protected', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf
                },
                credentials: 'include',
                body: JSON.stringify({}),
                signal: controller.signal
            });
            const data = await safeJson(res);
            if (res.ok) {
                showMessage(`Protected OK: ${data?.data ?? '(no payload)'}`, 'success');
            } else {
                showMessage(`Protected NG: ${data?.error ?? 'エラー'}`, 'error');
            }
        } catch (err: unknown) {
            if ((err as any)?.name !== 'AbortError') {
                showMessage('保護APIの呼び出しに失敗しました。', 'error');
            }
        }
    }, [showMessage]);

    /** アクセストークンのリフレッシュ（デバッグ） */
    const refresh = useCallback(async () => {
        try {
            const csrf = getCsrf();
            if (!csrf) {
                showMessage('CSRFトークンが見つかりません。ログインしてください。', 'error');
                return;
            }

            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            const res = await fetch('/api/refresh', {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrf },
                credentials: 'include',
                signal: controller.signal
            });
            showMessage(res.ok ? 'アクセストークンを更新しました。' : 'アクセストークンの更新に失敗しました。', res.ok ? 'success' : 'error');
        } catch (err: unknown) {
            if ((err as any)?.name !== 'AbortError') {
                showMessage('更新リクエストに失敗しました。', 'error');
            }
        }
    }, [showMessage]);

    /** ログアウト（デバッグ） */
    const logout = useCallback(async () => {
        try {
            const csrf = getCsrf();
            if (!csrf) {
                showMessage('CSRFトークンが見つかりません。', 'error');
                return;
            }

            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            await fetch('/api/logout', {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrf },
                credentials: 'include',
                signal: controller.signal
            });
            showMessage('ログアウトしました。', 'success');
        } catch (err: unknown) {
            if ((err as any)?.name !== 'AbortError') {
                showMessage('ログアウトに失敗しました。', 'error');
            }
        }
    }, [showMessage]);

    return (
        <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-950 dark:to-black">
            <div className="mx-auto max-w-md px-4 py-16">
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

                <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 backdrop-blur p-6 shadow-sm">
                    <form onSubmit={login} className="space-y-4" noValidate>
                        <div>
                            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                メールアドレス
                            </label>
                            <input
                                id="email"
                                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-black/10 dark:focus:ring-white/10 transition"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                autoComplete="username"
                                inputMode="email"
                                required
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                パスワード
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
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
                                    aria-pressed={showPassword}
                                >
                                    {showPassword ? '隠す' : '表示'}
                                </button>
                            </div>
                        </div>

                        <button
                            className="w-full rounded-xl bg-black text-white py-3 font-medium shadow-sm hover:shadow-md active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed"
                            disabled={submitting}
                            type="submit"
                        >
                            {submitting ? 'ログイン中…' : 'ログイン'}
                        </button>
                    </form>

                    {/* メッセージはライブリージョンでアクセシビリティ対応 */}
                    {!!msg && (
                        <p
                            className={`mt-4 text-sm ${
                                msgTone === 'success'
                                    ? 'text-emerald-700 dark:text-emerald-300'
                                    : msgTone === 'error'
                                    ? 'text-rose-700 dark:text-rose-300'
                                    : 'text-gray-700 dark:text-gray-300'
                            }`}
                            role="status"
                            aria-live="polite"
                        >
                            {msg}
                        </p>
                    )}

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
                        </div>
                    )}
                </div>

                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    ログインすると <a href="/terms" className="underline">利用規約</a> と
                    <a href="/privacy" className="underline ml-1">プライバシー</a> に同意したものとみなされます。
                </p>
            </div>
        </main>
    );
}