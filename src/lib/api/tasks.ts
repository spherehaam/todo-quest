export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readAccessTokenFromCookie,
    verifyAccess,
    requireCsrf,
} from '@/lib/auth/common';

export type Task = {
    id: string;
    user_id: string;
    title: string;
    done: boolean;
    created_at: string;
};

// 内部ユーティリティ（必要なら他ファイルへ分割可）
async function dbGetTasks(userId: string): Promise<Task[]> {
    const rows = await sql`
        SELECT id, user_id, title, done, created_at
        FROM tasks
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
    `;
    // rows は any[] と推論されるので、Task[] と明示して返す
    return rows as Task[];
}

async function dbCreateTask(userId: string, title: string): Promise<Task> {
    const rows = await sql`
        INSERT INTO tasks (user_id, title)
        VALUES (${userId}, ${title})
        RETURNING id, user_id, title, done, created_at
    `;
    return rows[0] as Task;
}

/**
 * GET /api/tasks
 * 自分のタスク一覧を返す（認可のみ）
 */
export async function GET() {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json({ ok: false, error: 'no_auth' }, { status: 401 });
        }
        const payload = await verifyAccess(token);

        const tasks = await dbGetTasks(String(payload.sub));
        return NextResponse.json({ ok: true, tasks });
    } catch {
        return NextResponse.json({ ok: false, error: 'failed_to_fetch' }, { status: 500 });
    }
}

/**
 * POST /api/tasks
 * タスクを1件追加（認可 + CSRF）
 * body: { title: string }
 */
export async function POST(req: Request) {
    try {
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json({ ok: false, error: 'no_auth' }, { status: 401 });
        }
        const payload = await verifyAccess(token);

        // 変更系なので CSRF 必須
        await requireCsrf();

        const body = await req.json().catch(() => ({} as any));
        const title = (body?.title ?? '').trim();
        if (!title) {
            return NextResponse.json({ ok: false, error: 'title_required' }, { status: 400 });
        }

        const task = await dbCreateTask(String(payload.sub), title);
        return NextResponse.json({ ok: true, task }, { status: 201 });
    } catch (e) {
        const msg = (e as Error).message === 'csrf_mismatch' ? 'csrf_mismatch' : 'create_failed';
        const status = msg === 'csrf_mismatch' ? 403 : 500;
        return NextResponse.json({ ok: false, error: msg }, { status });
    }
}
