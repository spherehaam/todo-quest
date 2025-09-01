'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** タスクの型定義 */
type Task = {
    id: string;
    title: string;
    details?: string | null;
    due_date?: string | null;
    done: boolean;
    created_at: string;
};

type Users = {
    id: string;
    username: string;
    level: number;
    exp: number;
};

/** クッキーから値を取得 */
function readCookie(name: string) {
    return document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + '='))
        ?.split('=')[1];
}

/** 日時文字列の整形（ISO/任意→ローカル表示）。不正値は "-" 表示 */
function fmtDate(input?: string | null): string {
    if (!input) return '-';
    const d = new Date(input);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString();
}

export default function HomePage() {
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState<Task[]>([]);

    const [newTitle, setNewTitle] = useState('');
    const [newDetails, setNewDetails] = useState('');
    const [newDueLocal, setNewDueLocal] = useState('');
    const [newDone, setNewDone] = useState(false);

    const [msg, setMsg] = useState('');
    const [users, serUsers] = useState<Users[]>([]);
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

            await fetchUsers();
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

        async function fetchUsers() {
            const res = await fetch('/api/users', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                serUsers(data.users ?? []);
            } else {
                serUsers([]);
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
        const payload: Record<string, unknown> = {
            title,
            done: newDone
        };

        const details = newDetails.trim();
        if (details) payload.details = details;

        if (newDueLocal) {
            const d = new Date(newDueLocal);
            if (!isNaN(d.getTime())) {
                payload.due_date = d.toISOString();
            }
        }

        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrf
            },
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
            setTasks((prev) => [data.task as Task, ...prev]);
            setNewTitle('');
            setNewDetails('');
            setNewDueLocal('');
            setNewDone(false);
            setMsg('追加しました');
        } else {
            setMsg(`追加に失敗: ${data.error ?? 'unknown error'}`);
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

                    {/* ユーザー */}
                    {/* <div className="flex items-center gap-2">
                        レベル
                        {users.map((u, idx) => (
                            <p key={u.id}>{u.level}　　経験値 {u.exp} / {u.exp}</p>
                            // <div key={u.id}>{u.id} : {u.username} : {u.level} : {u.exp} : {idx}</div>
                        ))}
                    </div> */}

                    {/* ログアウト */}
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
                <aside className="sticky top-16 hidden h[calc(100vh-5rem)] rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:block">
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
                        {/* <a
                            href="/terms"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            <span>📄</span> <span>利用規約</span>
                        </a> */}
                        {/* <a
                            href="/privacy"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            <span>🔒</span> <span>プライバシー</span>
                        </a> */}

                        <div className="my-3 border-t border-dashed border-gray-200 dark:border-gray-800" />

                    </nav>
                </aside>

                {/* ===== メインコンテンツ ===== */}
                <main className="space-y-4">
                    {/* 入力フォーム */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                        <h1 className="text-lg font-semibold mb-2">ようこそ、{email} さん</h1>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                            {/* 1行目 */}
                            <input
                                className="sm:col-span-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950"
                                placeholder="タイトル"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                            />
                            <input
                                className="sm:col-span-5 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950"
                                placeholder="詳細（任意）"
                                value={newDetails}
                                onChange={(e) => setNewDetails(e.target.value)}
                            />
                            <input
                                type="date"
                                className="sm:col-span-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950
                                           dark:[&::-webkit-calendar-picker-indicator]:invert"
                                value={newDueLocal}
                                onChange={(e) => setNewDueLocal(e.target.value)}
                            />

                            {/* 2行目 */}
                            <select
                                className="sm:col-span-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 ring-indigo-500/20 dark:border-gray-800 dark:bg-gray-950"
                                value={newDone ? 'true' : 'false'}
                                onChange={(e) => setNewDone(e.target.value === 'true')}
                            >
                                <option value="false">未完了</option>
                                <option value="true">完了</option>
                            </select>
                        </div>

                        <div className="mt-3">
                            <button
                                onClick={addTask}
                                className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99]"
                            >
                                追加する
                            </button>
                        </div>

                        {msg && (
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{msg}</p>
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
                                        <th className="px-4 py-2 text-left">タイトル</th>
                                        <th className="px-4 py-2 text-left">詳細</th>
                                        <th className="px-4 py-2 text-left">期限</th>
                                        <th className="px-4 py-2 text-left">完了</th>
                                        <th className="px-4 py-2 text-left">作成日時</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tasks.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                                                タスクはまだありません。
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
                                            <td className="px-4 py-3">{t.title}</td>
                                            <td className="px-4 py-3">{t.details ?? '-'}</td>
                                            <td className="px-4 py-3">{fmtDate(t.due_date)}</td>
                                            <td className="px-4 py-3">{t.done ? '✔︎' : '—'}</td>
                                            <td className="px-4 py-3">{fmtDate(t.created_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}
