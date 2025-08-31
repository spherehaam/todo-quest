export const runtime = 'nodejs';

export default function PrivacyPage() {
    return (
        <main className="mx-auto max-w-3xl p-6 space-y-6">
            <h1 className="text-2xl font-semibold">プライバシーポリシー（簡易）</h1>
            <p>本アプリは学習用デモとして、次の情報を取り扱う場合があります。</p>

            <section>
                <h2 className="text-xl font-semibold mt-4 mb-2">収集する情報</h2>
                <ul className="list-disc pl-6 space-y-1">
                    <li>ログイン時のメールアドレス（ユーザー識別のため）</li>
                    <li>アプリ利用に伴うタスク等の入力データ</li>
                    <li>Cookie（認証・CSRF対策のため）</li>
                </ul>
            </section>

            <section>
                <h2 className="text-xl font-semibold mt-4 mb-2">利用目的</h2>
                <p>認証・表示・学習検証のためにのみ利用し、第三者提供は行いません。</p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mt-4 mb-2">注意事項</h2>
                <p>
                    学習目的のため、データの永続性やセキュリティを商用水準で保証するものではありません。
                    機能検証や不具合対応の過程でデータが消失する可能性があります。
                </p>
            </section>

            <p className="text-sm text-gray-500">最終更新日: 2025-08-31</p>
        </main>
    );
}
