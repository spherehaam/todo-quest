'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/** ステータス型 */
type TaskStatus = 'open' | 'in_progress' | 'done';

type Task = {
    id: string;
    title: string;
    description?: string;
    due_date?: string;        // APIが date 文字列（YYYY-MM-DD）を想定するならその形式
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
 */
function toYmdLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** 日付のみ表示（ローカル）。不正値は '-' 表示 */
function fmtDateOnly(input?: string | null): string {
    if (!input) return '-';
    const d = new Date(input);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString();
}

/** 期限文字列(YYYY-MM-DD) → Date（ローカル） */
function parseDueDateLocal(ymd?: string): Date | null {
    if (!ymd) return null;
    const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
}

const STATUS_LABEL: Record<TaskStatus, string> = {
    open: '未完了',
    in_progress: '進行中',
    done: '完了',
};

const ALL_STATUSES: TaskStatus[] = ['open', 'in_progress', 'done'];

/** ステータス更新API */
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
        if (e.key === 'Escape') setEditing(false);
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

/** 期限フィルタ種別（再検索せず表示のみ絞る） */
type DueFilter = 'all' | 'no_due' | 'overdue' | 'today' | 'this_week' | 'this_month' | 'range';

/** モーダル（小さめのダイアログ） */
function Modal(props: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}) {
    const { open, onClose, title, children } = props;
    const overlayRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        if (open) {
            document.addEventListener('keydown', onKey);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={(e) => {
                // オーバーレイクリックで閉じる（中身クリックは閉じない）
                if (e.target === overlayRef.current) onClose();
            }}
        >
            <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-0 shadow-xl dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-800">
                    <h3 className="text-base font-semibold">{title}</h3>
                    <button
                        onClick={onClose}
                        className="rounded p-2 text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-gray-400 dark:hover:bg-gray-800"
                        aria-label="閉じる"
                    >
                        ✕
                    </button>
                </div>
                <div className="p-4">{children}</div>
            </div>
        </div>
    );
}

/** 新規タスク作成モーダル（内容）
 *  titleInputRef の型を広げて、MutableRefObject<HTMLInputElement | null> も受け取れるようにする
 */
function CreateTaskModal({
    open,
    onClose,
    email,
    newTitle,
    setNewTitle,
    newDescription,
    setNewDescription,
    newDueLocal,
    setNewDueLocal,
    newStatus,
    setNewStatus,
    addTask,
    titleInputRef,
    msg,
}: {
    open: boolean;
    onClose: () => void;
    email: string | null;
    newTitle: string;
    setNewTitle: (v: string) => void;
    newDescription: string;
    setNewDescription: (v: string) => void;
    newDueLocal: string;
    setNewDueLocal: (v: string) => void;
    newStatus: TaskStatus;
    setNewStatus: (v: TaskStatus) => void;
    addTask: () => void;
    titleInputRef: React.Ref<HTMLInputElement>;
    msg: string;
}) {
    return (
        <Modal open={open} onClose={onClose} title="新規タスクの作成">
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">ようこそ、{email ?? '-'} さん</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <input
                    ref={titleInputRef as React.Ref<HTMLInputElement>}
                    className="sm:col-span-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950"
                    placeholder="タイトル"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                />
                <input
                    className="sm:col-span-5 w-full rounded-lg border border-gray-200 bg白 p-3 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-800 dark:bg-gray-950"
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

            <div className="mt-4 flex items-center justify-end gap-2">
                <button
                    onClick={onClose}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                    キャンセル
                </button>
                <button
                    onClick={addTask}
                    className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99]"
                >
                    追加する
                </button>
            </div>

            {msg && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{msg}</p>}
        </Modal>
    );
}

