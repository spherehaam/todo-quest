export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readAccessTokenFromCookie,
    verifyAccess,
    requireCsrf,
} from '@/lib/auth/common';

/**
 * DBの tasks テーブルに対応する型
 * - BBS（未受注）では contractor が NULL になるので union にする
 */
export type Task = {
    id: string;
    owner_id: string;
    title: string;
    description: string | null;
    due_date: string | null;  // JSON 化時に Date → ISO 文字列になるため string でOK
    status: 'open' | 'in_progress' | 'done';
    created_at: string;
    contractor: string | null; // NULL 許容
};

type Status = Task['status'];

/** 許容するステータスの列挙（型のソースオブトゥルース） */
const STATUS_VALUES = ['open', 'in_progress', 'done'] as const;

/**
 * ランタイム検証用の集合
 * - Set の型パラメータに Status を明示することで .has() での型補助が効く
 */
const ALLOWED_STATUS: ReadonlySet<Status> = new Set<Status>(STATUS_VALUES);

/** 受け取った値が Status かを判定する型ガード（API入力バリデーション用） */
function isStatus(value: unknown): value is Status {
    return typeof value === 'string' && (STATUS_VALUES as readonly string[]).includes(value);
}

/** 認証系レスポンスはキャッシュさせない */
const NO_STORE = { 'Cache-Control': 'no-store' as const };

/* =========================
 * DB アクセスラッパ
 * ========================= */

async function dbGetTasks(contractor: string): Promise<Task[]> {
    const rows = await sql`
        SELECT id, owner_id, title, description, due_date, status, created_at, contractor, reward
        FROM tasks
        WHERE contractor = ${contractor}
        ORDER BY created_at DESC
    `;
    // NextResponse.json が Date を ISO にシリアライズしてくれるので as Task[] で十分
    return rows as Task[];
}

async function dbCreateTask(params: {
    userId: string;
    title: string;
    description: string | null;
    due_date: string | null; // 文字列 ISO or null を受けて DB 側は timestamp に
    status: Status;
    contractor: string;
    reward?: number;
}): Promise<Task> {
    const { userId, title, description, due_date, status, contractor, reward } = params;

    const rows = await sql`
        INSERT INTO tasks (owner_id, title, description, due_date, status, contractor, reward)
        VALUES (
            ${userId},
            ${title},
            ${description},
            ${due_date ? new Date(due_date) : null},
            ${status},
            ${contractor},
            ${reward}
        )
        RETURNING id, owner_id, title, description, due_date, status, created_at, contractor, reward
    `;
    return rows[0] as Task;
}

async function dbGetTasksBbs(): Promise<Task[]> {
    const rows = await sql`
        SELECT 
            t.id,
            t.owner_id,
            u.username AS owner_username,
            t.title,
            t.description,
            t.due_date,
            t.status,
            t.created_at,
            t.contractor,
            t.difficulty,
            t.reward
        FROM tasks t
        INNER JOIN users u
            ON t.owner_id = u.id
        WHERE t.contractor IS NULL
          AND t.status = 'open'
        ORDER BY t.created_at DESC
    `;
    return rows as Task[];
}

/**
 * タスク受注：status を 'open' → 'in_progress'、contractor を設定
 * - 競合対策：open かつ contractor IS NULL の行のみ更新
 * - 0行更新なら null を返す
 */
async function dbUpdateTaskAccept(taskId: string, contractorId: string): Promise<Task | null> {
    const rows = await sql`
        UPDATE tasks
        SET 
            status = 'in_progress',
            contractor = ${contractorId},
            updated_at = now()
        WHERE id = ${taskId}
          AND status = 'open'
          AND contractor IS NULL
        RETURNING id, owner_id, title, description, due_date, status, created_at, contractor
    `;
    return (rows[0] as Task) ?? null;
}

/**
 * ステータス更新 + 報酬付与 + レベルアップ反映（原子的に実施）
 * - 同じ値への再更新を弾く（status IS DISTINCT FROM）
 * - 'done' への変更時のみ報酬付与
 * - 複数段のレベルアップに再帰CTEで対応
 */
