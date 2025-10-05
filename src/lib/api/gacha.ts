export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { readAccessTokenFromCookie, verifyAccess } from '@/lib/auth/common';

/**
 * ------------------------------------------------------------
 * サーバー: ガチャAPIハンドラ
 * - GET /api/gacha        -> handleGetGacha
 * - GET /api/gacha/me     -> handleGetGachaMe
 * ------------------------------------------------------------
 */

type Rarity = 'N' | 'R' | 'SR' | 'SSR';

/**
 * DB行: アイテム（プール結合後）
 */
type RowItem = {
    id: string;
    name: string;
    rarity: Rarity;
    amount_min: number | null;
    amount_max: number | null;
};

/**
 * レスポンス用: フロント向けのアイテム表現
 */
type FrontItem = {
    id: string;
    name: string;
    rarity: Rarity;
    amount?: number;
};

/**
 * DB行: ガチャプール
 */
type PoolRow = {
    id: string;
    slug: string;
    guarantee_min_rarity: Rarity | null;
    end_at: string;
};

/**
 * DB行: チケット数
 */
type TicketsRow = {
    gacha_tickets: number;
};

/** no-store 応答ヘッダ */
const NO_STORE = { 'Cache-Control': 'no-store' as const };

/**
 * [ユーティリティ] 最小/最大から数量を抽選
 * - min/max が両方 null のときは undefined（数量非表示）
 * - 0 未満は 0 に丸め、min > max の場合は max を min まで引き上げ
 */
function pickAmount(min: number | null, max: number | null): number | undefined {
    if (min == null && max == null) return undefined;
    const lo = Math.max(0, min ?? 0);
    const hi = Math.max(lo, max ?? lo);
    return hi === lo ? lo : lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * アクティブなプールを取得
 * - 明示 slug 指定があればそれを優先
 * - なければ default-2025 を優先しつつ、終了が早い順で 1 件
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
 * 候補存在チェック: 通常抽選対象（pity_only=FALSE）
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
 * 候補存在チェック: 最低レア保証対象
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
 * 1件抽選
 * - rarityFilter があればそのレア以上から抽選
 * - 重み付きランダム（重み 0/NULL を 1 にフォールバック）
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
 * チケットを減算
 * - Cookie からアクセストークンを読取り、検証 → userId で更新
 * - マイナスにはならないよう GREATEST を使用
 */
async function reduceGachaTickets(count: number) {
    const token = await readAccessTokenFromCookie();
    if (!token) {
        throw new Error('no_auth');
    }

    const payload = (await verifyAccess(token)) as { sub: string };
    const userId = payload.sub;

    await sql`
        UPDATE users
        SET gacha_tickets = GREATEST(gacha_tickets - ${count}, 0)
        WHERE id = ${userId};
    `;
}

/**
 * GET /api/gacha
 * - 単発: 1件
 * - 10連: 9件 + 最低レア保証 1件（該当候補がない場合は通常から）
 * - 成功時: { ok: true, result: { items: FrontItem[] } }
 */
export async function handleGetGacha(req: Request) {
    try {
        // 認証必須
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' as const },
                { status: 401, headers: NO_STORE }
            );
        }

        // クエリ解析（count, pool）
        const url = new URL(req.url);
        const countParam = url.searchParams.get('count');
        const poolParam = url.searchParams.get('pool') || undefined;
        const count = countParam === '1' ? 1 : 10; // 省略時は 10 連

        // アクティブプールの決定
        const poolRow = await fetchActivePool(poolParam);
        if (!poolRow) {
            return NextResponse.json(
                { ok: false, error: 'no_active_pool', detail: '開催中のプールがありません。' },
                { status: 400, headers: NO_STORE }
            );
        }

        const activePoolId = poolRow.id;
        const guaranteeMin = poolRow.guarantee_min_rarity;

        // 候補存在チェック
        if (!(await baseCandidatesExist(activePoolId))) {
            return NextResponse.json(
                { ok: false, error: 'no_candidates', detail: '抽選候補が空です。' },
                { status: 400, headers: NO_STORE }
            );
        }

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
            // 10連（最初の 9 件）
            for (let i = 0; i < 9; i++) {
                const item = await pickOne(activePoolId);
                if (!item)
                    return NextResponse.json(
                        { ok: false, error: 'pick_failed', detail: '抽選に失敗しました。' },
                        { status: 500, headers: NO_STORE }
                    );
                results.push(item);
            }

            // 最後の 1 件: 最低レア保証
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

        // チケット消費（最後に）
        await reduceGachaTickets(count);

        // フロント用整形（数量は最終ここで決定）
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
        // 例外ログのみ出力（詳細はサーバーログで確認）
        console.error('handleGetGacha failed:', err);
        return NextResponse.json(
            { ok: false, error: 'server_error', detail: '予期せぬサーバーエラーが発生しました。' },
            { status: 500, headers: NO_STORE }
        );
    }
}

/**
 * GET /api/gacha/me
 * - ログインユーザーの所持チケット数を返却
 * - 成功時: { ok: true, tickets: number }
 */
export async function handleGetGachaMe() {
    try {
        // 認証必須
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' as const },
                { status: 401, headers: NO_STORE }
            );
        }

        const payload = (await verifyAccess(token)) as { sub: string };
        const userId = payload.sub;

        // ユーザーのチケット数を読み取り（NULL は 0 へ）
        const rows = (await sql`
            SELECT COALESCE(gacha_tickets, 0) AS gacha_tickets
            FROM users
            WHERE id = ${userId}
            LIMIT 1
        `) as unknown as TicketsRow[];

        const tickets = rows.length > 0 ? rows[0].gacha_tickets : 0;

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
