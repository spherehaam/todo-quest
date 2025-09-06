export const runtime = 'nodejs';
// 認証依存APIはキャッシュ禁止（ユーザーごとに結果が異なる）
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readAccessTokenFromCookie,
    verifyAccess,
    requireCsrf,
} from '@/lib/auth/common';

// ------------------------------------
// 共通レスポンス（no-storeを徹底）
// ------------------------------------
function json<T extends object>(body: T, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            Pragma: 'no-cache',
        },
    });
}

// ------------------------------------
// 型定義
// ------------------------------------
export type TaskStatus = 'open' | 'in_progress' | 'done';

export type Task = {
    id: string;
    owner_id: string;
    title: string;
    description: string | null;
    /**
     * 期日：DATEカラム想定
     * - タイムゾーンずれ防止のため YYYY-MM-DD のまま入出力
     */
    due_date: string | null;
    status: TaskStatus;
    created_at: string;             // timestamptz→ISO文字列等で返ってくる
    contractor: string | null;      // 未受注 = null
};

const STATUS_VALUES = ['open', 'in_progress', 'done'] as const;
const ALLOWED_STATUS: ReadonlySet<TaskStatus> = new Set<TaskStatus>(STATUS_VALUES);

function isStatus(value: unknown): value is TaskStatus {
    return typeof value === 'string' && (STATUS_VALUES as readonly string[]).includes(value as any);
}

// ------------------------------------
// DB アクセス
// ------------------------------------

/** 受注者ごとのタスク一覧（最新順） */
async function dbGetTasks(contractor: string): Promise<Task[]> {
    const rows = await sql/*sql*/`
        SELECT id, owner_id, title, description, due_date, status, created_at, contractor
        FROM tasks
        WHERE contractor = ${contractor}
        ORDER BY created_at DESC
    `;
    return rows as Task[];
}

/** タスク作成（期日は YYYY-MM-DD をそのまま DATE に） */
async function dbCreateTask(params: {
    userId: string;
    title: string;
    description: string | null;
    due_date: string | null;      // YYYY-MM-DD / null
    status: TaskStatus;
    contractor: string | null;    // '' は null に正規化してから渡す
}): Promise<Task> {
    const { userId, title, description, due_date, status, contractor } = params;

    const rows = await sql/*sql*/`
        INSERT INTO tasks (owner_id, title, description, due_date, status, contractor)
        VALUES (${userId}, ${title}, ${description}, ${due_date}, ${status}, ${contractor})
        RETURNING id, owner_id, title, description, due_date, status, created_at, contractor
    `;
    return rows[0] as Task;
}

/** ステータス更新（オーナーのみ） */
async function dbUpdateTaskStatus(params: {
    userId: string;
    taskId: string;
    status: TaskStatus;
}): Promise<{ id: string; status: TaskStatus } | null> {
    const { userId, taskId, status } = params;
    const rows = await sql/*sql*/`
        UPDATE tasks
        SET status = ${status}
        WHERE id = ${taskId} AND owner_id = ${userId}
        RETURNING id, status
    `;
    // rows[0] は Record<string, any> 想定なので、必要フィールドを整形して返す
    if (!rows || !rows[0]) return null;
    const r = rows[0] as { id?: unknown; status?: unknown };
    if (typeof r.id === 'string' && typeof r.status === 'string' && isStatus(r.status)) {
        return { id: r.id, status: r.status };
    }
    return null;
}

/** 掲示板用：未受注＆募集中のみ（最新順） */
async function dbGetTasksBbs(): Promise<Task[]> {
    const rows = await sql/*sql*/`
        SELECT
            t.id,
            t.owner_id,
            u.username AS owner_name,
            t.title,
            t.description,
            t.due_date,
            t.status,
            t.created_at,
            t.contractor
        FROM tasks t
        LEFT JOIN users u
        ON u.id = t.owner_id
        WHERE t.contractor IS NULL
          AND t.status = 'open'
        ORDER BY t.created_at DESC
    `;
    return rows as Task[];
}

// ------------------------------------
// ハンドラ
// ------------------------------------

export async function handleGetTasks(req: Request) {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) return json({ ok: false, error: 'no_auth' }, 401);

        const payload = await verifyAccess(token);

        const { searchParams } = new URL(req.url);
        const contractorParam = searchParams.get('contractor');

        // 指定がなければログインユーザーIDで取得
        const contractor = (contractorParam ?? String(payload.sub)).trim();
        if (!contractor) return json({ ok: false, error: 'invalid_contractor' }, 400);

        const tasks = await dbGetTasks(contractor);
        return json({ ok: true, tasks });
    } catch (err) {
        console.error('[handleGetTasks] unexpected:', err);
        return json({ ok: false, error: 'failed_to_fetch' }, 500);
    }
}

