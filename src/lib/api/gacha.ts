export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { readAccessTokenFromCookie, verifyAccess } from '@/lib/auth/common';

/** --- 型定義 --- */
type Rarity = 'N' | 'R' | 'SR' | 'SSR';

/** DBから取得するアイテム行 */
type RowItem = {
    id: string;
    name: string;
    rarity: Rarity;
    amount_min: number | null;
    amount_max: number | null;
};

/** フロントに返す整形済みアイテム */
type FrontItem = {
    id: string;
    name: string;
    rarity: Rarity;
    amount?: number;
};

type PoolRow = {
    id: string;
    slug: string;
    guarantee_min_rarity: Rarity | null;
    end_at: string;
};

type TicketsRow = {
    gacha_tickets: number;
};

/** キャッシュ抑止ヘッダ */
const NO_STORE = { 'Cache-Control': 'no-store' as const };

/**
 * 金額や数量が範囲指定されている場合にランダムな値を返す。
 * どちらもnullなら undefined。
 */
function pickAmount(min: number | null, max: number | null): number | undefined {
    if (min == null && max == null) return undefined;
    const lo = Math.max(0, min ?? 0);
    const hi = Math.max(lo, max ?? lo);
    return hi === lo ? lo : lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * 現在有効なガチャプールを取得。
 * poolSlug が指定されていれば優先。
 * なければ default-2025 を優先して最も終了が近いプールを返す。
 */
async function fetchActivePool(poolSlug?: string): Promise<PoolRow | null> {
    if (poolSlug) {
        const rows = (await sql`
            SELECT id, slug, guarantee_min_rarity, end_at
            FROM gacha_pools
            WHERE slug = ${poolSlug}
              AND is_active = TRUE
              AND now() BETWEEN start_at AND end_at
            LIMIT 1
        `) as unknown as PoolRow[];
        if (rows.length > 0) return rows[0];
    }

    const prioritized = (await sql`
        WITH active AS (
            SELECT id, slug, guarantee_min_rarity, end_at,
                   (slug = 'default-2025') AS is_default
            FROM gacha_pools
            WHERE is_active = TRUE
              AND now() BETWEEN start_at AND end_at
        )
        SELECT id, slug, guarantee_min_rarity, end_at
        FROM active
        ORDER BY is_default DESC, end_at ASC
        LIMIT 1
    `) as unknown as PoolRow[];

    return prioritized[0] ?? null;
}


/**
 * 通常抽選候補が存在するかチェック
 */
async function baseCandidatesExist(poolId: string): Promise<boolean> {
    const rows = await sql`
        SELECT EXISTS (
            SELECT 1
            FROM gacha_pool_items gpi
            JOIN gacha_items gi ON gi.id = gpi.item_id
            WHERE gpi.pool_id = ${poolId}
              AND gi.is_active = TRUE
              AND COALESCE(gpi.pity_only, FALSE) = FALSE
        ) AS exists;
    `;
    return Boolean(rows[0]?.exists);
}

/**
 * 保証枠（例：SR以上）が存在するかチェック
 */
async function guaranteeCandidatesExist(poolId: string, minRarity: Rarity): Promise<boolean> {
    const rows = await sql`
        SELECT EXISTS (
            SELECT 1
            FROM gacha_pool_items gpi
            JOIN gacha_items gi ON gi.id = gpi.item_id
            WHERE gpi.pool_id = ${poolId}
              AND gi.is_active = TRUE
              AND gi.rarity >= ${minRarity}::rarity
        ) AS exists;
    `;
    return Boolean(rows[0]?.exists);
}

/**
 * プール内から1件抽選する。
 * rarityFilter が指定されていれば、そのレア度以上のみから抽選。
 * 重み付きランダム抽選を ORDER BY -LN(random()) / weight で実現。
 */
async function pickOne(poolId: string, rarityFilter?: Rarity): Promise<RowItem | null> {
    const rows = await sql`
        SELECT gi.id, gi.name, gi.rarity, gi.amount_min, gi.amount_max
        FROM gacha_pool_items gpi
        JOIN gacha_items gi ON gi.id = gpi.item_id
        WHERE gpi.pool_id = ${poolId}
          AND gi.is_active = TRUE
          AND COALESCE(gpi.pity_only, FALSE) = FALSE
          ${rarityFilter ? sql`AND gi.rarity >= ${rarityFilter}::rarity` : sql``}
        ORDER BY -LN(random()) / GREATEST(gpi.weight, 1)
        LIMIT 1;
    `;
    return (rows[0] as RowItem) ?? null;
}

/**
 * GET /api/gacha ハンドラ
 * - count=1 または 10 の指定に応じて抽選を実施
 * - 保証枠付き10連対応
 */
export async function handleGetGacha(req: Request) {
    try {
        // 1) 認証チェック
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' as const },
                { status: 401, headers: NO_STORE }
            );
        }

        // --- クエリパラメータ取得 ---
        const url = new URL(req.url);
        const countParam = url.searchParams.get('count');
        const poolParam = url.searchParams.get('pool') || undefined;
        const count = countParam === '1' ? 1 : 10;

        // --- 有効プール取得 ---
        const poolRow = await fetchActivePool(poolParam);
        if (!poolRow) {
            return NextResponse.json(
                { ok: false, error: 'no_active_pool', detail: '開催中のプールがありません。' },
                { status: 400, headers: NO_STORE }
            );
        }

        const activePoolId = poolRow.id;
        const guaranteeMin = poolRow.guarantee_min_rarity;

        // --- 候補存在チェック ---
        if (!(await baseCandidatesExist(activePoolId))) {
            return NextResponse.json(
                { ok: false, error: 'no_candidates', detail: '抽選候補が空です。' },
                { status: 400, headers: NO_STORE }
            );
        }

        // --- 抽選実施 ---
        const results: RowItem[] = [];

        if (count === 1) {
            // 単発
            const item = await pickOne(activePoolId);
            if (!item)
                return NextResponse.json(
                    { ok: false, error: 'pick_failed', detail: '抽選に失敗しました。' },
                    { status: 500, headers: NO_STORE }
                );
            results.push(item);
        } else {
            // 10連（9 + 1保証枠）
            for (let i = 0; i < 9; i++) {
                const item = await pickOne(activePoolId);
                if (!item)
                    return NextResponse.json(
                        { ok: false, error: 'pick_failed', detail: '抽選に失敗しました。' },
                        { status: 500, headers: NO_STORE }
                    );
                results.push(item);
            }

            // 保証枠（例：SR以上）
            let last: RowItem | null = null;
            if (guaranteeMin && (await guaranteeCandidatesExist(activePoolId, guaranteeMin))) {
                last = await pickOne(activePoolId, guaranteeMin);
            }
            if (!last) last = await pickOne(activePoolId);
            if (!last)
                return NextResponse.json(
                    { ok: false, error: 'pick_failed', detail: '抽選に失敗しました。(guarantee)' },
                    { status: 500, headers: NO_STORE }
                );
            results.push(last);
        }

        // --- 整形して返却 ---
        const items: FrontItem[] = results.map((r) => ({
            id: r.id,
            name: r.name,
            rarity: r.rarity,
            amount: pickAmount(r.amount_min, r.amount_max),
        }));

        return NextResponse.json(
            { ok: true, result: { items } },
            { status: 200, headers: NO_STORE }
        );
    } catch (err) {
        console.error('handleGetGacha failed:', err);
        return NextResponse.json(
            { ok: false, error: 'server_error', detail: '予期せぬサーバーエラーが発生しました。' },
            { status: 500, headers: NO_STORE }
        );
    }
}

/**
 * GET /api/gacha/me
 * - Cookie のアクセストークンを検証
 * - users テーブルから現在のガチャチケット枚数を取得
 * - { ok: true, tickets } を返す（キャッシュ禁止）
 */
export async function handleGetGachaMe() {
    try {
        // 1) 認証チェック
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' as const },
                { status: 401, headers: NO_STORE }
            );
        }

        const payload = (await verifyAccess(token)) as { sub: string };
        const userId = payload.sub;

        // 2) DB 取得（型は as で明示）
        const rows = (await sql`
            SELECT COALESCE(gacha_tickets, 0) AS gacha_tickets
            FROM users
            WHERE id = ${userId}
            LIMIT 1
        `) as unknown as TicketsRow[];

        const tickets = rows.length > 0 ? rows[0].gacha_tickets : 0;

        // 3) 成功レスポンス
        return NextResponse.json(
            { ok: true as const, tickets },
            { status: 200, headers: NO_STORE }
        );
    } catch (err) {
        console.error('handleGetGachaMe failed:', err);
        return NextResponse.json(
            { ok: false, error: 'server_error' as const },
            { status: 500, headers: NO_STORE }
        );
    }
}