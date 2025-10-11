export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { readAccessTokenFromCookie, verifyAccess } from '@/lib/auth/common';

/**
 * ------------------------------------------------------------
 * サーバー: ガチャAPIハンドラ
 * - GET /api/gacha           -> handleGetGacha
 * - GET /api/gacha/me        -> handleGetGachaMe
 * - GET /api/gacha/history   -> handleGetGachaHistory   ← 追加
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
    icon_url: string | null;
};

/**
 * レスポンス用: フロント向けのアイテム表現
 */
type FrontItem = {
    id: string;
    name: string;
    rarity: Rarity;
    amount?: number;
    /** Neonのgacha_items.icon_url（例: 'icons/item-001.png'）。null/未定義可 */
    icon_url?: string | null;
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
    type ExistsRow = { exists: boolean };
    const rows = (await sql`
        SELECT EXISTS (
            SELECT 1
            FROM gacha_pool_items gpi
            JOIN gacha_items gi ON gi.id = gpi.item_id
            WHERE gpi.pool_id = ${poolId}
              AND gi.is_active = TRUE
              AND COALESCE(gpi.pity_only, FALSE) = FALSE
        ) AS exists;
    `) as unknown as ExistsRow[];
    return Boolean(rows[0]?.exists);
}

/**
 * 候補存在チェック: 最低レア保証対象
 */
async function guaranteeCandidatesExist(poolId: string, minRarity: Rarity): Promise<boolean> {
    type ExistsRow = { exists: boolean };
    const rows = (await sql`
        SELECT EXISTS (
            SELECT 1
            FROM gacha_pool_items gpi
            JOIN gacha_items gi ON gi.id = gpi.item_id
            WHERE gpi.pool_id = ${poolId}
              AND gi.is_active = TRUE
              AND gi.rarity >= ${minRarity}::rarity
        ) AS exists;
    `) as unknown as ExistsRow[];
    return Boolean(rows[0]?.exists);
}

/**
 * 1件抽選
 * - rarityFilter があればそのレア以上から抽選
 * - 重み付きランダム（重み 0/NULL を 1 にフォールバック）
 * - icon_url も取得
 */
async function pickOne(poolId: string, rarityFilter?: Rarity): Promise<RowItem | null> {
    const rows = (await sql`
        SELECT gi.id, gi.name, gi.rarity, gi.amount_min, gi.amount_max, gi.icon_url
        FROM gacha_pool_items gpi
        JOIN gacha_items gi ON gi.id = gpi.item_id
        WHERE gpi.pool_id = ${poolId}
          AND gi.is_active = TRUE
          AND COALESCE(gpi.pity_only, FALSE) = FALSE
          ${rarityFilter ? sql`AND gi.rarity >= ${rarityFilter}::rarity` : sql``}
        ORDER BY -LN(random()) / GREATEST(gpi.weight, 1)
        LIMIT 1;
    `) as unknown as RowItem[];
    return rows[0] ?? null;
}

/**
 * ガチャ履歴を1レコード挿入（単発ごと）
 * - draw_count は 1 固定（10連はループ内で1件ずつ呼ぶため）
 * - executed_at / created_at は DB の DEFAULT を使用
 */
