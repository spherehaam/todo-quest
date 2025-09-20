import Link from 'next/link';

/**
 * アプリ全体のフッターコンポーネント
 * - 利用規約・プライバシーポリシーへのリンク
 * - コピーライト表記（開始年〜現在年）
 */
export default function Footer() {
    /** コピーライト開始年 */
    const START_YEAR = 2025;
    /** 現在の西暦年 */
    const currentYear = new Date().getFullYear();

    /**
     * 表示用の年表記
     * - 開始年と現在年が同じ場合: "2025"
     * - 異なる場合: "2025-2027" のように範囲で表記
     */
    const yearText =
        START_YEAR === currentYear
            ? `${currentYear}`
            : `${START_YEAR}-${currentYear}`;

    return (
        <footer
            className="mt-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 py-8 text-center text-sm text-gray-600 dark:text-gray-400"
            role="contentinfo"
        >
            <div className="mx-auto max-w-6xl px-4">
                {/* アプリの説明 */}
                <p className="mb-3 text-gray-700 dark:text-gray-300">
                    このアプリは <span className="font-semibold">学習目的のデモ</span> です。
                    利用は自己責任でお願いします。
                </p>

                {/* フッターナビゲーション */}
                <nav
                    className="flex justify-center space-x-6"
                    aria-label="フッターナビゲーション"
                >
                    <Link
                        href="/terms"
                        className="transition underline-offset-4 hover:underline hover:text-blue-600 dark:hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 rounded-sm"
                    >
                        利用規約
                    </Link>
                    <Link
                        href="/privacy"
                        className="transition underline-offset-4 hover:underline hover:text-blue-600 dark:hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 rounded-sm"
                    >
                        プライバシー
                    </Link>
                </nav>

                {/* コピーライト表記 */}
                <div className="mt-4 text-xs text-gray-400 dark:text-gray-500">
                    <small>
                        © <time dateTime={String(currentYear)}>{yearText}</time> ToDo Quest
                    </small>
                </div>
            </div>
        </footer>
    );
}
