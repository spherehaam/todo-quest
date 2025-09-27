'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { showToast } from '@/components/toast';

/**
 * 新規アカウント作成ページ（フロントエンド）
 * - TSX 単一ファイル
 * - バリデーション/エラーハンドリング/送信中状態/CSRF 対応
 * - Tailwind を前提にした簡易 UI
 *
 * 想定 API: POST /api/auth/signup
 *  Body: { email, username, password }
 *  Header: 'X-CSRF-Token': <csrf_cookie>
 *  Response(OK): { ok: true }
 *  Response(NG): { ok: false, error: string, detail?: string }
 */

/** Cookie を安全に取得（URL エンコード考慮） */
function readCookie(name: string) {
    const raw = typeof document !== 'undefined'
        ? document.cookie
              .split('; ')
              .find((row) => row.startsWith(name + '='))
              ?.split('=')[1]
        : undefined;
    return raw ? decodeURIComponent(raw) : undefined;
}

/** サーバーの JSON を安全に読み取り */
async function parseJsonSafe<T = unknown>(res: Response): Promise<T | null> {
    try {
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

/** Email 形式の簡易チェック */
function isEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function SignupPage() {
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');

    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState('');

    const emailRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // 初回フォーカス
        emailRef.current?.focus();
    }, []);

    /** 入力バリデーション */
    const errors = useMemo(() => {
        const e: string[] = [];
        if (!email || !isEmail(email)) e.push('メールアドレスの形式が正しくありません。');
        if (!username || username.trim().length < 3) e.push('ユーザー名は3文字以上で入力してください。');
        if (!password || password.length < 8) e.push('パスワードは8文字以上で入力してください。');
        if (password !== confirm) e.push('パスワード（確認）が一致しません。');
        return e;
    }, [email, username, password, confirm]);

    const canSubmit = errors.length === 0 && !submitting;

    const onSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setMsg('');
        if (!canSubmit) {
            showToast({ type: 'warning', message: '入力内容を確認してください。' });
            return;
        }
        setSubmitting(true);
        try {
            const csrf = readCookie('csrf_token');
            const res = await fetch('/api/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
                },
                body: JSON.stringify({ email, username, password }),
            });

            if (!res.ok) {
                const json = await parseJsonSafe<{ ok: false; error: string; detail?: string }>(res);
                const text = !json ? await res.text().catch(() => '') : '';
                const message = ((json?.error ?? text) || `Failed (${res.status})`) + (json?.detail ? `: ${json.detail}` : '');
                showToast({ type: 'error', message });
                setMsg(message);
                return;
            }

            showToast({ type: 'success', message: 'アカウントを作成しました。ログインしてください。' });
            router.replace('/login');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'signup_failed';
            showToast({ type: 'error', message });
            setMsg(message);
        } finally {
            setSubmitting(false);
        }
    }, [canSubmit, email, username, password, router]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 dark:from-slate-950 dark:to-slate-900">
            <div className="mx-auto max-w-md px-4 py-10">
                <div className="mb-8 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">新規アカウント作成</h1>
                    <p className="mt-2 text-sm text-slate-500">必要事項を入力して「作成」ボタンを押してください。</p>
                </div>

                <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium">メールアドレス</label>
                        <input
                            id="email"
                            ref={emailRef}
                            type="email"
                            autoComplete="email"
                            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-0 focus:border-slate-400 focus:ring-0 dark:border-slate-700 dark:bg-slate-900"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="username" className="block text-sm font-medium">ユーザー名</label>
                        <input
                            id="username"
                            type="text"
                            autoComplete="username"
                            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-0 focus:border-slate-400 focus:ring-0 dark:border-slate-700 dark:bg-slate-900"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            minLength={3}
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium">パスワード</label>
                        <div className="mt-2 flex items-center gap-2">
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="new-password"
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-0 focus:border-slate-400 focus:ring-0 dark:border-slate-700 dark:bg-slate-900"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                minLength={8}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="whitespace-nowrap rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                            >
                                {showPassword ? '隠す' : '表示'}
                            </button>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">8文字以上を推奨（英数字記号の組み合わせ）</p>
                    </div>

                    <div>
                        <label htmlFor="confirm" className="block text-sm font-medium">パスワード（確認）</label>
                        <input
                            id="confirm"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-0 focus:border-slate-400 focus:ring-0 dark:border-slate-700 dark:bg-slate-900"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            minLength={8}
                            required
                        />
                    </div>

                    {errors.length > 0 && (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                            <ul className="list-disc pl-5">
                                {errors.map((e, i) => (
                                    <li key={i}>{e}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {msg && (
                        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                            {msg}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
                    >
                        {submitting ? '作成中…' : '作成する'}
                    </button>

                    <p className="text-center text-sm text-slate-500">
                        すでにアカウントをお持ちの方は{' '}
                        <Link className="underline" href="/login">ログイン</Link>
                    </p>
                </form>

                {/* 規約とプライバシーへのリンク */}
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    ログインすると{' '}
                    <Link href="/terms" className="underline underline-offset-2 hover:opacity-80">利用規約</Link>{' '}
                    と{' '}
                    <Link href="/privacy" className="underline underline-offset-2 hover:opacity-80">プライバシー</Link>{' '}
                    に同意したものとみなされます。
                </p>
            </div>
        </div>
    );
}