async function dbUpdateTaskStatusAndApplyReward(params: {
    userId: string;
    taskId: string;
    newStatus: Status;
}): Promise<{
    updated: { id: string; status: Status } | null;
    rewardApplied: { added: number; newLevel: number; newExp: number } | null;
}> {
    const { userId, taskId, newStatus } = params;

    const rows = await sql`
        WITH RECURSIVE
        updated AS (
            UPDATE tasks
            SET status = ${newStatus}, updated_at = now()
            WHERE id = ${taskId}
              AND contractor = ${userId}
              AND status IS DISTINCT FROM ${newStatus}
            RETURNING id, status, reward
        ),
        base_user AS (
            SELECT id, level, exp
            FROM users
            WHERE id = ${userId}
        ),
        calc AS (
            SELECT
                b.id,
                b.level,
                b.exp
                    + CASE WHEN (SELECT status = 'done' FROM updated LIMIT 1)
                           THEN COALESCE((SELECT reward FROM updated LIMIT 1), 0)
                           ELSE 0
                      END AS exp_after,
                CASE WHEN (SELECT status = 'done' FROM updated LIMIT 1)
                     THEN COALESCE((SELECT reward FROM updated LIMIT 1), 0)
                     ELSE 0
                END AS added
            FROM base_user b
        ),
        lvl AS (
            -- anchor
            SELECT
                c.id,
                c.level AS cur_level,
                c.exp_after AS cur_exp,
                (SELECT required_total_exp FROM levels WHERE level = c.level LIMIT 1) AS req
            FROM calc c
            UNION ALL
            -- step
            SELECT
                l.id,
                l.cur_level + 1,
                l.cur_exp - COALESCE(l.req, 2147483647),
                (SELECT required_total_exp FROM levels WHERE level = l.cur_level + 1 LIMIT 1) AS req
            FROM lvl l
            WHERE COALESCE(l.req, 2147483647) > 0
              AND l.cur_exp >= COALESCE(l.req, 2147483647)
        ),
        final AS (
            SELECT
                c.id,
                COALESCE(
                    (SELECT cur_level FROM lvl ORDER BY cur_level DESC LIMIT 1),
                    c.level
                ) AS new_level,
                COALESCE(
                    (SELECT cur_exp FROM lvl ORDER BY cur_level DESC LIMIT 1),
                    c.exp_after
                ) AS new_exp,
                c.added
            FROM calc c
        ),
        applied AS (
            UPDATE users u
            SET level = f.new_level,
                exp = f.new_exp,
                updated_at = now()
            FROM final f
            WHERE u.id = f.id
              AND (SELECT status = 'done' FROM updated LIMIT 1)
            RETURNING u.id, u.level, u.exp, f.added
        )
        SELECT
            (SELECT id FROM updated LIMIT 1) AS task_id,
            (SELECT status FROM updated LIMIT 1) AS new_status,
            (SELECT added FROM final LIMIT 1) AS reward_added,
            (SELECT level FROM applied LIMIT 1) AS new_level,
            (SELECT exp FROM applied LIMIT 1) AS new_exp
    `;

    const row = rows?.[0] as
        | {
              task_id: string | null;
              new_status: Status | null;
              reward_added: number | null;
              new_level: number | null;
              new_exp: number | null;
          }
        | undefined;

    if (!row || !row.task_id) {
        return { updated: null, rewardApplied: null };
    }

    const updated = { id: row.task_id, status: row.new_status as Status };
    const rewardApplied =
        row.reward_added && row.new_level !== null && row.new_exp !== null
            ? {
                  added: Number(row.reward_added),
                  newLevel: Number(row.new_level),
                  newExp: Number(row.new_exp),
              }
            : null;

    return { updated, rewardApplied };
}


/* =========================
 * Route ハンドラ（関数化）
 * ========================= */

export async function handleGetTasks(req: Request) {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' },
                { status: 401, headers: NO_STORE }
            );
        }
        const payload = await verifyAccess(token);

        const { searchParams } = new URL(req.url);
        const contractorParam = searchParams.get('contractor');

        // クエリが無ければ自分のタスク
        const contractor = contractorParam ?? String(payload.sub);

        const tasks = await dbGetTasks(contractor);
        return NextResponse.json(
            { ok: true, tasks },
            { status: 200, headers: NO_STORE }
        );
    } catch {
        return NextResponse.json(
            { ok: false, error: 'failed_to_fetch' },
            { status: 500, headers: NO_STORE }
        );
    }
}

