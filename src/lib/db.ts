import { neon } from '@neondatabase/serverless';

/**
 * DB 接続初期化
 *
 * - Neon サーバーレス用のクライアントを生成
 * - `sql` テンプレートタグでクエリを発行できる
 */
if (!process.env.NEON_DATABASE_URL) {
    // 環境変数が無い場合は即時エラーにしてデプロイで気付けるようにする
    throw new Error('NEON_DATABASE_URL is not set');
}

export const sql = neon(process.env.NEON_DATABASE_URL);
