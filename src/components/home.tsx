'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** タスクの型定義 */
type Task = {
    id: string;
    title: string;
    done: boolean;
    created_at: string;
};

/** クッキーから値を取得 */
function readCookie(name: string) {
    return document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + '='))
        ?.split('=')[1];
}

/**
 * ホーム画面（ログイン後専用）
 * - 画面構成：ヘッダー / サイドバー / メイン
 * - 既存の API 呼び出しと CSRF ロジックは維持
 */
export default function HomePage() {
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [newTitle, setNewTitle] = useState('');
    const [msg, setMsg] = useState('');
    const router = useRouter();

    useEffect(() => {
        async function bootstrap() {
            // 1) 認証確認
            const meRes = await fetch('/api/me', { credentials: 'include' });
            if (!meRes.ok) {
                router.push('/');
                return;
            }
            const me = await meRes.json();
            setEmail(me.email);

            // 2) タスク一覧取得
            await fetchTasks();
            setLoading(false);
        }

        async function fetchTasks() {
            const res = await fetch('/api/tasks', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setTasks(data.tasks ?? []);
            } else {
                setTasks([]);
            }
        }

        bootstrap();
    }, [router]);

    /** タスク追加 */
    async function addTask() {
        const title = newTitle.trim();
        if (!title) {
            setMsg('タイトルを入力してください');
            return;
        }
        const csrf = readCookie('csrf_token') ?? '';
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrf
            },
            credentials: 'include',
            body: JSON.stringify({ title })
        });
        const data = await res.json();
        if (res.ok) {
            setTasks((prev) => [data.task, ...prev]);
            setNewTitle('');
            setMsg('追加しました');
        } else {
            setMsg(`追加に失敗: ${data.error}`);
        }
    }

    /** ログアウト */
    async function logout() {
        const csrf = readCookie('csrf_token') ?? '';
        await fetch('/api/logout', {
            method: 'POST',
            headers: { 'X-CSRF-Token': csrf },
            credentials: 'include'
        });
        router.push('/');
    }

    if (loading) {
        return (
            <main className="mx-auto mt-10 max-w-md p-4">
                <p>読み込み中...</p>
            </main>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
            {/* ===== ヘッダー ===== */}
            <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-900/70">
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                    {/* ロゴ / ブランド */}
                    <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600" />
                        <span className="text-sm font-semibold tracking-wide">
                            TodoQuest
                        </span>
                    </div>

                    {/* ユーザー / ログアウト */}
                    <div className="flex items-center gap-3">
                        <span className="hidden text-xs text-gray-500 dark:text-gray-400 sm:inline">
                            {email ?? 'Guest'}
                        </span>
                        <button
                            onClick={logout}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                        >
                            ログアウト
                        </button>
                    </div>
                </div>
            </header>

            {/* ===== シェル（サイドバー + メイン） ===== */}
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                {/* ===== サイドバー（sm以上で表示） ===== */}
                <aside className="sticky top-16 hidden h-[calc(100vh-5rem)] rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:block">
                    <nav className="space-y-1">
                        <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                            メニュー
                        </div>
                        <a
                            href="/home"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            <span>📋</span> <span>タスク</span>
                        </a>
                        <a
                            href="/terms"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            <span>📄</span> <span>利用規約</span>
                        </a>
                        <a
                            href="/privacy"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            <span>🔒</span> <span>プライバシー</span>
                        </a>

                        <div className="my-3 border-t border-dashed border-gray-200 dark:border-gray-800" />

                        <button
                            onClick={logout}
                            className="flex w-full items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:bg-gray-800/60 dark:hover:bg-gray-800"
                        >
                            <span className="flex items-center gap-2">
                                <span>🚪</span> <span>ログアウト</span>
                            </span>
                            <span className="text-[10px] text-gray-400">Ctrl+L</span>
                        </button>
                    </nav>
                </aside>

                {/* ===== メインコンテンツ ===== */}
                <main className="space-y-4">
                    {/* ウェルカム / アクションバー */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <h1 className="text-lg font-semibold">ようこそ、{email} さん</h1>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    今日のタスクを追加・管理しましょう
                                </p>
                            </div>
                        </div>

                        {/* 追加フォーム */}
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                                className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950"
                                placeholder="新しいタスクのタイトルを入力…（例：仕様書のレビュー）"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') addTask();
                                }}
                            />
                            <button
                                onClick={addTask}
                                className="whitespace-nowrap rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99]"
                            >
                                追加する
                            </button>
                        </div>

                        {msg && (
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                {msg}
                            </p>
                        )}
                    </section>

                    {/* タスク一覧 */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-0 dark:border-gray-800 dark:bg-gray-900">
                        <div className="border-b border-gray-200 p-4 dark:border-gray-800">
                            <h2 className="text-sm font-semibold">タスク一覧</h2>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr className="bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                        <th className="border-b border-gray-200 px-4 py-2 text-left dark:border-gray-800">
                                            タイトル
                                        </th>
                                        <th className="border-b border-gray-200 px-4 py-2 text-left dark:border-gray-800">
                                            完了
                                        </th>
                                        <th className="border-b border-gray-200 px-4 py-2 text-left dark:border-gray-800">
                                            作成日時
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-900 dark:text-gray-100">
                                    {tasks.length === 0 && (
                                        <tr>
                                            <td className="px-4 py-6 text-center text-gray-500 dark:text-gray-400" colSpan={3}>
                                                タスクはまだありません。上のフォームから追加してください。
                                            </td>
                                        </tr>
                                    )}
                                    {tasks.map((t, idx) => (
                                        <tr
                                            key={t.id}
                                            className={idx % 2 === 0
                                                ? 'bg-white dark:bg-gray-900'
                                                : 'bg-gray-50 dark:bg-gray-950'}
                                        >
                                            <td className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
                                                {t.title}
                                            </td>
                                            <td className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
                                                {t.done ? '✔︎' : '—'}
                                            </td>
                                            <td className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
                                                {new Date(t.created_at).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* フッター */}
                    <footer className="px-1 py-6 text-center text-[11px] text-gray-500 dark:text-gray-500">
                        このアプリは学習目的のデモです。ログインすると利用規約に同意したものとみなされます。&nbsp;
                        <a href="/terms" className="underline hover:no-underline">利用規約</a>
                        <span className="mx-1">/</span>
                        <a href="/privacy" className="underline hover:no-underline">プライバシー</a>
                    </footer>
                </main>
            </div>
        </div>
    );
}
