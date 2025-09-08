'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/** ステータス型：先に宣言しておくと Task 型定義で参照しやすい */
type TaskStatus = 'open' | 'in_progress' | 'done';

type Task = {
    id: string;
    title: string;
    description?: string;
    due_date?: string;        // APIが date 文字列（YYYY-MM-DD）を想定するならその形式を入れる
    status: TaskStatus;
    created_at: string;
    contractor?: string;
};

/** 新規作成ペイロード（id/created_at はサーバー側で付与） */
type NewTaskPayload = Omit<Task, 'id' | 'created_at'>;

type Users = {
    id: string;
    username?: string;
    level?: number;
    exp?: number;
};

/** クッキー取得（URLエンコードを考慮して decode） */
function readCookie(name: string) {
    const raw = document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + '='))
        ?.split('=')[1];
    return raw ? decodeURIComponent(raw) : undefined;
}

/**
 * Dateオブジェクト → YYYY-MM-DD（ローカル日付）のヘルパー
 * - サーバーが date 型（時刻なし）を期待するケースに合わせる
 * - もし ISO8601（toISOString）をサーバーが期待するなら、この関数は使わず ISO を送る
 */
function toYmdLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** 日時表示（ローカル）。不正値は '-' 表示 */
function fmtDate(input?: string | null): string {
    if (!input) return '-';
    const d = new Date(input);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString();
}

/** 日付のみ表示（ローカル）。不正値は '-' 表示 */
function fmtDateOnly(input?: string | null): string {
    if (!input) return '-';
    const d = new Date(input);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString();
}

const STATUS_LABEL: Record<TaskStatus, string> = {
    open: '未完了',
    in_progress: '進行中',
    done: '完了',
};

const ALL_STATUSES: TaskStatus[] = ['open', 'in_progress', 'done'];

/** ステータス更新API呼び出し。失敗時は例外を投げる（呼び出し側でロールバック） */
async function updateTaskStatus(taskId: string, next: TaskStatus) {
    const res = await fetch(`/api/tasks/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': readCookie('csrf_token') ?? '',
        },
        credentials: 'include',
        body: JSON.stringify({ taskId, status: next }),
    });
    if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `Failed to update status (${res.status})`);
    }
    const json = await res.json().catch(() => ({}));
    return json as { status: TaskStatus };
}

/**
 * ステータスのインライン編集セル
 * - 先にローカル更新し、API失敗時に onRevert で戻す（楽観UI + ロールバック）
 */
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

        // 楽観更新 → API → 失敗時ロールバック
        onLocalChange(next);
        setSaving(true);
        try {
            await updateTaskStatus(taskId, next);
        } catch (err) {
            onRevert(prev);
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
                className="w-full rounded px-2 py-1 text-left transition hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 rounded-sm"
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
            className="w-full rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
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

/** ヘッダー下のシマー */
function ShimmerBar() {
    return (
        <div className="h-1 w-full overflow-hidden rounded-full bg-gradient-to-r from-indigo-100 via-blue-100 to-indigo-100 dark:from-indigo-900/40 dark:via-blue-900/40 dark:to-indigo-900/40">
            <div className="h-full w-1/3 animate-[shimmer_1.8s_infinite] rounded-full bg-gradient-to-r from-indigo-400/50 via-blue-400/60 to-indigo-400/50 dark:from-indigo-500/50 dark:via-blue-500/60 dark:to-indigo-500/50" />
            <style jsx>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(300%); }
                }
            `}</style>
        </div>
    );
}

/** サイドバーのスケルトン */
function SkeletonSidebar() {
    return (
        <aside className="sticky top-16 hidden h-[calc(100vh-5rem)] rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:block">
            <div className="space-y-2">
                <div className="px-2 pb-2">
                    <div className="h-3 w-16 animate-pulse rounded bg-gray-200/80 dark:bg-gray-700/60" />
                </div>
                <div className="h-8 w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
                <div className="h-8 w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
                <div className="my-3 h-px w-full bg-dashed bg-[length:8px_1px] bg-left bg-repeat-x [background-image:linear-gradient(to_right,rgba(0,0,0,.15)_50%,transparent_0)] dark:[background-image:linear-gradient(to_right,rgba(255,255,255,.15)_50%,transparent_0)]" />
            </div>
        </aside>
    );
}

