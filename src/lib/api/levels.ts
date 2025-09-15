export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readAccessTokenFromCookie,
    verifyAccess,
} from '@/lib/auth/common';

/** Levels テーブルの型定義 */
type LevelRow = {
    level: number;
    required_total_exp: number;
    rewards_note: string | null;
};

/** 認証系の応答はキャッシュさせない */
const NO_STORE = { 'Cache-Control': 'no-store' as const };

/**
 * DBから特定レベルの情報を1件取得する
 * @param level 取得対象のレベル
 */
async function dbGetLevels(level: number): Promise<LevelRow[]> {
    const rows = await sql`
        SELECT level, required_total_exp, rewards_note
        FROM levels
        WHERE level = ${level}
        LIMIT 1
    `;
    return rows as LevelRow[];
}

/**
 * GET /api/levels?level=1
 * - 認証必須
 * - 指定されたレベルの情報を返す
 */
export async function handleGetLevels(req: Request) {
    try {
        // アクセストークンをCookieから読み込み
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' },
                { status: 401, headers: NO_STORE }
            );
        }

        // トークンの検証
        await verifyAccess(token);

        // クエリパラメータから level を取得
        const { searchParams } = new URL(req.url);
        const levelParam = searchParams.get('levels');

        // パラメータ未指定 or 数値変換失敗なら 400
        const level = Number(levelParam);
        if (!levelParam || Number.isNaN(level)) {
            return NextResponse.json(
                { ok: false, error: 'invalid_level_param' },
                { status: 400, headers: NO_STORE }
            );
        }

        // DBから指定レベルを取得
        const levelData = await dbGetLevels(level);
        if (!levelData) {
            return NextResponse.json(
                { ok: false, error: 'level_not_found' },
                { status: 404, headers: NO_STORE }
            );
        }

        return NextResponse.json(
            { ok: true, levels: levelData },
            { status: 200, headers: NO_STORE }
        );
    } catch (err) {
        console.error('handleGetLevels failed:', err);
        return NextResponse.json(
            { ok: false, error: 'failed_to_fetch' },
            { status: 500, headers: NO_STORE }
        );
    }
}
