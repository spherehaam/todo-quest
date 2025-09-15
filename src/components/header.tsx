'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

type Users = {
    id: string;
    username?: string;
    level?: number;
    /** 累計EXPを想定（現在レベルの内部EXPではなくトータル） */
    exp?: number;
};

type LevelRow = {
    level: number;
    required_total_exp: number; // 到達に必要な累計EXP
    rewards_note?: string | null;
};

/** クッキー取得（URLエンコードを考慮して decode） */
function readCookie(name: string) {
    const raw = document.cookie
        .split('; ')
        .find((row) => row.startsWith(name + '='))
        ?.split('=')[1];
    return raw ? decodeURIComponent(raw) : undefined;
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

/** ヘッダースケルトン（ロード中に表示） */
function HeaderSkeleton() {
    return (
        <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-900/70">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                {/* 左：ロゴ枠 */}
                <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" />
                    <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                </div>

                {/* 中央：レベル・EXPゲージ枠 */}
                <div className="hidden sm:flex items-center gap-3">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <div className="h-5 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                            <div className="h-3 w-28 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                        </div>
                        <div className="mt-1 w-56">
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200/80 dark:bg-gray-700/70">
                                <div className="h-full w-1/3 animate-[shimmer_1.8s_infinite] rounded-full bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 dark:from-gray-600 dark:via-gray-500 dark:to-gray-600" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 右：ユーザー名／ボタン枠 */}
                <div className="flex items-center gap-3">
                    <div className="hidden sm:inline h-3 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                    <div className="h-8 w-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
                </div>
            </div>

            <div className="px-4">
                <div className="mx-auto max-w-6xl py-1">
                    <ShimmerBar />
                </div>
            </div>
        </header>
    );
}

/**
 * グローバルヘッダー
 * - users[].exp は「累計EXP」を想定。
 * - 進捗 = (累計EXP - 前レベル閾値) / (次レベル閾値 - 前レベル閾値)
 * - 次レベル閾値が未取得でも「現在レベル閾値」を使って X / Y を表示
 */
export default function Header() {
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<Users[]>([]);
    const [levels, setLevels] = useState<LevelRow[]>([]);
    const router = useRouter();

    // スケルトンの最低表示時間（ms）
    const MIN_SKELETON_MS = 400;

    useEffect(() => {
        let mounted = true;

        async function bootstrap() {
            const start = performance.now();
            try {
                // 1) 自分情報
                const meRes = await fetch('/api/me', { credentials: 'include' });
                if (!meRes.ok) {
                    router.push('/');
                    return;
                }
                const me = await meRes.json();
                if (!mounted) return;
                setEmail(me.email);

                // 2) ユーザー一覧（levels 候補を取り出す）
                const requestedLevels = await fetchUsers();
                if (!mounted) return;

                // 3) レベル定義（ユーザーAPIで得た levels を元にクエリ）
                await fetchLevels(requestedLevels);
                if (!mounted) return;
            } catch (e) {
                console.error('bootstrap failed:', e);
            } finally {
                // 最低表示時間を確保してから loading を解除
                const elapsed = performance.now() - start;
                const remain = Math.max(0, MIN_SKELETON_MS - elapsed);
                setTimeout(() => {
                    if (mounted) setLoading(false);
                }, remain);
            }
        }

        async function fetchUsers(): Promise<number[]> {
            try {
                const res = await fetch('/api/users', { credentials: 'include' });
                if (!res.ok) {
                    setUsers([]);
                    return [];
                }
                const data = await res.json();
                const list: Users[] = data.users ?? [];
                setUsers(list);

                const lvls: number[] = Array.isArray(data.levels)
                    ? (data.levels as number[]).map((v) => Number(v)).filter((v) => Number.isFinite(v))
                    : [];

                if (lvls.length === 0 && list.length > 0) {
                    const unique = Array.from(new Set(list.map((u) => u.level ?? 1)));
                    return unique.map((n) => Number(n)).filter((n) => Number.isFinite(n));
                }

                return lvls;
            } catch (e) {
                console.error('fetchUsers failed:', e);
                setUsers([]);
                return [];
            }
        }

        async function fetchLevels(levelsFromUsers: number[] = []): Promise<LevelRow[]> {
            try {
                const params = new URLSearchParams();
                if (levelsFromUsers.length > 0) {
                    params.set('levels', levelsFromUsers.join(','));
                }
                const qs = params.toString();
                const url = qs ? `/api/levels?${qs}` : '/api/levels';

                const res = await fetch(url, { credentials: 'include' });
                if (!res.ok) {
                    setLevels([]);
                    return [];
                }
                const data = await res.json();

                const list: LevelRow[] = data.levels ?? [];
                setLevels(list);
                return list;
            } catch (e) {
                console.error('fetchLevels failed:', e);
                setLevels([]);
                return [];
            }
        }

        // 初回マウント時は必ずスケルトン開始
        setLoading(true);
        bootstrap();

        return () => {
            mounted = false;
        };
    }, [router]);

    /**
     * ゲージ表示用の派生データ
     */
    const xpView = useMemo(() => {
        const u = users[0];
        if (!u) return null;

        const curLevel = Math.max(1, u.level ?? 1);
        const totalExp = Math.max(0, u.exp ?? 0);

        // level -> required_total_exp のマップ
        const byLevel = new Map<number, number>();
        for (const row of levels) {
            byLevel.set(row.level, row.required_total_exp);
        }

        const prevReq = byLevel.get(curLevel - 1) ?? 0;
        const curReqMaybe = byLevel.get(curLevel);
        const nextReqMaybe = byLevel.get(curLevel + 1);

        const curReq = curReqMaybe ?? prevReq;
        const lvUpNeedRaw = (nextReqMaybe ?? curReq) - prevReq;
        const lvUpNeed = Math.max(1, lvUpNeedRaw);

        const inLevelRaw = totalExp - prevReq;
        const inLevel = Math.max(0, Math.min(lvUpNeed, inLevelRaw));

        const pct = Math.min(100, Math.max(0, (inLevel / lvUpNeed) * 100));

        return {
            username: u.username ?? 'Player',
            curLevel,
            totalExp,
            prevReq,
            curReq,
            nextReq: nextReqMaybe,
            inLevel,
            lvUpNeed,
            pct
        };
    }, [users, levels]);

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

    // ロード中はスケルトンを常に表示
    if (loading) {
        return <HeaderSkeleton />;
    }

    return (
        <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-900/70">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600" />
                    <span className="text-sm font-semibold tracking-wide">
                        TodoQuest
                    </span>
                </div>

                {/* ユーザー */}
                <div className="flex items-center gap-4">
                    {/* EXPバー（ユーザーが取得でき、かつレベル表があるときに表示） */}
                    {xpView && (
                        <div className="hidden sm:flex items-center gap-3">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-gray-700 dark:text-gray-300">
                                    <span className="inline-flex items-center gap-1">
                                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200 dark:ring-indigo-800/60">
                                            レベル {xpView.curLevel}
                                        </span>
                                    </span>
                                    <span className="text-gray-500 dark:text-gray-400">
                                        経験値 {xpView.inLevel} / {xpView.lvUpNeed}
                                    </span>
                                </div>

                                <div className="mt-1 w-56">
                                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200/80 ring-1 ring-white/60 backdrop-blur-sm dark:bg-gray-700/70 dark:ring-black/20">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-sky-400 via-indigo-500 to-violet-500 transition-[width] duration-500 ease-out"
                                            style={{ width: `${xpView.pct}%` }}
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                            aria-valuenow={Math.round(xpView.pct)}
                                            role="progressbar"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

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
    );
}
