'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { showToast } from '@/components/toast'; // ★ 追加：どこからでも呼べるトースト

/**
 * タスクの型。
 * - DBスキーマに準拠。未設定の可能性がある項目は `?` や `null` を許可。
 */
type Task = {
    id: string;
    owner_id: string;
    title: string;
    description: string | null;
    difficulty?: number;
    due_date: string | null;
    status: 'open' | 'in_progress' | 'done';
    created_at: string;
    reward?: number;
    contractor: string | null;
    owner_username: string | null;
};

/** /api/me の戻り値 */
type Me = {
    id: string;
    email: string;
};

/**
 * クッキーを安全に読み取るヘルパー。
 * - 値は decodeURIComponent して返却（URLエンコードを考慮）
 */
function readCookie(name: string) {
    const raw = document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + '='))
        ?.split('=')[1];
    return raw ? decodeURIComponent(raw) : undefined;
}

/** 小さなタグ用の共通クラス */
function pillClass(): string {
    return 'rounded-full px-2 py-0.5 text-xs ring-1 ring-black/10 bg-white text-gray-700 dark:ring-white/10 dark:bg-white/5 dark:text-gray-200';
}

/** 見出し行のスケルトン */
function SkeletonHeaderRow() {
    return (
        <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
                <div className="h-6 w-44 animate-pulse rounded-md bg-gray-200/80 dark:bg-gray-700/60" />
                <div className="h-3 w-64 animate-pulse rounded-md bg-gray-200/60 dark:bg-gray-700/50" />
            </div>
            <div className="h-9 w-28 animate-pulse rounded-xl bg-gradient-to-r from-indigo-300 to-blue-300 dark:from-indigo-700 dark:to-blue-700" />
        </div>
    );
}

/** タスクリスト用カードのスケルトン */
function SkeletonCard() {
    return (
        <li className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/5 to-indigo-500/0 opacity-0 transition group-hover:opacity-100" />
            <div className="grid gap-3 sm:grid-cols-[1fr,auto] sm:items-start">
                <div className="min-w-0 space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="h-5 w-14 animate-pulse rounded-full bg-emerald-100 ring-1 ring-emerald-200 dark:bg-emerald-900/40 dark:ring-emerald-900/60" />
                        <div className="h-4 w-48 animate-pulse rounded-md bg-gray-200/80 dark:bg-gray-700/60" />
                    </div>
                    <div className="space-y-2">
                        <div className="h-3 w-full animate-pulse rounded-md bg-gray-200/60 dark:bg-gray-700/50" />
                        <div className="h-3 w-3/5 animate-pulse rounded-md bg-gray-200/60 dark:bg-gray-700/50" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <div className="h-5 w-28 animate-pulse rounded-full bg-white ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10" />
                        <div className="h-5 w-20 animate-pulse rounded-full bg-white ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10" />
                        <div className="h-5 w-20 animate-pulse rounded-full bg-white ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10" />
                    </div>
                </div>
                <div className="flex min-w-[220px] items-start">
                    <div className="h-9 w-24 animate-pulse rounded-xl bg-gradient-to-r from-indigo-300 to-blue-300 dark:from-indigo-700 dark:to-blue-700" />
                </div>
            </div>
        </li>
    );
}

/** スケルトン最小表示時間(ms) */
const MIN_SKELETON_MS = 450;

/** 難易度を●で可視化（1〜5） */
function DifficultyDots({ value }: { value: number }) {
    const capped = Math.max(1, Math.min(5, Math.floor(value)));
    return (
        <span aria-label={`難易度 ${capped}/5`} className="inline-flex items-center gap-0.5 align-middle">
            {Array.from({ length: 5 }).map((_, i) => (
                <span
                    key={i}
                    className={
                        'inline-block h-2.5 w-2.5 rounded-full ring-1 ' +
                        (i < capped
                            ? 'bg-indigo-600 ring-indigo-700'
                            : 'bg-gray-200 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600')
                    }
                />
            ))}
        </span>
    );
}

