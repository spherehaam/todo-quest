export default function Footer() {
    return (
        <footer className="mt-10 border-t py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            <p className="mb-2">
                このアプリは学習目的のデモです。利用は自己責任でお願いします。
            </p>
            <nav className="space-x-4">
                <a className="underline hover:no-underline" href="/terms">利用規約</a>
                <a className="underline hover:no-underline" href="/privacy">プライバシー</a>
            </nav>
        </footer>
    );
}