/** 入力フォームのスケルトン */
function SkeletonForm() {
    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-3 h-5 w-56 animate-pulse rounded bg-gray-200/80 dark:bg-gray-700/60" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <div className="sm:col-span-3 h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
                <div className="sm:col-span-5 h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
                <div className="sm:col-span-3 h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
                <div className="sm:col-span-3 h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
            </div>
            <div className="mt-3 h-10 w-28 animate-pulse rounded-lg bg-gradient-to-r from-indigo-300 to-violet-300 dark:from-indigo-700 dark:to-violet-700" />
        </section>
    );
}

/** タスクテーブルのスケルトン */
function SkeletonTable() {
    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-0 dark:border-gray-800 dark:bg-gray-900">
            <div className="border-b border-gray-200 p-4 dark:border-gray-800">
                <div className="h-4 w-24 animate-pulse rounded bg-gray-200/80 dark:bg-gray-700/60" />
            </div>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            {[...Array(5)].map((_, i) => (
                                <th key={i} className="px-4 py-2 text-left">
                                    <div className="h-3 w-16 animate-pulse rounded bg-gray-200/80 dark:bg-gray-700/60" />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {[...Array(5)].map((_, row) => (
                            <tr key={row} className={row % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-950'}>
                                {[...Array(5)].map((__, col) => (
                                    <td key={col} className="px-4 py-3">
                                        <div className="h-4 w-40 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default function HomePage() {
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState<Task[]>([]);

    // 新規作成フォーム
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newDueLocal, setNewDueLocal] = useState(''); // <input type="date"> の値（YYYY-MM-DD）
    const [newStatus, setNewStatus] = useState<TaskStatus>('open');

    const [msg, setMsg] = useState('');
    const [users, setUsers] = useState<Users[]>([]);
    const router = useRouter();

    useEffect(() => {
        async function bootstrap() {
            try {
                // 1) 自分情報
                const meRes = await fetch('/api/me', { credentials: 'include' });
                if (!meRes.ok) {
                    router.push('/');
                    return;
                }
                const me = await meRes.json();
                setEmail(me.email);

                // 2) ユーザー一覧
                const usersFetched = await fetchUsers();

                // 3) デフォルトで先頭ユーザーのタスクを読む（必要なら UX に合わせて選択式へ）
                if (usersFetched.length > 0) {
                    await fetchTasks(usersFetched[0].id);
                }
            } catch (e) {
                console.error('bootstrap failed:', e);
                setTasks([]);
                setUsers([]);
            } finally {
                setLoading(false);
            }
        }

        async function fetchTasks(contractor?: string) {
            const url = contractor
                ? `/api/tasks?contractor=${encodeURIComponent(contractor)}`
                : `/api/tasks`;

            try {
                const res = await fetch(url, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    setTasks(data.tasks ?? []);
                } else {
                    setTasks([]);
                }
            } catch (e) {
                console.error('fetchTasks failed:', e);
                setTasks([]);
            }
        }

        async function fetchUsers(): Promise<Users[]> {
            try {
                const res = await fetch('/api/users', { credentials: 'include' });
                if (!res.ok) {
                    setUsers([]);
                    return [];
                }
                const data = await res.json();
                const list: Users[] = data.users ?? [];
                setUsers(list);
                return list;
            } catch (e) {
                console.error('fetchUsers failed:', e);
                setUsers([]);
                return [];
            }
        }

        bootstrap();
    }, [router]);

    useEffect(() => {
        // デバッグログ（必要なければ削除OK）
        if (users.length > 0) {
            console.log('users (state changed):', users);
            console.log('users[0].id:', users[0].id);
        }
    }, [users]);

    /** 新規タスク追加（最小バリデーション＋CSRF付与） */
    const addTask = useCallback(async () => {
        const title = newTitle.trim();
        if (!title) {
            setMsg('タイトルを入力してください');
            return;
        }

        const csrf = readCookie('csrf_token') ?? '';

        const payload: NewTaskPayload = {
            title,
            status: newStatus,
        };

        const description = newDescription.trim();
        if (description) {
            payload.description = description;
        }

        // 期限の送信形式について：
        // - サーバーが date（YYYY-MM-DD）を期待 → toYmdLocal を使う
        if (newDueLocal) {
            const d = new Date(newDueLocal);
            if (!isNaN(d.getTime())) {
                payload.due_date = toYmdLocal(d);
            }
        }

        if (users[0]?.id) {
            payload.contractor = users[0].id;
        }

        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf
                },
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            const data = await res.json().catch(() => ({}));
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
        } catch (e) {
            console.error('addTask failed:', e);
            setMsg('追加に失敗: ネットワークエラー');
        }
    }, [newTitle, newDescription, newDueLocal, newStatus, users]);

    /** ログアウト：CSRF付与のうえトップへ */
    const logout = useCallback(async () => {
        const csrf = readCookie('csrf_token') ?? '';
        await fetch('/api/logout', {
            method: 'POST',
            headers: { 'X-CSRF-Token': csrf },
            credentials: 'include'
        });
        router.push('/');
    }, [router]);

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
            <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-900/70">
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
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
                            {loading ? 'Loading…' : (email ?? 'Guest')}
                        </span>
                        <button
                            onClick={logout}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                            disabled={loading}
                            aria-disabled={loading}
                        >
                            ログアウト
                        </button>
                    </div>
                </div>
                {loading && <div className="px-4"><div className="mx-auto max-w-6xl py-1"><ShimmerBar /></div></div>}
            </header>

            {/* ===== シェル（サイドバー + メイン） ===== */}
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                {/* ===== サイドバー ===== */}
                {loading ? (
                    <SkeletonSidebar />
                ) : (
                    <aside className="sticky top-16 hidden h-[calc(100vh-5rem)] rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:block">
                        <nav className="space-y-1" aria-label="サイドバー">
                            <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                メニュー
                            </div>
                            {/* 内部リンクは Link でプリフェッチ */}
                            <Link
                                href="/home"
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 rounded-sm"
                            >
                                <span>📋</span> <span>ホーム</span>
                            </Link>
                            <Link
                                href="/bbs"
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 rounded-sm"
                            >
                                <span>📋</span> <span>タスク掲示板</span>
                            </Link>
                            <div className="my-3 border-t border-dashed border-gray-200 dark:border-gray-800" />
                        </nav>
                    </aside>
                )}

                <main className="space-y-4" aria-busy={loading} aria-live="polite">
                    {loading ? (
                        <>
                            <SkeletonForm />
                            <SkeletonTable />
                        </>
                    ) : (
                        <>
                            {/* 新規タスク作成フォーム */}
                            <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                                <h1 className="mb-2 text-lg font-semibold">ようこそ、{email} さん</h1>

                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                                    <input
                                        className="sm:col-span-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950"
                                        placeholder="タイトル"
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                    />
                                    <input
                                        className="sm:col-span-5 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950"
                                        placeholder="詳細（任意）"
                                        value={newDescription}
                                        onChange={(e) => setNewDescription(e.target.value)}
                                    />
                                    <input
                                        type="date"
                                        className="sm:col-span-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950 dark:[&::-webkit-calendar-picker-indicator]:invert"
                                        value={newDueLocal}
                                        onChange={(e) => setNewDueLocal(e.target.value)}
                                    />

                                    <select
                                        className="sm:col-span-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 focus:ring-2 dark:border-gray-800 dark:bg-gray-950"
                                        value={newStatus}
                                        onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
                                    >
                                        <option value="open">未完了</option>
                                        <option value="in_progress">進行中</option>
                                        <option value="done">完了</option>
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

                            {/* タスク一覧テーブル */}
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
                                                <tr
                                                    key={t.id}
                                                    className={idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-950'}
                                                >
                                                    <td className="px-4 py-3">{t.title}</td>
                                                    <td className="px-4 py-3">{t.description ?? '-'}</td>
                                                    <td className="px-4 py-3">{fmtDateOnly(t.due_date)}</td>
                                                    <td className="px-4 py-3">
                                                        <StatusCell
                                                            taskId={t.id}
                                                            value={t.status}
                                                            onLocalChange={(next) => {
                                                                // 楽観更新：先にローカルを書き換える
                                                                setTasks((prev) =>
                                                                    prev.map((x) =>
                                                                        x.id === t.id ? { ...x, status: next } : x
                                                                    )
                                                                );
                                                            }}
                                                            onRevert={(prevStatus) => {
                                                                // 失敗時ロールバック：以前の値に戻す
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
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