async function insertGachaHistory(params: {
    userId: string;
    poolId: string;
    item: {
        id: string;
        name: string;
        rarity: Rarity;
        icon_url: string | null;
        amount?: number;
    };
}) {
    const payload = [
        {
            item_id: params.item.id,
            name: params.item.name,
            rarity: params.item.rarity,
            icon_url: params.item.icon_url,
            amount: params.item.amount ?? null,
        },
    ];

    await sql`
        INSERT INTO gacha_history (id, user_id, pool_id, draw_count, result_items)
        VALUES (
            gen_random_uuid(),
            ${params.userId},
            ${params.poolId},
            1,
            ${JSON.stringify(payload)}::jsonb
        );
    `;
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
 * - 単発: 1件（抽選後に履歴1レコード）
 * - 10連: 9件 + 最低レア保証 1件（各抽選後に履歴1レコードずつ）
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

        // userId を一度だけ解決して以後で使い回す（履歴 INSERT 用）
        const payload = (await verifyAccess(token)) as { sub: string };
        const userId = payload.sub;

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

        // レスポンス用配列（抽選ごとに amount を確定し push）
        const items: FrontItem[] = [];

        // 単発 or 10連（9件）をまず処理
        const baseDraws = count === 1 ? 1 : 9;
        for (let i = 0; i < baseDraws; i++) {
            const picked = await pickOne(activePoolId);
            if (!picked) {
                return NextResponse.json(
                    { ok: false, error: 'pick_failed', detail: '抽選に失敗しました。' },
                    { status: 500, headers: NO_STORE }
                );
            }

            // 数量はここで確定（履歴/レスポンス共通で使用）
            const amount = pickAmount(picked.amount_min, picked.amount_max);

            // 履歴 INSERT（単発ごと）
            await insertGachaHistory({
                userId,
                poolId: activePoolId,
                item: {
                    id: picked.id,
                    name: picked.name,
                    rarity: picked.rarity,
                    icon_url: picked.icon_url,
                    amount,
                },
            });

            // レスポンス配列へ（icon_url も含める）
            items.push({
                id: picked.id,
                name: picked.name,
                rarity: picked.rarity,
                amount,
                icon_url: picked.icon_url,
            });
        }

        // 10連の最後の 1 件（最低レア保証）
        if (count === 10) {
            let last: RowItem | null = null;
            if (guaranteeMin && (await guaranteeCandidatesExist(activePoolId, guaranteeMin))) {
                last = await pickOne(activePoolId, guaranteeMin);
            }
            if (!last) last = await pickOne(activePoolId);
            if (!last) {
                return NextResponse.json(
                    { ok: false, error: 'pick_failed', detail: '抽選に失敗しました。(guarantee)' },
                    { status: 500, headers: NO_STORE }
                );
            }

            const amount = pickAmount(last.amount_min, last.amount_max);

            await insertGachaHistory({
                userId,
                poolId: activePoolId,
                item: {
                    id: last.id,
                    name: last.name,
                    rarity: last.rarity,
                    icon_url: last.icon_url,
                    amount,
                },
            });

            items.push({
                id: last.id,
                name: last.name,
                rarity: last.rarity,
                amount,
                icon_url: last.icon_url,
            });
        }

        // チケット消費（最後にまとめて）
        await reduceGachaTickets(count);

        return NextResponse.json(
            { ok: true, result: { items } },
            { status: 200, headers: NO_STORE }
        );
    } catch (err) {
        // 例外ログのみ出力（詳細はサーバーログで確認）
        console.error('handleGetGacha failed:', err);
        return NextResponse.json(
            { ok: false, error: 'server_error', detail: '予期せぬサーバーエラーが発生しました。' } as const,
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

/**
 * GET /api/gacha/history
 * - 認証ユーザーのガチャ履歴から、直近のアイテムを最大 limit 件返す
 * - クエリ: ?limit=15（省略時 15、1〜50 にクランプ）
 * - レスポンス: { ok: true, items: FrontItem[] }
 *   ※ FrontItem は { id, name, rarity, amount?, icon_url? }（フロントの GachaItem 互換）
 */
export async function handleGetGachaHistory(req?: Request) {
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

        // limit を解析（既定 15, 1〜50 に丸める）
        let limit = 15;
        if (req) {
            const url = new URL(req.url);
            const raw = url.searchParams.get('limit');
            const n = raw ? Number.parseInt(raw, 10) : 15;
            if (Number.isFinite(n)) {
                limit = Math.min(50, Math.max(1, n));
            }
        }

        // 直近の履歴を読み出し
        type HistoryItemRow = {
            item_id?: string;
            id?: string; // 互換: 万一 item_id ではなく id で保存されている場合
            name: string;
            rarity: Rarity;
            icon_url: string | null;
            amount: number | null;
        };
        type HistoryRow = { result_items: HistoryItemRow[] };

        const rows = (await sql`
            SELECT result_items
            FROM gacha_history
            WHERE user_id = ${userId}
            ORDER BY created_at DESC
            LIMIT ${limit}
        `) as unknown as HistoryRow[];

        // result_items は配列だが、本実装では1件ずつ入れている想定。
        // 将来の互換性のためにフラット化し、最終的に limit 件でスライス。
        const flattened: FrontItem[] = [];
        for (const r of rows) {
            const arr = Array.isArray(r.result_items) ? r.result_items : [];
            for (const it of arr) {
                const id = (it.item_id ?? it.id);
                if (!id) continue;
                flattened.push({
                    id,
                    name: it.name,
                    rarity: it.rarity,
                    amount: it.amount == null ? undefined : it.amount,
                    icon_url: it.icon_url ?? null,
                });
            }
            if (flattened.length >= limit) break;
        }

        return NextResponse.json(
            { ok: true as const, items: flattened.slice(0, limit) },
            { status: 200, headers: NO_STORE }
        );
    } catch (err) {
        console.error('handleGetGachaHistory failed:', err);
        return NextResponse.json(
            { ok: false, error: 'server_error' as const, detail: '履歴の取得に失敗しました。' },
            { status: 500, headers: NO_STORE }
        );
    }
}