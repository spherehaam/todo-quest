export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readAccessTokenFromCookie,
    verifyAccess,
} from '@/lib/auth/common';

// --- DB レコード型 ---
type LevelRow = {
    level: number;                // レベル値
    required_total_exp: number;   // 累計必要 EXP
    rewards_note: string | null;  // 特典メモ（null 可）
};

// 認証系の応答はキャッシュ禁止
const NO_STORE = { 'Cache-Control': 'no-store' as const };

/**
 * DB から指定 level のレコードを1件取得
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
 * GET /api/levels ハンドラ
 * 1) Cookie から access を取得し検証
 * 2) query param `levels` を数値化
 * 3) levels テーブルから1件取得
 * 4) JSON 応答（キャッシュ禁止ヘッダ付き）
 */
export async function handleGetLevels(req: Request) {
    try {
        // --- 1) 認証チェック ---
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' },
                { status: 401, headers: NO_STORE }
            );
        }
        await verifyAccess(token);

        // --- 2) パラメータ検証 ---
        const { searchParams } = new URL(req.url);
        const levelParam = searchParams.get('levels');
        const level = Number(levelParam);
        if (!levelParam || Number.isNaN(level)) {
            return NextResponse.json(
                { ok: false, error: 'invalid_level_param' },
                { status: 400, headers: NO_STORE }
            );
        }

        // --- 3) DB 取得 ---
        const levelData = await dbGetLevels(level);
        if (!levelData) {
            return NextResponse.json(
                { ok: false, error: 'level_not_found' },
                { status: 404, headers: NO_STORE }
            );
        }

        // --- 4) 成功応答 ---
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