/** 1件分のカード */
function TaskCard({
    t,
    meId,
    onAccept,
}: {
    t: Task;
    meId?: string | null;
    onAccept: (id: string) => void;
}) {
    return (
        <li className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900/60">
            {/* Hoverアクセント */}
            <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/5 to-indigo-500/0" />
            </div>

            <div className="relative z-10 grid gap-3 sm:grid-cols-[1fr,auto] sm:items-start">
                {/* 左：本文 */}
                <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="m-0 truncate text-lg font-semibold tracking-tight">{t.title}</h3>
                    </div>

                    {t.description && (
                        <div className="mb-2">
                            <p className="whitespace-pre-wrap text-sm leading-6 text-gray-800 dark:text-gray-200">
                                {t.description}
                            </p>
                        </div>
                    )}

                    <div className="my-3 h-px w-full bg-gradient-to-r from-transparent via-gray-200 to-transparent dark:via-gray-700" />

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={pillClass()}>
                            <span className="text-gray-500 dark:text-gray-400">依頼者</span>
                            <span className="ml-1 font-semibold">{t.owner_username ?? '不明'}</span>
                        </span>

                        {typeof t.difficulty === 'number' && (
                            <span className={pillClass()}>
                                <span className="text-gray-500 dark:text-gray-400">難易度</span>
                                <span className="ml-1 inline-flex items-center gap-1 font-semibold">
                                    <DifficultyDots value={t.difficulty} />
                                    <span className="tabular-nums">{t.difficulty}/5</span>
                                </span>
                            </span>
                        )}

                        {typeof t.reward === 'number' && (
                            <span className={pillClass()}>
                                <span className="text-gray-500 dark:text-gray-400">報酬</span>
                                <span className="ml-1 font-semibold">{t.reward}exp</span>
                            </span>
                        )}

                        {t.due_date && (
                            <span className={pillClass()}>
                                <span className="text-gray-500 dark:text-gray-400">期日</span>
                                <span className="ml-1 font-semibold">
                                    {new Date(t.due_date).toLocaleDateString('ja-JP')}
                                </span>
                            </span>
                        )}
                    </div>
                </div>

                {/* 右：アクション */}
                <div className="flex min-w-[220px] flex-col gap-2">
                    <button
                        className="rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:translate-y-px disabled:opacity-60 disabled:saturate-50"
                        onClick={() => onAccept(t.id)}
                        disabled={!meId}
                        aria-disabled={!meId}
                        title={!meId ? 'ユーザー情報取得中' : 'このタスクを受注する'}
                    >
                        受注する
                    </button>
                </div>
            </div>
        </li>
    );
}

/**
 * タスク掲示板ページ（クライアントコンポーネント）
 * - 初回マウント時に /api/me と /api/tasks/bbs を取得
 * - 「依頼を投稿」モーダルを開いて新規タスク作成
 * - 「受注する」でタスクを楽観更新し、APIに反映（失敗時ロールバック）
 */