export default function HomePage() {
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState<Task[]>([]);

    // === 新規作成フォーム（モーダル内） ===
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newDueLocal, setNewDueLocal] = useState(''); // YYYY-MM-DD
    const [newStatus, setNewStatus] = useState<TaskStatus>('open');

    const [msg, setMsg] = useState('');
    const [users, setUsers] = useState<Users[]>([]);
    const router = useRouter();

    // === 絞り込み（再検索なし） ===
    const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
    const [dueFilter, setDueFilter] = useState<DueFilter>('all');
    const [rangeFrom, setRangeFrom] = useState<string>(''); // YYYY-MM-DD
    const [rangeTo, setRangeTo] = useState<string>('');     // YYYY-MM-DD

    // === モーダル開閉 ===
    const [isCreateOpen, setCreateOpen] = useState(false);
    const titleInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isCreateOpen) {
            // 少し遅らせてフォーカス
            setTimeout(() => titleInputRef.current?.focus(), 0);
        }
    }, [isCreateOpen]);

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

                // 3) 先頭ユーザーのタスク取得
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

    /** 新規タスク追加（CSRF付与、成功でモーダル閉じ） */
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
        if (description) payload.description = description;

        if (newDueLocal) {
            const d = new Date(newDueLocal);
            if (!isNaN(d.getTime())) payload.due_date = toYmdLocal(d);
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
                // 入力リセット＆モーダル閉じる
                setNewTitle('');
                setNewDescription('');
                setNewDueLocal('');
                setNewStatus('open');
                setMsg('追加しました');
                setCreateOpen(false); // 成功で閉じる
            } else {
                setMsg(`追加に失敗: ${data.error ?? 'unknown error'}`);
            }
        } catch (e) {
            console.error('addTask failed:', e);
            setMsg('追加に失敗: ネットワークエラー');
        }
    }, [newTitle, newDescription, newDueLocal, newStatus, users]);

    // 期限フィルタ（表示のみ）
    const filteredTasks = useMemo(() => {
        // 今日・週・月の境界（ローカル）
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(today);
        endOfToday.setHours(23, 59, 59, 999);

        const startOfWeek = new Date(today);
        const day = startOfWeek.getDay() || 7; // 月曜始まり
        startOfWeek.setDate(startOfWeek.getDate() - (day - 1));
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);

        const rangeStart = parseDueDateLocal(rangeFrom);
        const rangeEndBase = parseDueDateLocal(rangeTo);
        const rangeEnd = rangeEndBase
            ? new Date(rangeEndBase.getFullYear(), rangeEndBase.getMonth(), rangeEndBase.getDate(), 23, 59, 59, 999)
            : null;

        return tasks.filter((t) => {
            // ステータスフィルタ
            if (statusFilter !== 'all' && t.status !== statusFilter) return false;

            // 期限フィルタ
            const due = parseDueDateLocal(t.due_date);
            switch (dueFilter) {
                case 'all':
                    return true;
                case 'no_due':
                    return !due;
                case 'overdue':
                    return !!due && due < today;
                case 'today':
                    return !!due && due >= today && due <= endOfToday;
                case 'this_week':
                    return !!due && due >= startOfWeek && due <= endOfWeek;
                case 'this_month':
                    return !!due && due >= startOfMonth && due <= endOfMonth;
                case 'range':
                    if (!rangeStart && !rangeEnd) return true;
                    if (!due) return false;
                    if (rangeStart && due < rangeStart) return false;
                    if (rangeEnd && due > rangeEnd) return false;
                    return true;
                default:
                    return true;
            }
        });
    }, [tasks, statusFilter, dueFilter, rangeFrom, rangeTo]);

    // 範囲選択モード解除で日付クリア
    useEffect(() => {
        if (dueFilter !== 'range') {
            setRangeFrom('');
            setRangeTo('');
        }
    }, [dueFilter]);

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">

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
                            {/* ====== タスク一覧（フィルタ + 新規ボタン） ====== */}
                            <section className="rounded-2xl border border-gray-200 bg-white p-0 dark:border-gray-800 dark:bg-gray-900">
                                <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                                    <h2 className="text-sm font-semibold">タスク一覧</h2>

                                    {/* 右側：フィルタと「新規」ボタン */}
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        {/* ステータスフィルタ */}
                                        <label className="flex items-center gap-2 text-xs sm:text-sm">
                                            <span className="whitespace-nowrap text-gray-500 dark:text-gray-400">ステータス</span>
                                            <select
                                                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                                                value={statusFilter}
                                                onChange={(e) => setStatusFilter(e.target.value as 'all' | TaskStatus)}
                                            >
                                                <option value="all">すべて</option>
                                                <option value="open">未完了</option>
                                                <option value="in_progress">進行中</option>
                                                <option value="done">完了</option>
                                            </select>
                                        </label>

                                        {/* 期限フィルタ */}
                                        <label className="flex items-center gap-2 text-xs sm:text-sm">
                                            <span className="whitespace-nowrap text-gray-500 dark:text-gray-400">期限</span>
                                            <select
                                                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                                                value={dueFilter}
                                                onChange={(e) => setDueFilter(e.target.value as DueFilter)}
                                            >
                                                <option value="all">すべて</option>
                                                <option value="no_due">期限なし</option>
                                                <option value="overdue">期限切れ</option>
                                                <option value="today">今日まで</option>
                                                <option value="this_week">今週まで</option>
                                                <option value="this_month">今月まで</option>
                                                <option value="range">期間指定</option>
                                            </select>
                                        </label>

                                        {/* 範囲指定 */}
                                        {dueFilter === 'range' && (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="date"
                                                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:[&::-webkit-calendar-picker-indicator]:invert"
                                                    value={rangeFrom}
                                                    onChange={(e) => setRangeFrom(e.target.value)}
                                                    aria-label="開始日"
                                                />
                                                <span className="text-gray-400">~</span>
                                                <input
                                                    type="date"
                                                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:[&::-webkit-calendar-picker-indicator]:invert"
                                                    value={rangeTo}
                                                    onChange={(e) => setRangeTo(e.target.value)}
                                                    aria-label="終了日"
                                                />
                                            </div>
                                        )}

                                        {/* 件数 */}
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            {filteredTasks.length} / {tasks.length} 件
                                        </span>

                                        {/* モーダルを開くボタン（フィルタ群の右端） */}
                                        <button
                                            type="button"
                                            onClick={() => setCreateOpen(true)}
                                            className="ml-0 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99] sm:ml-2"
                                        >
                                            ＋ 新規タスク
                                        </button>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                                <th className="px-4 py-2 text-left">タイトル</th>
                                                <th className="px-4 py-2 text-left">詳細</th>
                                                <th className="px-4 py-2 text-left">ステータス</th>
                                                <th className="px-4 py-2 text-left">期限</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTasks.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                                                        条件に一致するタスクがありません。
                                                    </td>
                                                </tr>
                                            )}
                                            {filteredTasks.map((t, idx) => (
                                                <tr
                                                    key={t.id}
                                                    className={idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-950'}
                                                >
                                                    <td className="px-4 py-3">{t.title}</td>
                                                    <td className="px-4 py-3">{t.description ?? '-'}</td>
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
                                                    <td className="px-4 py-3">{fmtDateOnly(t.due_date)}</td>
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

            {/* モーダル呼び出し */}
            <CreateTaskModal
                open={isCreateOpen}
                onClose={() => setCreateOpen(false)}
                email={email}
                newTitle={newTitle}
                setNewTitle={setNewTitle}
                newDescription={newDescription}
                setNewDescription={setNewDescription}
                newDueLocal={newDueLocal}
                setNewDueLocal={setNewDueLocal}
                newStatus={newStatus}
                setNewStatus={setNewStatus}
                addTask={addTask}
                titleInputRef={titleInputRef}
                msg={msg}
            />
        </div>
    );
}
