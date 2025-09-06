'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type TaskStatus = 'open' | 'in_progress' | 'done';

type Task = {
    id: string;
    title: string;
    description?: string | null;
    due_date?: string | null;           // ISO/日付文字列
    status: TaskStatus;
    created_at: string;                 // ISO
    contractor: string;
};

type Users = {
    id: string;
    username: string;
    level: number;
    exp: number;
};

// ------------------------------
// ユーティリティ
// ------------------------------

/** Cookie から値を取得（未設定は undefined） */
function readCookie(name: string) {
    return document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + '='))
        ?.split('=')[1];
}

/** 日時文字列 → ローカル日時表示（不正値は '-'） */
function fmtDate(input?: string | null): string {
    if (!input) return '-';
    const d = new Date(input);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString();
}

/** 日付文字列 → ローカル日付表示（不正値は '-'） */
function fmtDateOnly(input?: string | null): string {
    if (!input) return '-';
    const d = new Date(input);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString();
}

/** `<input type="date">` の値(YYYY-MM-DD)をそのまま送る。時差ズレ防止のため ISO 変換しない */
function normalizeDateForApi(localDate: string | undefined): string | undefined {
    if (!localDate) return undefined;
    // 年月日形式のみを許容
    return /^\d{4}-\d{2}-\d{2}$/.test(localDate) ? localDate : undefined;
}

/** fetch レスポンスの JSON を安全に取得（失敗時は {}） */
async function safeJson<T = unknown>(res: Response): Promise<T | {}> {
    try {
        return (await res.json()) as T;
    } catch {
        return {};
    }
}

/** 共通 fetch（JSON想定・エラー時に例外） */
async function fetchJson<T = unknown>(input: RequestInfo, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; data: any; status: number }> {
    const res = await fetch(input, init);
    const data = await safeJson<T>(res);
    if (res.ok) {
        return { ok: true, data: data as T };
    }
    return { ok: false, data, status: res.status };
}

// ------------------------------
// ステータス表示
// ------------------------------
const STATUS_LABEL: Record<TaskStatus, string> = {
    open: '未完了',
    in_progress: '進行中',
    done: '完了'
};
const ALL_STATUSES: TaskStatus[] = ['open', 'in_progress', 'done'];

