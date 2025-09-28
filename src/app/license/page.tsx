export const runtime = 'nodejs';

export default function LicensePage() {
    return (
        <main className="mx-auto max-w-3xl p-6 space-y-6">
            <h1 className="text-2xl font-semibold">ライセンス（閲覧のみ）</h1>
            <p>
                本リポジトリのソースコードは「閲覧・レビュー・学習」の目的に限り、
                GitHub 上での表示・クローンを許可します。ただし、以下の行為を一切禁止します。
            </p>

            <section>
                <h2 className="text-xl font-semibold mt-4 mb-2">禁止事項</h2>
                <ol className="list-decimal pl-6 space-y-1">
                    <li>ソースコードの利用（実行・ビルド・組み込み・運用）</li>
                    <li>改変・派生物の作成</li>
                    <li>複製・再配布・再ライセンス</li>
                    <li>商用・非商用を問わず、上記に準ずる一切の行為</li>
                </ol>
            </section>

            <section>
                <h2 className="text-xl font-semibold mt-4 mb-2">例外的な許諾</h2>
                <p>
                    例外的な許諾が必要な場合は、本リポジトリの Issues にてご相談ください。
                </p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mt-4 mb-2">免責事項</h2>
                <p>
                    本ソフトウェアは<strong>無保証（AS IS）</strong>で提供されます。
                    いかなる場合も、著作権者は直接・間接の損害について責任を負いません。
                </p>
            </section>

            <p className="text-sm text-gray-500">最終更新日: 2025-09-28</p>
        </main>
    );
}
