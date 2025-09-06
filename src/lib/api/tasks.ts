export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readAccessTokenFromCookie,
    verifyAccess,
    requireCsrf,
} from '@/lib/auth/common';

// ---------------------------------------------------------
// 型定義
// ---------------------------------------------------------
export type Task = {
    id: string;
    owner_id: string;
    title: string;
    description: string | null;
    due_date: string | null; // ISO文字列
    status: 'open' | 'in_progress' | 'done';
    created_at: string; // ISO文字列
    contractor: string;
};

type Status = Task['status'];

// 許可ステータス（読み取り専用の Set と配列）
const STATUS_VALUES = ['open', 'in_progress', 'done'] as const;
const ALLOWED_STATUS: ReadonlySet<Status> = new Set<Status>(STATUS_VALUES);

/** status の型ガード */
function isStatus(value: unknown): value is Status {
    return typeof value === 'string' && (STATUS_VALUES as readonly string[]).includes(value);
}

// ---------------------------------------------------------
// DB アクセス
// ---------------------------------------------------------
async function dbGetTasks(contractor: string): Promise<Task[]> {
    const rows = await sql`
        SELECT id, owner_id, title, description, due_date, status, created_at, contractor
        FROM tasks
        WHERE contractor = ${contractor}
        ORDER BY created_at DESC
    `;
    return rows as Task[];
}

/**
 * 新しいタスクをDBに挿入して返す
 */
async function dbCreateTask(params: {
    userId: string;
    title: string;
    description: string | null;
    due_date: string | null; // ISO or null
    status: Status;
    contractor: string;
}): Promise<Task> {
    const { userId, title, description, due_date, status, contractor } = params;

    const rows = await sql`
        INSERT INTO tasks (owner_id, title, description, due_date, status, contractor)
        VALUES (${userId}, ${title}, ${description}, ${due_date ? new Date(due_date) : null}, ${status}, ${contractor})
        RETURNING id, owner_id, title, description, due_date, status, created_at, contractor
    `;
    return rows[0] as Task;
}

/** 単一タスクのステータスを更新して返す（本人のタスクのみ） */
async function dbUpdateTaskStatus(params: {
    userId: string;
    taskId: string;
    status: Status;
}): Promise<{ id: string; status: Status } | null> {
    const { userId, taskId, status } = params;
    const rows = await sql`
        UPDATE tasks
        SET status = ${status}
        WHERE id = ${taskId} AND owner_id = ${userId}
        RETURNING id, status
    `;
    return rows[0] as Task;
}