/** ステータス更新 API */
async function updateTaskStatus(taskId: string, next: TaskStatus) {
    const csrf = readCookie('csrf_token') ?? '';
    if (!csrf) {
        throw new Error('CSRFトークンが見つかりません。ログインし直してください。');
    }
    const res = await fetch('/api/tasks/status', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf
        },
        credentials: 'include',
        body: JSON.stringify({ taskId, status: next })
    });
    if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `Failed to update status (${res.status})`);
    }
    return (await res.json()) as { status: TaskStatus };
}

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
        if (e.key === 'Escape') setEditing(false);
    }

    async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const next = e.target.value as TaskStatus;
        if (next === value) {
            setEditing(false);
            return;
        }
        const prev = value;
        onLocalChange(next);       // 楽観的更新
        setSaving(true);
        try {
            await updateTaskStatus(taskId, next);
        } catch (err) {
            onRevert(prev);        // 失敗時は元に戻す
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
                className="w-full rounded px-2 py-1 text-left transition hover:bg-gray-100 dark:hover:bg-gray-800"
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

// ------------------------------
// スケルトン
// ------------------------------
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

// ------------------------------
// 画面本体
// ------------------------------
export default function HomePage() {
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newDueLocal, setNewDueLocal] = useState(''); // YYYY-MM-DD
    const [newStatus, setNewStatus] = useState<TaskStatus>('open');
    const [msg, setMsg] = useState('');
    const [users, setUsers] = useState<Users[]>([]);
    const router = useRouter();

    // 進行中のリクエスト中断用
    const abortRef = useRef<AbortController | null>(null);
    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    // 初期ロード
    useEffect(() => {
        async function bootstrap() {
            setLoading(true);
            try {
                abortRef.current?.abort();
                const controller = new AbortController();
                abortRef.current = controller;

                // 認証確認
                const meRes = await fetch('/api/me', { credentials: 'include', signal: controller.signal });
                if (!meRes.ok) {
                    router.replace('/'); // 未ログイン→ログイン画面へ
                    return;
                }
                const me = await meRes.json();
                setEmail(me.email ?? null);

                // ユーザー一覧
                const uRes = await fetchJson<{ users: Users[] }>('/api/users', { credentials: 'include', signal: controller.signal as any });
                const list = uRes.ok ? uRes.data.users ?? [] : [];
                setUsers(list);

                // とりあえず先頭ユーザーでタスク取得（※本来は選択UIが望ましい）
                const contractor = list[0]?.id;
                const url = contractor ? `/api/tasks?contractor=${encodeURIComponent(contractor)}` : '/api/tasks';
                const tRes = await fetchJson<{ tasks: Task[] }>(url, { credentials: 'include', signal: controller.signal as any });
                setTasks(tRes.ok ? tRes.data.tasks ?? [] : []);
            } catch (e: any) {
                if (e?.name !== 'AbortError') {
                    console.error(e);
                    setMsg('初期読み込みに失敗しました。');
                }
            } finally {
                setLoading(false);
            }
        }
        bootstrap();
    }, [router]);

    // デバッグログ（必要なければ削除OK）
    useEffect(() => {
        if (users.length > 0) {
            console.log('users (state changed):', users);
            console.log('users[0].id:', users[0].id);
        }
    }, [users]);

    /** 新規タスク作成 */
    type NewTaskPayload = {
        title: string;
        description?: string;
        due_date?: string;     // YYYY-MM-DD を推奨
        status: TaskStatus;
        contractor?: string;   // 受注者
    };

    async function addTask() {
        const title = newTitle.trim();
        if (!title) {
            setMsg('タイトルを入力してください');
            return;
        }

        const csrf = readCookie('csrf_token') ?? '';
        if (!csrf) {
            setMsg('CSRFトークンが見つかりません。ログインし直してください。');
            return;
        }

        const payload: NewTaskPayload = {
            title,
            status: newStatus
        };

        const description = newDescription.trim();
        if (description) payload.description = description;

        const dateForApi = normalizeDateForApi(newDueLocal);
        if (dateForApi) payload.due_date = dateForApi;

        // users[0] 依存は脆いので存在チェック
        if (users[0]?.id) payload.contractor = users[0].id;

        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrf
            },
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        const data = await safeJson<{ task: Task; error?: string }>(res);
        if (res.ok && (data as any)?.task) {
            const { task } = data as any;
            setTasks((prev) => [task as Task, ...prev]);
            setNewTitle('');
            setNewDescription('');
            setNewDueLocal('');
            setNewStatus('open');
            setMsg('追加しました');
        } else {
            setMsg(`追加に失敗: ${(data as any)?.error ?? 'unknown error'}`);
        }
    }

    /** ログアウト */
    async function logout() {
        const csrf = readCookie('csrf_token') ?? '';
        if (!csrf) {
            setMsg('CSRFトークンが見つかりません。');
            return;
        }
        try {
            await fetch('/api/logout', {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrf },
                credentials: 'include'
            });
        } finally {
            router.push('/');
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
            <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-900/70">
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600" />
                        <span className="text-sm font-semibold tracking-wide">TodoQuest</span>
                    </div>

                    {/* レベル表示：exp/exp は同値になっていたので、必要に応じて maxExp を導入してください */}
                    {/* <div className="flex items-center gap-2" aria-label="ユーザー情報">
                        レベル
                        {users.map((u) => (
                            <p key={u.id}> {u.level}　経験値 {u.exp}</p>
                        ))}
                    </div> */}

                    <div className="flex items-center gap-3">
                        <span className="hidden text-xs text-gray-500 dark:text-gray-400 sm:inline">
                            {loading ? 'Loading…' : (email ?? 'Guest')}
                        </span>
                        <button
                            onClick={logout}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                            disabled={loading}
                        >
                            ログアウト
                        </button>
                    </div>
                </div>
                {loading && (
                    <div className="px-4">
                        <div className="mx-auto max-w-6xl py-1">
                            <ShimmerBar />
                        </div>
                    </div>
                )}
            </header>

            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                {loading ? (
                    <SkeletonSidebar />
                ) : (
                    <aside className="sticky top-16 hidden h-[calc(100vh-5rem)] rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:block">
                        <nav className="space-y-1" aria-label="サイドバー">
                            <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                メニュー
                            </div>
                            <a href="/home" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                                <span>📋</span> <span>ホーム</span>
                            </a>
                            <a href="/bbs" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                                <span>📋</span> <span>タスク掲示板</span>
                            </a>
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
                            {/* タスク追加フォーム */}
                            <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                                <h1 className="mb-2 text-lg font-semibold">ようこそ、{email} さん</h1>

                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                                    <input
                                        className="sm:col-span-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950"
                                        placeholder="タイトル"
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        aria-label="タイトル"
                                    />
                                    <input
                                        className="sm:col-span-5 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950"
                                        placeholder="詳細（任意）"
                                        value={newDescription}
                                        onChange={(e) => setNewDescription(e.target.value)}
                                        aria-label="詳細"
                                    />
                                    <input
                                        type="date"
                                        className="sm:col-span-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950 dark:[&::-webkit-calendar-picker-indicator]:invert"
                                        value={newDueLocal}
                                        onChange={(e) => setNewDueLocal(e.target.value)}
                                        aria-label="期限"
                                    />

                                    <select
                                        className="sm:col-span-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 focus:ring-2 dark:border-gray-800 dark:bg-gray-950"
                                        value={newStatus}
                                        onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
                                        aria-label="ステータス"
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

                                {msg && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{msg}</p>}
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
                                                                setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
                                                            }}
                                                            onRevert={(prevStatus) => {
                                                                setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: prevStatus } : x)));
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