export async function handlePostTasks(req: Request) {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) return json({ ok: false, error: 'no_auth' }, 401);

        const payload = await verifyAccess(token);
        await requireCsrf();

        type Body = {
            title?: string;
            description?: string;
            /** YYYY-MM-DD を推奨 */
            due_date?: string;
            status?: TaskStatus | string;
            contractor?: string | null;
        };

        let body: Body = {};
        try {
            body = (await req.json()) as Body;
        } catch {
            // 空ボディは許容（後続で title チェック）
        }

        const title = (body?.title ?? '').trim();
        if (!title) return json({ ok: false, error: 'title_required' }, 400);

        const rawDesc = (body?.description ?? '').trim();
        const description = rawDesc ? rawDesc : null;

        // 期日は YYYY-MM-DD のまま扱う（ISO化しない）
        const due_date = (body?.due_date ?? '').trim() || null;
        if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
            return json({ ok: false, error: 'invalid_due_date' }, 400);
        }

        const incomingStatus = (body?.status ?? 'open') as unknown;
        if (!isStatus(incomingStatus)) {
            return json({ ok: false, error: 'invalid_status' }, 400);
        }
        const status: TaskStatus = incomingStatus;

        // '' は null に正規化
        const contractor = (body?.contractor ?? '').trim() || null;

        const task = await dbCreateTask({
            userId: String(payload.sub),
            title,
            description,
            due_date,
            status,
            contractor,
        });

        return json({ ok: true, task }, 201);
    } catch (e) {
        const msg = (e as Error)?.message === 'csrf_mismatch' ? 'csrf_mismatch' : 'create_failed';
        const status = msg === 'csrf_mismatch' ? 403 : 500;
        if (msg !== 'csrf_mismatch') console.error('[handlePostTasks] unexpected:', e);
        return json({ ok: false, error: msg }, status);
    }
}

export async function handlePatchTasksStatus(req: Request) {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) return json({ ok: false, error: 'no_auth' }, 401);

        const payload = await verifyAccess(token);
        await requireCsrf();

        type Body = { taskId?: string; status?: unknown };
        let body: Body = {};
        try {
            body = (await req.json()) as Body;
        } catch {
            // パース不可
            return json({ ok: false, error: 'invalid_payload' }, 400);
        }

        const userId = String(payload.sub);

        const taskId = (body?.taskId ?? '').trim();
        const st = body?.status;
        if (!taskId || !isStatus(st) || !ALLOWED_STATUS.has(st)) {
            return json({ ok: false, error: 'invalid_payload' }, 400);
        }

        const updated = await dbUpdateTaskStatus({ userId, taskId, status: st });
        if (!updated) return json({ ok: false, error: 'not_found' }, 404);

        return json({ ok: true, updated }, 200);
    } catch (e) {
        const msg = (e as Error)?.message === 'csrf_mismatch' ? 'csrf_mismatch' : 'update_failed';
        const status = msg === 'csrf_mismatch' ? 403 : 500;
        if (msg !== 'csrf_mismatch') console.error('[handlePatchTasksStatus] unexpected:', e);
        return json({ ok: false, error: msg }, status);
    }
}

export async function handlePostTasksBbs(req: Request) {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) return json({ ok: false, error: 'no_auth' }, 401);

        const payload = await verifyAccess(token);
        await requireCsrf();

        type Body = {
            title?: string;
            description?: string;
            /** YYYY-MM-DD を推奨 */
            due_date?: string;
            difficulty?: unknown;
            reward?: unknown;
        };

        let body: Body = {};
        try {
            body = (await req.json()) as Body;
        } catch {
            // 空ボディ許容 → title チェックで落とす
        }

        const title = (body?.title ?? '').trim();
        if (!title) return json({ ok: false, error: 'title_required' }, 400);

        const rawDesc = (body?.description ?? '').trim();
        const description = rawDesc ? rawDesc : null;

        // 期日は YYYY-MM-DD のまま保存
        const due_date = (body?.due_date ?? '').trim() || null;
        if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
            return json({ ok: false, error: 'invalid_due_date' }, 400);
        }

        let difficulty = 1;
        if (typeof body?.difficulty === 'number') {
            difficulty = Math.min(5, Math.max(1, Math.floor(body.difficulty)));
        } else if (typeof body?.difficulty === 'string' && body.difficulty !== '') {
            const n = Number(body.difficulty);
            if (!Number.isNaN(n)) difficulty = Math.min(5, Math.max(1, Math.floor(n)));
        }

        let reward = 0;
        if (typeof body?.reward === 'number') {
            reward = Math.max(0, Math.floor(body.reward));
        } else if (typeof body?.reward === 'string' && body.reward !== '') {
            const n = Number(body.reward);
            if (!Number.isNaN(n)) reward = Math.max(0, Math.floor(n));
        }

        const ownerId = String(payload.sub);
        const status: TaskStatus = 'open';
        const contractor: string | null = null;

        const rows = await sql/*sql*/`
            INSERT INTO tasks
                (owner_id, title, description, due_date, status, difficulty, reward, contractor)
            VALUES
                (${ownerId}, ${title}, ${description}, ${due_date},
                 ${status}, ${difficulty}, ${reward}, ${contractor})
            RETURNING id, owner_id, title, description, due_date, status, created_at, contractor
        `;

        const task = rows[0] as Task;
        return json({ ok: true, task }, 201);
    } catch (e) {
        const msg = (e as Error)?.message === 'csrf_mismatch' ? 'csrf_mismatch' : 'create_failed';
        const status = msg === 'csrf_mismatch' ? 403 : 500;
        if (msg !== 'csrf_mismatch') console.error('[handlePostTasksBbs] unexpected:', e);
        return json({ ok: false, error: msg }, status);
    }
}

export async function handleGetTasksBbs() {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) return json({ ok: false, error: 'no_auth' }, 401);

        await verifyAccess(token); // payload は現状未使用だが認証のため残す

        const tasks = await dbGetTasksBbs();
        return json({ ok: true, tasks });
    } catch (e) {
        console.error('[handleGetTasksBbs] unexpected:', e);
        return json({ ok: false, error: 'failed_to_fetch' }, 500);
    }
}