export async function handlePostTasks(req: Request) {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' },
                { status: 401, headers: NO_STORE }
            );
        }
        const payload = await verifyAccess(token);

        // 書き込み系は必ず CSRF チェック
        await requireCsrf();

        type Body = {
            title?: string;
            description?: string;
            due_date?: string; // ISO or YYYY-MM-DD 想定
            status?: Status | string; // 型ガードで Status に絞る
            contractor?: string;
            reward?: number;
        };

        let body: Body = {};
        try {
            body = (await req.json()) as Body;
        } catch {
            // JSON でない入力（空など）は空オブジェクト扱い
            body = {};
        }

        const title = (body?.title ?? '').trim();
        if (!title) {
            return NextResponse.json(
                { ok: false, error: 'title_required' },
                { status: 400, headers: NO_STORE }
            );
        }

        const rawDesc = (body?.description ?? '').trim();
        const description = rawDesc.length > 0 ? rawDesc : null;

        let due_date: string | null = null;
        if (body?.due_date) {
            const d = new Date(body.due_date);
            if (!isNaN(d.getTime())) {
                // API 内部では ISO 文字列で持ち回し、DB 挿入時に Date に変換
                due_date = d.toISOString();
            }
        }

        const incomingStatus = body?.status ?? 'open';
        if (!isStatus(incomingStatus) || !ALLOWED_STATUS.has(incomingStatus)) {
            return NextResponse.json(
                { ok: false, error: 'invalid_status' },
                { status: 400, headers: NO_STORE }
            );
        }
        const status: Status = incomingStatus;

        const contractor = (body?.contractor ?? '').trim();

        const reward = body?.reward;

        const task = await dbCreateTask({
            userId: String(payload.sub),
            title,
            description,
            due_date,
            status,
            contractor,
            reward
        });

        return NextResponse.json(
            { ok: true, task },
            { status: 201, headers: NO_STORE }
        );
    } catch (e) {
        const message =
            typeof e === 'object' && e !== null && 'message' in e
                ? String((e as { message?: unknown }).message)
                : '';
        const isCsrf = message === 'csrf_mismatch';
        const code: 'csrf_mismatch' | 'create_failed' = isCsrf ? 'csrf_mismatch' : 'create_failed';
        const status = isCsrf ? 403 : 500;

        return NextResponse.json(
            { ok: false, error: code },
            { status, headers: NO_STORE }
        );
    }
}

/**
 * ステータス更新（外だし関数を利用）
 * - 同じ値への再更新は行わない（status IS DISTINCT FROM）
 * - 'done' への変更時のみ報酬付与＆レベル更新
 */
export async function handlePatchTasksStatus(req: Request) {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' },
                { status: 401, headers: NO_STORE }
            );
        }
        const payload = await verifyAccess(token);

        await requireCsrf();

        // 単発更新
        type SingleBody = { taskId?: string; status?: unknown };

        let body: SingleBody = {};
        try {
            body = (await req.json()) as SingleBody;
        } catch {
            // 何も送られてこないケースは下のバリデーションで弾く
        }

        const userId = String(payload.sub);

        const taskId = (body?.taskId ?? '').trim();
        const st = body?.status;

        // 期待する型・値の検証
        if (!taskId || !isStatus(st) || !ALLOWED_STATUS.has(st)) {
            return NextResponse.json(
                { ok: false, error: 'invalid_payload' },
                { status: 400, headers: NO_STORE }
            );
        }

        const { updated, rewardApplied } = await dbUpdateTaskStatusAndApplyReward({
            userId,
            taskId,
            newStatus: st,
        });

        if (!updated) {
            // 404: 該当なし / 受注者不一致 / 同じステータスで変更なし
            return NextResponse.json(
                { ok: false, error: 'not_found_or_noop' },
                { status: 404, headers: NO_STORE }
            );
        }

        return NextResponse.json(
            { ok: true, updated, rewardApplied: rewardApplied ?? null },
            { status: 200, headers: NO_STORE }
        );
    } catch (e: unknown) {
        // unknown から安全に message / code を抽出
        const extractError = (err: unknown): { message: string; code?: string } => {
            if (typeof err === 'string') return { message: err };
            if (err && typeof err === 'object') {
                const r = err as Record<string, unknown>;
                const message = typeof r.message === 'string' ? r.message : '';
                const code = typeof r.code === 'string' ? r.code : undefined;
                return { message, code };
            }
            return { message: '' };
        };

        const { message, code } = extractError(e);
        const isCsrf = code === 'csrf_mismatch' || message === 'csrf_mismatch';
        const status = isCsrf ? 403 : 500;
        return NextResponse.json(
            { ok: false, error: isCsrf ? 'csrf_mismatch' : 'update_failed', detail: message },
            { status, headers: NO_STORE }
        );
    }
}

