'use client';

import React, { useEffect, useRef, useState } from 'react';

// ------------------------------------------------------------
// Toast 型/ユーティリティ
// ------------------------------------------------------------

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type ToastItem = {
    id: string;          // 一意なID（時刻 + ランダム）
    type: ToastType;     // 表示タイプ
    message: string;     // 本文
    duration?: number;   // 自動クローズまでのms（デフォルト 3000）
};

// 簡易なPubSub。Provider が購読し、showToast から発火する
// ※ グローバルな Set を利用（アプリ内単一 Provider 前提）
type Subscriber = (t: ToastItem) => void;
const subscribers = new Set<Subscriber>();

/**
 * どこからでも呼べる発火関数。
 * ToastProvider がマウントされていれば、その購読者へ通知される。
 */
export function showToast(input: { type: ToastType; message: string; duration?: number }) {
    const toast: ToastItem = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: input.type,
        message: input.message,
        duration: input.duration ?? 3000,
    };
    subscribers.forEach((fn) => fn(toast));
}

// ------------------------------------------------------------
// Provider（画面右下にトースト群を描画）
// ------------------------------------------------------------

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const timers = useRef<Map<string, number>>(new Map()); // id -> timeoutId

    useEffect(() => {
        // 注意: cleanup 時の参照ブレを避けるため、ローカルに固定
        const map = timers.current;

        // サブスクライブして、新規トーストをキューへ追加
        const handler: Subscriber = (t) => {
            setToasts((prev) => [...prev, t]);

            // 自動クローズ用タイマーをセット
            const id = window.setTimeout(() => {
                setToasts((prev) => prev.filter((x) => x.id !== t.id));
                map.delete(t.id);
            }, t.duration ?? 3000);
            map.set(t.id, id);
        };

        subscribers.add(handler);
        return () => {
            // クリーンアップ（購読解除 & タイマー解除）
            subscribers.delete(handler);
            map.forEach((id) => clearTimeout(id));
            map.clear();
        };
    }, []);

    // 明示的に閉じる
    function remove(id: string) {
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }

    // 種別ごとの色（見た目のみ／動作変更なし）
    function colorClasses(t: ToastItem) {
        switch (t.type) {
            case 'success':
                return 'border-green-300/50 bg-green-50 text-green-800 dark:border-green-700/50 dark:bg-green-950 dark:text-green-200';
            case 'error':
                return 'border-red-300/50 bg-red-50 text-red-800 dark:border-red-700/50 dark:bg-red-950 dark:text-red-200';
            case 'warning':
                return 'border-amber-300/50 bg-amber-50 text-amber-800 dark:border-amber-700/50 dark:bg-amber-950 dark:text-amber-200';
            default:
                return 'border-gray-300/60 bg-white text-gray-800 dark:border-gray-700/60 dark:bg-gray-900 dark:text-gray-100';
        }
    }

    return (
        <>
            {children}
            {/* 右下スタック。pointer-events は個別要素で有効化 */}
            <div className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex w-full max-w-sm flex-col gap-2">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3 shadow-lg transition-all ${colorClasses(t)}`}
                        role="status"
                        aria-live="polite" // 重要度は控えめ。error等でも動作は変えない（仕様を維持）
                    >
                        <div className="mt-[2px] text-lg leading-none" aria-hidden>
                            {t.type === 'success' ? '✅' : t.type === 'error' ? '⚠️' : t.type === 'warning' ? '🟠' : 'ℹ️'}
                        </div>
                        <div className="flex-1 text-sm">{t.message}</div>
                        <button
                            className="rounded p-1 text-xs opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                            onClick={() => remove(t.id)}
                            aria-label="閉じる"
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>
        </>
    );
}