export default function BbsPage() {
    const router = useRouter();

    // ---- グローバル状態 ----
    const [me, setMe] = useState<Me | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [open, setOpen] = useState(false);        // モーダル開閉
    const [loading, setLoading] = useState(true);   // 初期ロードのローディング

    // ---- 投稿フォームの状態 ----
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [difficulty, setDifficulty] = useState<number>(1);
    const [reward, setReward] = useState<number | ''>(''); // 未入力は '' で表現

    /**
     * 表示対象のタスク（未受注・募集中のみ）
     * - `tasks` が変わったときだけ再計算
     */
    const visibleTasks = useMemo(
        () => tasks.filter((t) => t.status === 'open' && t.contractor === null),
        [tasks]
    );

    /**
     * 初期化処理
     * - `/api/me` でログインユーザーを取得（失敗時はトップへリダイレクト）
     * - `/api/tasks/bbs` で掲示板タスクを取得
     * - クリーンアップ時は AbortController で fetch を中断
     */
    useEffect(() => {
        const ac = new AbortController();
        let hideTimer: number | null = null;

        /** Abort によるキャンセルかどうか判定 */
        function isAbortError(value: unknown): boolean {
            if (value instanceof DOMException && value.name === 'AbortError') return true;
            if (typeof value === 'string') return value === 'component_unmounted';
            if (typeof value === 'object' && value !== null && 'message' in value) {
                const m = (value as { message?: unknown }).message;
                return typeof m === 'string' && m === 'component_unmounted';
            }
            return false;
        }

        /** fetch をラップ（中断は正常終了扱い） */
        async function safeFetch(input: RequestInfo | URL, init?: RequestInit) {
            try {
                return await fetch(input, { ...init, signal: ac.signal });
            } catch (e: unknown) {
                if (isAbortError(e)) return null; // 中断は無視
                throw e; // 本当の失敗だけスロー
            }
        }

        async function bootstrap() {
            const start = performance.now();
            try {
                // ログインユーザー取得
                const res = await safeFetch('/api/me', { credentials: 'include' });
                if (!res) return;
                if (!res.ok) {
                    showToast({ type: 'warning', message: 'ログインが必要です。' });
                    const elapsed = performance.now() - start;
                    const rest = Math.max(0, MIN_SKELETON_MS - elapsed);
                    hideTimer = window.setTimeout(() => {
                        setLoading(false);
                        router.push('/');
                    }, rest);
                    return;
                }
                const me: Me = await res.json();
                setMe(me);

                // 掲示板タスク
                const tRes = await safeFetch('/api/tasks/bbs', { credentials: 'include' });
                if (tRes && tRes.ok) {
                    const json = await tRes.json();
                    setTasks(json.tasks ?? []);
                } else {
                    setTasks([]);
                    showToast({ type: 'error', message: 'タスク一覧の取得に失敗しました。' });
                }
            } catch (e) {
                console.error('[bbs] bootstrap failed:', e); // ネットワーク等の本当の失敗だけを記録
                setTasks([]);
                showToast({ type: 'error', message: '初期化中にエラーが発生しました。' });
            } finally {
                const elapsed = performance.now() - start;
                const rest = Math.max(0, MIN_SKELETON_MS - elapsed);
                hideTimer = window.setTimeout(() => setLoading(false), rest);
            }
        }

        bootstrap();

        return () => {
            // アンマウント時に fetch を中断
            ac.abort('component_unmounted');
            if (hideTimer) clearTimeout(hideTimer);
        };
    }, [router]);

    /**
     * 新規タスクの作成（モーダルから送信）
     * - 必須: title、ユーザーID（me.id）
     * - CSRFトークンは Cookie から取得しヘッダに付与
     * - 成功時は先頭に挿入し、フォームをリセット
     */
    const addTaskFromModal = useCallback(async () => {
        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            showToast({ type: 'warning', message: 'タイトルは必須です' });
            return;
        }
        if (!me?.id) {
            showToast({ type: 'error', message: 'ユーザー情報取得に失敗しました。再度ログインしてください。' });
            return;
        }

        const csrf = readCookie('csrf_token') ?? '';
        const payload: Record<string, unknown> = {
            owner_id: me.id,
            title: trimmedTitle,
            description: description.trim() || null,
            due_date: dueDate || null,
            status: 'open',
            difficulty,
            ...(reward === '' ? {} : { reward: Math.max(0, Math.floor(Number(reward))) }),
        };

        try {
            const res = await fetch('/api/tasks/bbs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf,
                },
                credentials: 'include',
                body: JSON.stringify(payload),
            });

            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setTasks((prev) => [data.task as Task, ...prev]); // 先頭に挿入
                setTitle('');
                setDescription('');
                setDueDate('');
                setDifficulty(1);
                setReward('');
                setOpen(false);
                showToast({ type: 'success', message: '依頼を投稿しました。' });
            } else {
                showToast({ type: 'error', message: data?.error ?? '作成に失敗しました' });
            }
        } catch {
            showToast({ type: 'error', message: '通信エラーが発生しました' });
        }
    }, [title, description, dueDate, difficulty, reward, me?.id]);

    /**
     * タスク受注（楽観更新 → API → 失敗時ロールバック）
     * - 先に UI を 'in_progress' + contractor=userId に更新
     * - API 失敗時は 'open' + contractor=null に戻す
     */
    const acceptTask = useCallback(async (id: string) => {
        const userId = me?.id;
        if (!userId) {
            showToast({ type: 'warning', message: 'ユーザー情報取得中です。少し待ってからお試しください。' });
            return;
        }

        // 楽観更新
        setTasks((prev) =>
            prev.map((t): Task =>
                t.id === id ? { ...t, status: 'in_progress' as const, contractor: userId } : t
            )
        );

        try {
            const csrf = readCookie('csrf_token') ?? '';
            const res = await fetch('/api/tasks/accept', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf,
                },
                credentials: 'include',
                body: JSON.stringify({ taskId: id }),
            });
            if (!res.ok) {
                // 失敗時ロールバック
                setTasks((prev) =>
                    prev.map((t): Task =>
                        t.id === id ? { ...t, status: 'open' as const, contractor: null } : t
                    )
                );
                const err = await res.json().catch(() => ({}));
                showToast({ type: 'error', message: err?.error ?? '受注に失敗しました' });
                return;
            }
            showToast({ type: 'success', message: 'タスクを受注しました。' });
        } catch {
            // 通信エラー時ロールバック
            setTasks((prev) =>
                prev.map((t) =>
                    t.id === id ? { ...t, status: 'open', contractor: null } : t
                )
            );
            showToast({ type: 'error', message: '通信エラーが発生しました' });
        }
    }, [me?.id]);

    // モーダル内の最初の input へフォーカス
    const firstInputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        if (open) setTimeout(() => firstInputRef.current?.focus(), 0);
    }, [open]);

    /**
     * モーダル開閉に合わせて背景スクロールを禁止
     * - iOS Safari 等でも効かせるため body.overflow を直接切り替え
     */
    useEffect(() => {
        if (!open) return;
        const original = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = original; };
    }, [open]);

    return (
        <>
            {/* 見出し */}
            {loading ? <SkeletonHeaderRow /> : (
                <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="m-0 text-2xl font-semibold tracking-tight">タスク掲示板</h1>
                    </div>
                    <button
                        onClick={() => setOpen(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:translate-y-px"
                    >
                        依頼を投稿
                    </button>
                </div>
            )}

            {/* タスクリスト */}
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold tracking-tight">募集中のタスク</h2>
                    {!loading && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{visibleTasks.length} 件</span>
                    )}
                </div>

                {loading ? (
                    <ul className="flex list-none flex-col gap-3">
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </ul>
                ) : visibleTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400">
                        募集中のタスクはありません。
                    </div>
                ) : (
                    <ul className="flex list-none flex-col gap-3">
                        {visibleTasks.map((t) => (
                            <TaskCard key={t.id} t={t} meId={me?.id} onAccept={acceptTask} />
                        ))}
                    </ul>
                )}
            </section>

            {/* 作成モーダル */}
            {open && (
                <Modal onClose={() => setOpen(false)} title="新規依頼を作成">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-600 dark:text-gray-300">タイトル *</label>
                            <input
                                ref={firstInputRef}
                                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-700 dark:bg-gray-900"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-600 dark:text-gray-300">詳細</label>
                            <textarea
                                className="w-full resize-y rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-700 dark:bg-gray-900"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="依頼内容の詳細を記入してください"
                                rows={5}
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-600 dark:text-gray-300">難易度（1–5）</label>
                                <select
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none ring-indigo-500/20 focus:ring-2 dark:border-gray-700 dark:bg-gray-900"
                                    value={difficulty}
                                    onChange={(e) => setDifficulty(Number(e.target.value))}
                                >
                                    {[1, 2, 3, 4, 5].map((n) => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-600 dark:text-gray-300">報酬</label>
                                <input
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-700 dark:bg-gray-900"
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={reward}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === '') {
                                            setReward('');
                                        } else {
                                            const num = Number(v);
                                            setReward(Number.isNaN(num) ? '' : Math.max(0, Math.floor(num)));
                                        }
                                    }}
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-600 dark:text-gray-300">期日</label>
                            <input
                                type="date"
                                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none ring-indigo-500/20 placeholder:text-gray-400 focus:ring-2 dark:border-gray-700 dark:bg-gray-900 dark:[&::-webkit-calendar-picker-indicator]:invert"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setOpen(false)}
                                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 active:translate-y-px dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={addTaskFromModal}
                                className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:translate-y-px disabled:opacity-60"
                                disabled={!me?.id}
                                aria-disabled={!me?.id}
                                title={!me?.id ? 'ユーザー情報取得中' : '依頼を投稿'}
                            >
                                依頼を投稿
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}

/**
 * 汎用モーダル
 * - Esc キーで閉じる
 * - 背景クリックで閉じる
 * - タイトルは aria-labelledby で参照
 */
function Modal(props: { title: string; onClose: () => void; children: React.ReactNode }) {
    // Esc で閉じる
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') props.onClose();
    };
    const titleId = 'modal-title';

    return (
        <div
            className="fixed inset-0 z-50 grid place-items-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onKeyDown={onKeyDown}
        >
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={props.onClose}
            />
            <div className="relative z-10 w-full max-w-xl rounded-2xl border border-gray-200 bg-white/95 p-5 shadow-xl ring-1 ring-black/5 dark:border-gray-800 dark:bg-gray-900/95 dark:ring-white/10">
                <div className="mb-3 flex items-center justify-between">
                    <h3 id={titleId} className="text-base font-semibold">{props.title}</h3>
                    <button
                        onClick={props.onClose}
                        className="rounded-md p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                        aria-label="閉じる"
                        title="閉じる"
                    >
                        ✕
                    </button>
                </div>
                {props.children}
            </div>
        </div>
    );
}
