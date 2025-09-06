'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** タスクの型定義 */
type Task = {
    id: string;
    title: string;
    description?: string | null;
    due_date?: string | null;
    status: 'open' | 'in_progress' | 'done';
    created_at: string;
    contractor: string;
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
    if (!input) {
        return '-';
    }

    const d = new Date(input);

    if (isNaN(d.getTime())) {
        return '-';
    }

    return d.toLocaleString();
}

/** 日付のみの整形（不正値は "-"） */
function fmtDateOnly(input?: string | null): string {
    if (!input) {
        return '-';
    }

    const d = new Date(input);

    if (isNaN(d.getTime())) {
        return '-';
    }

    return d.toLocaleDateString();
}

/** ===== ステータス編集用 追加分（既存に影響しない形で定義） ===== */
type TaskStatus = 'open' | 'in_progress' | 'done';

const STATUS_LABEL: Record<TaskStatus, string> = {
    open: '未完了',
    in_progress: '進行中',
    done: '完了',
};

const ALL_STATUSES: TaskStatus[] = ['open', 'in_progress', 'done'];

/** ステータス更新API（/api/tasks/[id]/status に PATCH を想定） */
async function updateTaskStatus(taskId: string, next: TaskStatus) {
    const res = await fetch(`/api/tasks/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': readCookie('csrf_token') ?? '',
        },
        credentials: 'include',
        body: JSON.stringify({ taskId: taskId, status: next }),
    });
    if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `Failed to update status (${res.status})`);
    }
    const json = await res.json().catch(() => ({}));
    return json as { status: TaskStatus };
}

/** ステータスセル（クリックでセレクトに切替 → 楽観的更新） */
function StatusCell(props: {
    taskId: string;
    value: TaskStatus;
    onLocalChange: (next: TaskStatus) => void;
    onRevert: (prev: TaskStatus) => void;
}) {
    const { taskId, value, onLocalChange, onRevert } = props;
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    function handleKeyDown(e: React.KeyboardEvent) {
        if (!editing) return;
        if (e.key === 'Escape') {
            setEditing(false);
        }
    }

    async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const next = e.target.value as TaskStatus;
        if (next === value) {
            setEditing(false);
            return;
        }
        const prev = value;
        onLocalChange(next); // 楽観的更新
        setSaving(true);
        try {
            await updateTaskStatus(taskId, next);
        } catch (err) {
            onRevert(prev); // 失敗時ロールバック
            console.error(err);
            alert('ステータスの更新に失敗しました。');
        } finally {
            setSaving(false);
            setEditing(false);
        }
    }

    if (!editing) {
        return (
            <button
                type="button"
                className="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition text-left w-full"
                onClick={() => setEditing(true)}
                onKeyDown={handleKeyDown}
                aria-label={`ステータスを編集: 現在は ${STATUS_LABEL[value]}`}
            >
                {STATUS_LABEL[value]}
            </button>
        );
    }

    return (
        <select
            className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1"
            autoFocus
            defaultValue={value}
            onChange={handleChange}
            onBlur={() => setEditing(false)}
            disabled={saving}
            onKeyDown={handleKeyDown}
            aria-label="ステータスを選択"
        >
            {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                </option>
            ))}
        </select>
    );
}
/** ===== ここまで追加分 ===== */

export default function HomePage() {
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState<Task[]>([]);

    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newDueLocal, setNewDueLocal] = useState('');
    const [newStatus, setNewStatus] = useState<'open' | 'in_progress' | 'done'>('open');

    const [msg, setMsg] = useState('');
    const [users, setUsers] = useState<Users[]>([]);
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

            // 2) ユーザー取得（配列を返す）
            const usersFetched = await fetchUsers();

            // 3) タスク一覧取得
            if (usersFetched.length > 0) {
                await fetchTasks(usersFetched[0].id);
            }

            setLoading(false);
        }

        async function fetchTasks(contractor?: string) {
            const url = contractor
                ? `/api/tasks?contractor=${encodeURIComponent(contractor)}`
                : `/api/tasks`;

            const res = await fetch(url, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setTasks(data.tasks ?? []);
            } else {
                setTasks([]);
            }
        }

        async function fetchUsers(): Promise<Array<{ id: string }>> {
            const res = await fetch('/api/users', { credentials: 'include' });
            if (!res.ok) {
                setUsers([]);
                return [];
            }
            const data = await res.json();
            setUsers(data.users ?? []);
            return data.users ?? [];     // ← 呼び出し元で即使える
        }

        bootstrap();
    }, [router]);

    // 状態が更新された「後」の users を見たい場合は、別の useEffect でログ
    useEffect(() => {
        if (users.length > 0) {
            console.log('users (state changed):', users);
            console.log('users[0].id:', users[0].id);
        }
    }, [users]);

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
            status: newStatus
        };

        const description = newDescription.trim();
        if (description) {
            payload.description = description;
        }

        if (newDueLocal) {
            const d = new Date(newDueLocal);
            if (!isNaN(d.getTime())) {
                payload.due_date = d.toISOString();
            }
        }

        payload.contractor = users[0].id;

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
            setNewDescription('');
            setNewDueLocal('');
            setNewStatus('open');
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
                        <button onClick={logout} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800">
                            ログアウト
                        </button>
                    </div>
                </div>
            </header>

            {/* ===== シェル（サイドバー + メイン） ===== */}
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                {/* ===== サイドバー ===== */}
                <aside className="sticky top-16 hidden h[calc(100vh-5rem)] rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:block">
                    <nav className="space-y-1">
                        <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                            メニュー
                        </div>
                        <a href="/home"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                            <span>📋</span> <span>ホーム</span>
                        </a>
                        <a href="/bbs"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                            <span>📋</span> <span>タスク掲示板</span>
                        </a>
                        {/* <a href="/terms"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                            <span>📄</span> <span>利用規約</span>
                        </a> */}
                        {/* <a href="/privacy"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
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
                            <input className="sm:col-span-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950"
                                placeholder="タイトル"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}/>
                            <input className="sm:col-span-5 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950"
                                placeholder="詳細（任意）"
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}/>
                            <input type="date"
                                className="sm:col-span-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950 dark:[&::-webkit-calendar-picker-indicator]:invert"
                                value={newDueLocal}
                                onChange={(e) => setNewDueLocal(e.target.value)}/>

                            {/* 2行目 */}
                            <select className="sm:col-span-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 ring-indigo-500/20 dark:border-gray-800 dark:bg-gray-950"
                                value={newStatus}
                                onChange={(e) => setNewStatus(e.target.value as 'open' | 'in_progress' | 'done')}>
                                <option value="open">未完了</option>
                                <option value="in_progress">進行中</option>
                                <option value="done">完了</option>
                            </select>
                        </div>

                        <div className="mt-3">
                            <button onClick={addTask}
                                className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99]">
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
                                        <th className="px-4 py-2 text-left">ステータス</th>
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
                                        <tr key={t.id} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-950'}>
                                            <td className="px-4 py-3">{t.title}</td>
                                            <td className="px-4 py-3">{t.description ?? '-'}</td>
                                            <td className="px-4 py-3">{fmtDateOnly(t.due_date)}</td>
                                            <td className="px-4 py-3">
                                                <StatusCell
                                                    taskId={t.id}
                                                    value={t.status}
                                                    onLocalChange={(next) => {
                                                        setTasks((prev) =>
                                                            prev.map((x) =>
                                                                x.id === t.id ? { ...x, status: next } : x
                                                            )
                                                        );
                                                    }}
                                                    onRevert={(prevStatus) => {
                                                        setTasks((prev) =>
                                                            prev.map((x) =>
                                                                x.id === t.id ? { ...x, status: prevStatus } : x
                                                            )
                                                        );
                                                    }}
                                                />
                                            </td>
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
