'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

/** ステータスの日本語ラベル化 */
function labelOf(s: Task['status']): string {
    switch (s) {
        case 'open': return '募集中';
        case 'in_progress': return '対応中';
        case 'done': return '完了';
        default: return s;
    }
}

/** ステータスごとのバッジ用クラス */
function badgeClass(s: Task['status']): string {
    switch (s) {
        case 'open':
            return 'text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200 dark:text-emerald-200 dark:bg-emerald-900/30 dark:ring-emerald-900';
        case 'in_progress':
            return 'text-amber-800 bg-amber-50 ring-1 ring-amber-200 dark:text-amber-200 dark:bg-amber-900/30 dark:ring-amber-900';
        case 'done':
            return 'text-slate-700 bg-slate-50 ring-1 ring-slate-200 dark:text-slate-200 dark:bg-slate-800/40 dark:ring-slate-800';
    }
}

/** 小さなタグ用の共通クラス */
function pillClass(): string {
    return 'rounded-full px-2 py-0.5 text-xs ring-1 ring-black/10 bg-white text-gray-700 dark:ring-white/10 dark:bg-white/5 dark:text-gray-200';
}

/** ヘッダー下に出すシマー（ローディング） */
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

/** サイドバーのスケルトン */
function SkeletonSidebar() {
    return (
        <aside className="sticky top-16 hidden h-[calc(100vh-5rem)] rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:block">
            <div className="space-y-1">
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
     * - `/api/me` でログインユーザー情報を取得（失敗時はトップへリダイレクト）
     * - `/api/tasks/bbs` で掲示板タスク一覧を取得
     * - useEffect クリーンアップ時は AbortController で fetch を中断
     */
    useEffect(() => {
        const ac = new AbortController();

        // fetch をラップして、AbortError は正常終了として無視する
        async function safeFetch(input: RequestInfo | URL, init?: RequestInit) {
            try {
                return await fetch(input, { ...init, signal: ac.signal });
            } catch (e) {
                if (e instanceof DOMException && e.name === 'AbortError') return null;
                if (typeof e === 'string' && e === 'component_unmounted') return null;
                if (typeof e === 'object' && e && 'message' in e && (e as any).message === 'component_unmounted') return null;
                throw e;
            }
        }

        async function bootstrap() {
            try {
                // ログインユーザー取得
                const res = await safeFetch('/api/me', { credentials: 'include' });
                if (!res) return;
                if (!res.ok) {
                    router.push('/');
                    return;
                }
                const me: Me = await res.json();
                setMe(me);

                // 掲示板タスク取得
                const tRes = await safeFetch('/api/tasks/bbs', { credentials: 'include' });
                if (!tRes) return;
                if (tRes.ok) {
                    const json = await tRes.json();
                    setTasks(json.tasks ?? []);
                } else {
                    setTasks([]);
                }
            } catch (e) {
                console.error('[bbs] bootstrap failed:', e); // ネットワーク等の本当の失敗だけを記録
                setTasks([]);
            } finally {
                setLoading(false);
            }
        }

        bootstrap();

        return () => {
            // アンマウント時に fetch を中断
            ac.abort('component_unmounted');
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
            alert('タイトルは必須です');
            return;
        }
        if (!me?.id) {
            alert('ユーザー情報取得に失敗しました。再度ログインしてください。');
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

            const data = await res.json();
            if (res.ok) {
                setTasks((prev) => [data.task as Task, ...prev]); // 先頭に挿入
                setTitle('');
                setDescription('');
                setDueDate('');
                setDifficulty(1);
                setReward('');
                setOpen(false);
            } else {
                alert(data?.error ?? '作成に失敗しました');
            }
        } catch {
            alert('通信エラーが発生しました');
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
            alert('ユーザー情報取得に失敗しました。再度ログインしてください。');
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
            const res = await fetch(`/api/tasks/${id}/accept`, {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrf },
                credentials: 'include',
            });
            if (!res.ok) {
                // 失敗時ロールバック
                setTasks((prev) =>
                    prev.map((t): Task =>
                        t.id === id ? { ...t, status: 'open' as const, contractor: null } : t
                    )
                );
                const err = await res.json().catch(() => ({}));
                alert(err?.error ?? '受注に失敗しました');
            }
        } catch {
            // 通信エラー時ロールバック
            setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: 'open', contractor: null } : t));
            alert('通信エラーが発生しました');
        }
    }, [me?.id]);

    /**
     * ログアウト
     * - CSRF ヘッダを付与して /api/logout へ POST
     * - 完了したらトップへ
     */
    async function logout() {
        const csrf = readCookie('csrf_token') ?? '';
        await fetch('/api/logout', {
            method: 'POST',
            headers: { 'X-CSRF-Token': csrf },
            credentials: 'include',
        });
        router.push('/');
    }

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
        <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 text-gray-900 dark:from-gray-950 dark:to-gray-900 dark:text-gray-100">
            {/* ヘッダー */}
            <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/50 dark:border-gray-800 dark:bg-gray-900/60">
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600" />
                        <span className="text-sm font-semibold tracking-wide">
                            TodoQuest
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="hidden text-xs text-gray-500 dark:text-gray-400 sm:inline">
                            {loading ? 'Loading…' : (me?.email ?? 'Guest')}
                        </span>
                        <button
                            onClick={logout}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 active:translate-y-px dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-800/50"
                            disabled={loading}
                            aria-disabled={loading}
                        >
                            ログアウト
                        </button>
                    </div>
                </div>
                {/* ローディング中のみシマー表示 */}
                {loading && <div className="px-4"><div className="mx-auto max-w-6xl py-1"><ShimmerBar /></div></div>}
            </header>

            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                {/* サイドバー（ローディング時はスケルトン） */}
                {loading ? (
                    <SkeletonSidebar />
                ) : (
                    <aside className="sticky top-16 hidden h-[calc(100vh-5rem)] rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:block">
                        <nav className="space-y-1">
                            <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                メニュー
                            </div>

                            <Link
                                href="/home"
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                <span>📋</span> <span>ホーム</span>
                            </Link>

                            <Link
                                href="/bbs"
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                <span>📋</span> <span>タスク掲示板</span>
                            </Link>

                            <div className="my-3 border-t border-dashed border-gray-200 dark:border-gray-800" />
                        </nav>
                    </aside>
                )}

                {/* メイン */}
                <main
                    className="space-y-4"
                    aria-busy={loading}
                    aria-live="polite"
                >
                    {/* 見出し */}
                    {loading ? <SkeletonHeaderRow /> : (
                        <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h1 className="m-0 text-2xl font-semibold tracking-tight">タスク掲示板</h1>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    未受注 & 募集中のタスクのみ表示
                                </p>
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
                            // ローディング時はスケルトン表示
                            <ul className="flex list-none flex-col gap-3">
                                <SkeletonCard />
                                <SkeletonCard />
                                <SkeletonCard />
                            </ul>
                        ) : visibleTasks.length === 0 ? (
                            // 件数0のときの空表示
                            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400">
                                募集中のタスクはありません。
                            </div>
                        ) : (
                            // タスク一覧
                            <ul className="flex list-none flex-col gap-3">
                                {visibleTasks.map((t) => (
                                    <li
                                        key={t.id}
                                        className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900/60"
                                    >
                                        {/* Hoverアクセント */}
                                        <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
                                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/5 to-indigo-500/0" />
                                        </div>

                                        <div className="relative z-10 grid gap-3 sm:grid-cols-[1fr,auto] sm:items-start">
                                            <div className="min-w-0">
                                                <div className="mb-1 flex flex-wrap items-center gap-2">
                                                    <span className={`select-none ${badgeClass(t.status)}`}>
                                                        {labelOf(t.status)}
                                                    </span>
                                                    <h3 className="m-0 truncate text-base font-medium">{t.title}</h3>
                                                </div>

                                                {t.description && (
                                                    <p className="mb-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                                                        {t.description}
                                                    </p>
                                                )}

                                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                                    <span className={pillClass()}>
                                                        依頼者ID: <strong className="font-semibold">{t.owner_id}</strong>
                                                    </span>
                                                    {typeof t.difficulty === 'number' && (
                                                        <span className={pillClass()}>
                                                            難易度: {t.difficulty}
                                                        </span>
                                                    )}
                                                    {typeof t.reward === 'number' && (
                                                        <span className={pillClass()}>
                                                            報酬: {t.reward}
                                                        </span>
                                                    )}
                                                    {t.due_date && (
                                                        <span className={pillClass()}>
                                                            期日: {t.due_date}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex min-w-[220px] flex-col gap-2">
                                                <button
                                                    className="rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:translate-y-px disabled:opacity-60 disabled:saturate-50"
                                                    onClick={() => acceptTask(t.id)}
                                                    disabled={!me?.id}
                                                    aria-disabled={!me?.id}
                                                    title={!me?.id ? 'ユーザー情報取得中' : 'このタスクを受注する'}
                                                >
                                                    受注する
                                                </button>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </main>
            </div>

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
                                placeholder="例: 仕様書のレビュー"
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
                                <label className="text-xs text-gray-600 dark:text-gray-300">報酬（任意）</label>
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
                            <label className="text-xs text-gray-600 dark:text-gray-300">期日（任意）</label>
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
        </div>
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
