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
    contractor: string | null; // ★ NULL 許容（重要）
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
        SELECT id, owner_id, title, description, due_date, status, created_at, contractor
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
}): Promise<Task> {
    const { userId, title, description, due_date, status, contractor } = params;

    const rows = await sql`
        INSERT INTO tasks (owner_id, title, description, due_date, status, contractor)
        VALUES (
            ${userId},
            ${title},
            ${description},
            ${due_date ? new Date(due_date) : null},
            ${status},
            ${contractor}
        )
        RETURNING id, owner_id, title, description, due_date, status, created_at, contractor
    `;
    return rows[0] as Task;
}

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
    // ★ ここは Task 全体ではなく {id, status} のみを返すクエリなので型も合わせる
    return (rows[0] as { id: string; status: Status }) ?? null;
}

async function dbGetTasksBbs(): Promise<Task[]> {
    const rows = await sql`
        SELECT id, owner_id, title, description, due_date, status, created_at, contractor
        FROM tasks
        WHERE contractor IS NULL
        AND status = 'open'
        ORDER BY created_at DESC
    `;
    return rows as Task[];
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
    // 開発時だけ残したいログなら NODE_ENV を見る
    // if (process.env.NODE_ENV === 'development') console.log('handlePostTasks');
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

        const task = await dbCreateTask({
            userId: String(payload.sub),
            title,
            description,
            due_date,
            status,
            contractor,
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

        // 単発更新・複数更新のどちらかを想定（今は単発のみ利用）
        type SingleBody = { taskId?: string; status?: unknown };
        type MultiBody = { updates?: Array<{ taskId?: string; status?: unknown }> };

        let body: SingleBody & MultiBody = {};
        try {
            body = (await req.json()) as SingleBody & MultiBody;
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

        const updated = await dbUpdateTaskStatus({ userId, taskId, status: st });
        if (!updated) {
            return NextResponse.json(
                { ok: false, error: 'not_found' },
                { status: 404, headers: NO_STORE }
            );
        }

        return NextResponse.json(
            { ok: true, updated },
            { status: 200, headers: NO_STORE }
        );
    } catch (e) {
        // ここは CSRF/認証以外の落ち（DB など）をカバー
        const message =
            typeof e === 'object' && e !== null && 'message' in e
                ? String((e as { message?: unknown }).message)
                : '';
        const isCsrf = message === 'csrf_mismatch';
        const status = isCsrf ? 403 : 500;
        const code: 'csrf_mismatch' | 'update_failed' = isCsrf ? 'csrf_mismatch' : 'update_failed';

        return NextResponse.json(
            { ok: false, error: code },
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