async function dbGetTasksBbs(): Promise<Task[]> {
    const rows = await sql`
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

// ---------------------------------------------------------
// ハンドラ
// ---------------------------------------------------------

/**
 * GET /api/tasks
 * 認証済みユーザーのタスク一覧を返す
 */
export async function handleGetTasks(req: Request) {
    try {
        // 認証チェック
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json({ ok: false, error: 'no_auth' }, { status: 401 });
        }
        const payload = await verifyAccess(token);

        // クエリパラメータから contractor を取得
        const { searchParams } = new URL(req.url);
        const contractorParam = searchParams.get('contractor');

        // contractor が指定されていればそれを、なければ自分のIDを使う
        const contractor = contractorParam ?? String(payload.sub);

        // DBから取得
        const tasks = await dbGetTasks(contractor);
        return NextResponse.json({ ok: true, tasks });
    } catch {
        return NextResponse.json({ ok: false, error: 'failed_to_fetch' }, { status: 500 });
    }
}

/**
 * POST /api/tasks
 * 認証 + CSRF 検証を通過した場合にタスクを1件作成する
 * body:
 *  - title: string (必須)
 *  - description: string（任意・どちらのキーでもOK）
 *  - due_date: ISO文字列（任意）
 *  - status: 'open' | 'in_progress' | 'done'（任意：未指定は 'open'）
 */
export async function handlePostTasks(req: Request) {
    console.log('handlePostTasks');
    try {
        // アクセストークン検証
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' },
                { status: 401 }
            );
        }
        const payload = await verifyAccess(token);

        await requireCsrf();

        type Body = {
            title?: string;
            description?: string;
            due_date?: string;
            status?: Status | string; // 外部入力なので string も受ける
            contractor?: string;
        };

        let body: Body = {};
        try {
            body = (await req.json()) as Body;
        } catch {
            body = {};
        }

        // title 必須
        const title = (body?.title ?? '').trim();
        if (!title) {
            return NextResponse.json(
                { ok: false, error: 'title_required' },
                { status: 400 }
            );
        }

        // description
        const rawDesc = (body?.description ?? '').trim();
        const description = rawDesc.length > 0 ? rawDesc : null;

        // due_date は ISO 文字列想定。パースできない場合は null に落とす
        let due_date: string | null = null;
        if (body?.due_date) {
            const d = new Date(body.due_date);
            if (!isNaN(d.getTime())) {
                due_date = d.toISOString();
            }
        }

        // status（未指定は open）。isStatus で厳密チェック
        const incomingStatus = body?.status ?? 'open';
        if (!isStatus(incomingStatus)) {
            return NextResponse.json(
                { ok: false, error: 'invalid_status' },
                { status: 400 }
            );
        }
        const status: Status = incomingStatus;

        const contractor = (body?.contractor ?? '').trim();

        const task = await dbCreateTask({
            userId: String(payload.sub),
            title,
            description,
            due_date,
            status,
            contractor,
        });

        return NextResponse.json({ ok: true, task }, { status: 201 });
    } catch (e) {
        const msg =
            (e as Error).message === 'csrf_mismatch'
                ? 'csrf_mismatch'
                : 'create_failed';
        const status = msg === 'csrf_mismatch' ? 403 : 500;
        return NextResponse.json({ ok: false, error: msg }, { status });
    }
}

/**
 * PATCH /api/tasks/status
 * 単一 or 複数タスクの「ステータス」を更新（最小実装）。
 *
 * 受け付けるボディの形：
 *  1) 単一更新:
 *     { "id": "<taskId>", "status": "open" | "in_progress" | "done" }
 *
 * レスポンス:
 *  - 単一: { ok: true, updated: { id, status } }
 *  - 複数: { ok: true, updated: [{ id, status }, ...] }
 */
export async function handlePatchTasksStatus(req: Request) {
    try {
        // 認証
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json({ ok: false, error: 'no_auth' }, { status: 401 });
        }
        const payload = await verifyAccess(token);

        // CSRF
        await requireCsrf();

        type SingleBody = { taskId?: string; status?: unknown };
        type MultiBody = { updates?: Array<{ taskId?: string; status?: unknown }> };
        let body: SingleBody & MultiBody = {};
        try {
            body = (await req.json()) as SingleBody & MultiBody;
        } catch {
        }

        const userId = String(payload.sub);

        // 単一更新パス
        const taskId = (body?.taskId ?? '').trim();
        const st = body?.status;
        if (!taskId || !isStatus(st) || !ALLOWED_STATUS.has(st)) {
            return NextResponse.json(
                { ok: false, error: 'invalid_payload' },
                { status: 400 }
            );
        }

        const updated = await dbUpdateTaskStatus({ userId, taskId, status: st });
        if (!updated) {
            return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
        }

        return NextResponse.json({ ok: true, updated }, { status: 200 });
    } catch {
    }
}

/**
 * POST /api/tasks (BBS用)
 * - 依頼を新規作成（未受注・open固定）
 * body:
 *  - title: string (必須)
 *  - description: string（任意）
 *  - due_date: ISO文字列 or YYYY-MM-DD（任意）
 *  - difficulty: 1..5（任意。未指定時は 1）
 *  - reward: 0 以上の整数（任意。未指定時は 0）
 */
export async function handlePostTasksBbs(req: Request) {
    console.log('handlePostTasksBbs');
    try {
        // 認証
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json({ ok: false, error: 'no_auth' }, { status: 401 });
        }
        const payload = await verifyAccess(token);

        // CSRF
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

        // title 必須
        const title = (body?.title ?? '').trim();
        if (!title) {
            return NextResponse.json({ ok: false, error: 'title_required' }, { status: 400 });
        }

        // description
        const rawDesc = (body?.description ?? '').trim();
        const description = rawDesc.length > 0 ? rawDesc : null;

        // due_date（不正は null）
        let due_date: string | null = null;
        if (body?.due_date) {
            const d = new Date(body.due_date);
            if (!isNaN(d.getTime())) {
                // DBが date 型なので、時間は不要。ISOでも date への暗黙変換が効く環境が多いが、
                // 明確に日付だけを入れたい場合は YYYY-MM-DD に整形してもOK。
                due_date = d.toISOString();
            }
        }

        // difficulty: 1..5（未指定は 1）
        let difficulty = 1;
        if (typeof body?.difficulty === 'number') {
            difficulty = Math.min(5, Math.max(1, Math.floor(body.difficulty)));
        } else if (typeof body?.difficulty === 'string' && body.difficulty !== '') {
            const n = Number(body.difficulty);
            if (!Number.isNaN(n)) difficulty = Math.min(5, Math.max(1, Math.floor(n)));
        }

        // reward: 0 以上の整数（未指定は 0）
        let reward = 0;
        if (typeof body?.reward === 'number') {
            reward = Math.max(0, Math.floor(body.reward));
        } else if (typeof body?.reward === 'string' && body.reward !== '') {
            const n = Number(body.reward);
            if (!Number.isNaN(n)) reward = Math.max(0, Math.floor(n));
        }

        // 掲示板の新規依頼は未受注 & open 固定
        const ownerId = String(payload.sub);
        const status: Status = 'open';
        const contractor: string | null = null;

        // ここでは BBS 用に難易度・報酬も保存する INSERT を直書き
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
        return NextResponse.json({ ok: true, task }, { status: 201 });
    } catch (e) {
        const msg =
            (e as Error).message === 'csrf_mismatch'
                ? 'csrf_mismatch'
                : 'create_failed';
        const status = msg === 'csrf_mismatch' ? 403 : 500;
        return NextResponse.json({ ok: false, error: msg }, { status });
    }
}

export async function handleGetTasksBbs() {
    console.log('handleGetTasksBbs1');
    try {
        // 認証チェック
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json({ ok: false, error: 'no_auth' }, { status: 401 });
        }
        const payload = await verifyAccess(token);

        const tasks = await dbGetTasksBbs();
        return NextResponse.json({ ok: true, tasks });
    } catch {
        return NextResponse.json({ ok: false, error: 'failed_to_fetch' }, { status: 500 });
    }
}