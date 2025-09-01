// Footer.tsx
export default function Footer() {
    return (
        <footer className="mt-6 border-t bg-gray-50 dark:bg-gray-900 py-8 text-center text-sm text-gray-600 dark:text-gray-400">
            <div className="mx-auto max-w-6xl px-4">
                <p className="mb-3 text-gray-700 dark:text-gray-300">
                    このアプリは <span className="font-semibold">学習目的のデモ</span> です。利用は自己責任でお願いします。
                </p>
                <nav className="flex justify-center space-x-6">
                    <a className="transition hover:text-blue-600 dark:hover:text-blue-400 underline-offset-4 hover:underline" href="/terms">利用規約</a>
                    <a className="transition hover:text-blue-600 dark:hover:text-blue-400 underline-offset-4 hover:underline" href="/privacy">プライバシー</a>
                </nav>
                <div className="mt-4 text-xs text-gray-400 dark:text-gray-500">
                    © {new Date().getFullYear()} Demo App
                </div>
            </div>
        </footer>
    );
}
