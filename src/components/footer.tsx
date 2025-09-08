import Link from 'next/link';

/**
 * グローバルフッター
 * - 内部リンクは <Link> でプリフェッチ＆高速遷移
 * - 著作権表記は 2025-今年。もし今年=2025なら単年表示にする
 * - アクセシビリティ: <nav aria-label="フッターナビゲーション">
 */
export default function Footer() {
    // 表示年の整形：開始年(固定)と現在年を比較して、同じなら単年、異なれば範囲（例: 2025-2027）
    const START_YEAR = 2025;
    const currentYear = new Date().getFullYear();
    const yearText = START_YEAR === currentYear ? `${currentYear}` : `${START_YEAR}-${currentYear}`;

    return (
        <footer
            className="mt-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 py-8 text-center text-sm text-gray-600 dark:text-gray-400"
            role="contentinfo"
        >
            <div className="mx-auto max-w-6xl px-4">
                {/* 補足説明（製品ではない旨） */}
                <p className="mb-3 text-gray-700 dark:text-gray-300">
                    このアプリは <span className="font-semibold">学習目的のデモ</span> です。利用は自己責任でお願いします。
                </p>

                {/* フッターナビゲーション：内部リンクには <Link> を使用 */}
                <nav className="flex justify-center space-x-6" aria-label="フッターナビゲーション">
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

                {/* 著作権表記：同年なら単年、異なれば範囲表示 */}
                <div className="mt-4 text-xs text-gray-400 dark:text-gray-500">
                    <small>
                        © <time dateTime={String(currentYear)}>{yearText}</time> ToDo Quest
                    </small>
                </div>
            </div>
        </footer>
    );
}