export async function handlePostTasksBbs(req: Request) {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' },
                { status: 401, headers: NO_STORE }
            );
        }
        const payload = await verifyAccess(token);

        await requireCsrf();

        type Body = {
            title?: string;
            description?: string;
            due_date?: string;
            difficulty?: unknown;
            reward?: unknown;
        };

        let body: Body = {};
        try {
            body = (await req.json()) as Body;
        } catch {
            body = {};
        }

        const title = (body?.title ?? '').trim();
        if (!title) {
            return NextResponse.json(
                { ok: false, error: 'title_required' },
                { status: 400, headers: NO_STORE }
            );
        }

        const rawDesc = (body?.description ?? '').trim();
        const description = rawDesc.length > 0 ? rawDesc : null;

        let due_date: string | null = null;
        if (body?.due_date) {
            const d = new Date(body.due_date);
            if (!isNaN(d.getTime())) {
                due_date = d.toISOString();
            }
        }

        // 難易度（1..5）
        let difficulty = 1;
        if (typeof body?.difficulty === 'number') {
            difficulty = Math.min(5, Math.max(1, Math.floor(body.difficulty)));
        } else if (typeof body?.difficulty === 'string' && body.difficulty !== '') {
            const n = Number(body.difficulty);
            if (!Number.isNaN(n)) difficulty = Math.min(5, Math.max(1, Math.floor(n)));
        }

        // 報酬（0 以上の整数）
        let reward = 0;
        if (typeof body?.reward === 'number') {
            reward = Math.max(0, Math.floor(body.reward));
        } else if (typeof body?.reward === 'string' && body.reward !== '') {
            const n = Number(body.reward);
            if (!Number.isNaN(n)) reward = Math.max(0, Math.floor(n));
        }

        const ownerId = String(payload.sub);
        const status: Status = 'open';
        const contractor: string | null = null;

        const rows = await sql`
            INSERT INTO tasks
                (owner_id, title, description, due_date, status, difficulty, reward, contractor)
            VALUES
                (${ownerId}, ${title}, ${description},
                 ${due_date ? new Date(due_date) : null}, ${status},
                 ${difficulty}, ${reward}, ${contractor})
            RETURNING id, owner_id, title, description, due_date, status, created_at, contractor
        `;

        const task = rows[0] as Task;
        return NextResponse.json(
            { ok: true, task },
            { status: 201, headers: NO_STORE }
        );
    } catch (e) {
        const message =
            typeof e === 'object' && e !== null && 'message' in e
                ? String((e as { message?: unknown }).message)
                : '';
        const isCsrf = message === 'csrf_mismatch';
        const code: 'csrf_mismatch' | 'create_failed' = isCsrf ? 'csrf_mismatch' : 'create_failed';
        const status = isCsrf ? 403 : 500;

        return NextResponse.json(
            { ok: false, error: code },
            { status, headers: NO_STORE }
        );
    }
}

export async function handleGetTasksBbs() {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' },
                { status: 401, headers: NO_STORE }
            );
        }
        await verifyAccess(token);

        const tasks = await dbGetTasksBbs();
        return NextResponse.json(
            { ok: true, tasks },
            { status: 200, headers: NO_STORE }
        );
    } catch {
        return NextResponse.json(
            { ok: false, error: 'failed_to_fetch' },
            { status: 500, headers: NO_STORE }
        );
    }
}

/**
 * タスク受注（POST /api/tasks/accept）
 * - Body: { taskId: string }
 * - 受注者は認証ユーザー
 * - CSRF 検証あり（await requireCsrf(); は現状維持）
 * - 競合時は 409
 */
export async function handlePatchTasksAccept(req: Request) {
    try {

        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' },
                { status: 401, headers: NO_STORE }
            );
        }
        const payload = await verifyAccess(token);

        // CSRFチェック（X-CSRF-Tokenヘッダを想定）
        await requireCsrf();

        // Body から taskId を受け取る
        type Body = { taskId?: unknown };
        let body: Body = {};
        try {
            body = (await req.json()) as Body;
        } catch {
            // JSONでない/空は弾く
        }

        const taskId = typeof body?.taskId === 'string' ? body.taskId.trim() : '';
        if (!taskId) {
            return NextResponse.json(
                { ok: false, error: 'missing_id' },
                { status: 400, headers: NO_STORE }
            );
        }

        const contractorId = String(payload.sub);

        const updated = await dbUpdateTaskAccept(taskId, contractorId);
        if (!updated) {
            // 既に他のユーザーが受注 / openでない / レコードなし 等
            return NextResponse.json(
                { ok: false, error: 'conflict_or_not_open' },
                { status: 409, headers: NO_STORE }
            );
        }

        return NextResponse.json(
            { ok: true, task: updated },
            { status: 200, headers: NO_STORE }
        );
    } catch (e) {
        const message =
            typeof e === 'object' && e !== null && 'message' in e
                ? String((e as { message?: unknown }).message)
                : '';
        const isCsrf = message === 'csrf_mismatch';
        const status = isCsrf ? 403 : 500;
        const code: 'csrf_mismatch' | 'failed_to_accept' = isCsrf ? 'csrf_mismatch' : 'failed_to_accept';

        return NextResponse.json(
            { ok: false, error: code },
            { status, headers: NO_STORE }
        );
    }
}
