export const runtime = 'nodejs';

export default function TermsPage() {
    return (
        <main className="mx-auto max-w-3xl p-6 space-y-6">
            <h1 className="text-2xl font-semibold">利用規約</h1>
            <p>
                本アプリは学習目的のデモとして提供されます。ログインされた場合、以下に同意したものとみなします。
            </p>

            <section>
                <h2 className="text-xl font-semibold mt-4 mb-2">1. 提供目的</h2>
                <p>本アプリは個人の学習・ポートフォリオ公開を目的としたデモです。</p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mt-4 mb-2">2. 免責事項</h2>
                <p>
                    本アプリは「現状有姿」で提供され、いかなる明示または黙示の保証も行いません。
                    利用により生じた損害について、作成者は一切の責任を負いません。
                </p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mt-4 mb-2">3. データの取扱い</h2>
                <p>
                    学習目的のため、サービス提供の継続性やデータの完全性は保証されません。
                    不具合やメンテナンス等によりデータが消去・改変される可能性があります。
                </p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mt-4 mb-2">4. 禁止事項</h2>
                <ul className="list-disc pl-6 space-y-1">
                    <li>法令または公序良俗に反する行為</li>
                    <li>第三者の権利を侵害する行為</li>
                    <li>脆弱性の悪用、過度な負荷、その他運用を妨げる行為</li>
                    <li>本アプリのソースコードを無断で利用・改変・再配布する行為</li>
                </ul>
            </section>

            <section>
                <h2 className="text-xl font-semibold mt-4 mb-2">5. 規約の変更</h2>
                <p>
                    本規約は予告なく変更される場合があります。変更後の規約は本ページに掲示した時点で効力を生じます。
                </p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mt-4 mb-2">6. お問い合わせ</h2>
                <p>
                    本アプリに関するお問い合わせは、ポートフォリオ記載の連絡先または
                    GitHub Issues にてお願いします。
                </p>
            </section>

            <section>
                <h2 className="text-xl font-semibold mt-4 mb-2">7. ライセンスおよび権利</h2>
                <p>
                    本アプリのソースコードは「閲覧のみ」を目的として公開されます。
                    <strong>実行・利用・改変・再配布等は一切禁止</strong>です（詳細は
                    <a className="underline" href="/license">ライセンス</a>を参照）。
                </p>
                <p>
                    外部からの改善提案（Pull Request）は歓迎しますが、当該提案は
                    ライセンスに従うものとし、利用許諾を付与するものではありません。
                </p>
            </section>

            <p className="text-sm text-gray-500">
                最終更新日: 2025-09-28
            </p>
        </main>
    );
}
