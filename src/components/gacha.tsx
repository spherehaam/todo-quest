'use client';

import { useCallback, useMemo, useState } from 'react';
import { showToast } from '@/components/toast';

/** --- 型定義 --- */
export type Rarity = 'SSR' | 'SR' | 'R' | 'N';

export type GachaItem = {
    id: string;
    name: string;
    rarity: Rarity;
    amount?: number;
};

export type PullResult = {
    items: GachaItem[];
};

type PullAPIResponse =
    | { ok: true; result: PullResult }
    | { ok: false; error: string; detail?: string };

/** --- レア度ごとの装飾設定 --- */
const RARITY_DECOR: Record<
    Rarity,
    { label: string; ring: string; glow: string; text: string; badge: string }
> = {
    SSR: {
        label: 'SSR',
        ring: 'ring-4 ring-yellow-400/80',
        glow: 'shadow-[0_0_24px_rgba(250,204,21,0.6)]',
        text: 'text-yellow-600 dark:text-yellow-300',
        badge: 'bg-gradient-to-r from-amber-500 to-yellow-400 text-white',
    },
    SR: {
        label: 'SR',
        ring: 'ring-4 ring-fuchsia-400/70',
        glow: 'shadow-[0_0_20px_rgba(232,121,249,0.5)]',
        text: 'text-fuchsia-600 dark:text-fuchsia-300',
        badge: 'bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white',
    },
    R: {
        label: 'R',
        ring: 'ring-2 ring-blue-400/70',
        glow: 'shadow-[0_0_12px_rgba(96,165,250,0.45)]',
        text: 'text-blue-600 dark:text-blue-300',
        badge: 'bg-blue-500 text-white',
    },
    N: {
        label: 'N',
        ring: 'ring-1 ring-gray-300',
        glow: 'shadow-none',
        text: 'text-gray-600 dark:text-gray-300',
        badge: 'bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-100',
    },
};

/** --- モーダル --- */
function Modal({
    open,
    onClose,
    title,
    children,
}: {
    open: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
}) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={title ?? 'dialog'}
            onMouseDown={onClose}
        >
            <div
                className="w-full max-w-5xl rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {title && (
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
                )}
                <div className="p-4">{children}</div>
            </div>
        </div>
    );
}

/** --- 単一カード --- */
function ItemCard({ item, highlight }: { item: GachaItem; highlight?: boolean }) {
    const deco = RARITY_DECOR[item.rarity];
    return (
        <div
            className={`relative flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-sm transition dark:border-gray-800 dark:bg-gray-950 ${
                highlight ? deco.glow : ''
            }`}
        >
            <span
                className={`absolute -top-2 right-2 rounded-full px-2 py-0.5 text-xs ${deco.badge}`}
            >
                {deco.label}
            </span>
            <div
                className={`mb-3 grid h-24 w-24 place-content-center rounded-2xl bg-gray-50 text-3xl dark:bg-gray-900 ${deco.ring}`}
            >
                🎁
            </div>
            <div className={`mb-1 line-clamp-2 text-sm font-semibold ${deco.text}`}>
                {item.name}
            </div>
            {typeof item.amount === 'number' && (
                <div className="text-xs text-gray-500 dark:text-gray-400">×{item.amount}</div>
            )}
        </div>
    );
}

/** --- 結果グリッド --- */
function ResultGrid({ items }: { items: GachaItem[] }) {
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map((it) => (
                <ItemCard
                    key={it.id + Math.random().toString(36)}
                    item={it}
                    highlight={it.rarity === 'SSR' || it.rarity === 'SR'}
                />
            ))}
        </div>
    );
}

/** --- API呼び出し --- */
async function pullGacha(count: 1 | 10): Promise<PullResult> {
    const res = await fetch(`/api/gacha?count=${count}`, { method: 'GET', cache: 'no-store' });
    const json = (await res.json()) as PullAPIResponse;

    if (!res.ok || !json.ok) {
        // 型安全なエラーメッセージ抽出
        let msg = res.statusText || 'ガチャ結果の取得に失敗しました。';
        if ('error' in json) {
            msg = json.error;
            if ('detail' in json && json.detail) {
                msg += `: ${json.detail}`;
            }
        }
        throw new Error(msg);
    }
    return json.result;
}

/** --- メインコンポーネント --- */
export default function Gacha() {
    const [pulling, setPulling] = useState(false);
    const [lastResult, setLastResult] = useState<PullResult | null>(null);
    const [isResultOpen, setResultOpen] = useState(false);
    const [tickets, setTickets] = useState<number>(10);

    /** ガチャ実行 */
    const handlePull = useCallback(
        async (count: 1 | 10) => {
            const need = count === 10 ? 10 : 1;
            if (tickets < need) {
                showToast({ type: 'warning', message: 'チケットが不足しています。' });
                return;
            }

            setPulling(true);
            try {
                const result = await pullGacha(count);
                setLastResult(result);
                setResultOpen(true);
                setTickets((v) => v - need);

                const hasSSR = result.items.some((i) => i.rarity === 'SSR');
                showToast({
                    type: 'success',
                    message: hasSSR ? 'SSR入手おめでとう！🎉' : 'ガチャ結果を表示しました。',
                });
            } catch {
                showToast({ type: 'error', message: 'ガチャに失敗しました。' });
            } finally {
                setPulling(false);
            }
        },
        [tickets]
    );

    /** SSR優先で並べ替え（表示用） */
    const sortedLastItems = useMemo(() => {
        if (!lastResult?.items) return [];
        const order: Record<Rarity, number> = { SSR: 0, SR: 1, R: 2, N: 3 };
        return [...lastResult.items].sort((a, b) => order[a.rarity] - order[b.rarity]);
    }, [lastResult]);

    return (
        <div className="space-y-4">
            {/* ガチャヘッダー */}
            <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-sm font-semibold">ガチャ</h2>
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm dark:border-gray-800 dark:bg-gray-950">
                        <span className="text-gray-500">チケット</span>
                        <span className="font-semibold">{tickets}</span>
                    </div>
                </div>

                {/* ガチャボタン群 */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <button
                        type="button"
                        disabled={pulling}
                        onClick={() => handlePull(1)}
                        className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        単発
                    </button>
                    <button
                        type="button"
                        disabled={pulling}
                        onClick={() => handlePull(10)}
                        className="rounded-xl bg-gradient-to-r from-rose-600 to-orange-500 px-5 py-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        10連
                    </button>
                    <button
                        type="button"
                        disabled
                        className="rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm font-semibold text-gray-400 shadow-sm dark:border-gray-800 dark:bg-gray-950"
                        title="シンプル版では未実装"
                    >
                        提供割合・ピックアップ（未）
                    </button>
                </div>

                {pulling && (
                    <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
                        演出中...
                    </div>
                )}
            </section>

            {/* 結果モーダル */}
            <Modal open={isResultOpen} onClose={() => setResultOpen(false)} title="ガチャ結果">
                {!lastResult ? (
                    <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        結果がありません。
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                            <div className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                排出一覧
                            </div>
                            <ResultGrid items={sortedLastItems} />
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                                onClick={() => setResultOpen(false)}
                                className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                            >
                                閉じる
                            </button>
                            <button
                                onClick={() => handlePull(1)}
                                className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99]"
                            >
                                もう1回（単発）
                            </button>
                            <button
                                onClick={() => handlePull(10)}
                                className="rounded-lg bg-gradient-to-r from-rose-600 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99]"
                            >
                                もう1回（10連）
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
