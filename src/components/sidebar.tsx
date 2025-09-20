'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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
                <div className="my-3 h-px w-full bg-dashed bg-[length:8px_1px] bg-left bg-repeat-x 
                    [background-image:linear-gradient(to_right,rgba(0,0,0,.15)_50%,transparent_0)] 
                    dark:[background-image:linear-gradient(to_right,rgba(255,255,255,.15)_50%,transparent_0)]" />
            </div>
        </aside>
    );
}

/**
 * アプリ共通サイドバー
 * - 初期はスケルトンを表示し、一定時間後にメニューを描画
 * - 状態やAPIの有無に関わらず単体で完結
 */
export default function Sidebar() {
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 擬似的なローディング（300ms後に解除）
        const timer = setTimeout(() => setLoading(false), 300);
        return () => clearTimeout(timer);
    }, []);

    if (loading) return <SkeletonSidebar />;

    return (
        <aside className="sticky top-16 hidden h-[calc(100vh-5rem)] rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:block">
            <nav className="space-y-1" aria-label="サイドバー">
                <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    メニュー
                </div>

                {/* 内部リンクは Link でプリフェッチ */}
                <Link
                    href="/home"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 rounded-sm"
                >
                    <span>📋</span> <span>ホーム</span>
                </Link>

                <Link
                    href="/bbs"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 rounded-sm"
                >
                    <span>📋</span> <span>タスク掲示板</span>
                </Link>

                <div className="my-3 border-t border-dashed border-gray-200 dark:border-gray-800" />
            </nav>
        </aside>
    );
}
