'use client';

import React, { useEffect, useRef, useState } from 'react';

/** トーストの型 */
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type ToastItem = {
    id: string;
    type: ToastType;
    message: string;
    duration?: number; // ms
};

/** 低依存なシンプル pub/sub（どこからでも showToast 可能） */
type Subscriber = (t: ToastItem) => void;
const subscribers = new Set<Subscriber>();

/** グローバル関数: どこからでも呼べる */
export function showToast(input: { type: ToastType; message: string; duration?: number }) {
    const toast: ToastItem = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: input.type,
        message: input.message,
        duration: input.duration ?? 3000,
    };
    subscribers.forEach((fn) => fn(toast));
}

/** Provider: 実際の描画担当。アプリのどこか1回だけ置く */
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const timers = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        const handler: Subscriber = (t) => {
            setToasts((prev) => [...prev, t]);
            const id = window.setTimeout(() => {
                setToasts((prev) => prev.filter((x) => x.id !== t.id));
                timers.current.delete(t.id);
            }, t.duration ?? 3000);
            timers.current.set(t.id, id);
        };
        subscribers.add(handler);
        return () => {
            subscribers.delete(handler);
            // 後片付け
            timers.current.forEach((id) => clearTimeout(id));
            timers.current.clear();
        };
    }, []);

    function remove(id: string) {
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }

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
            {/* 画面右下にスタック */}
            <div className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex w-full max-w-sm flex-col gap-2">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3 shadow-lg transition-all ${colorClasses(
                            t
                        )}`}
                        role="status"
                        aria-live="polite"
                    >
                        <div className="mt-[2px] text-lg leading-none">
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
