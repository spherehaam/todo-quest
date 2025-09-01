export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    readAccessTokenFromCookie,
    verifyAccess,
    requireCsrf,
} from '@/lib/auth/common';

// DB上の tasks テーブルに対応する型定義
export type Task = {
    id: string;
    owner_id: string;
    title: string;
    done: boolean;
    created_at: string;
};

/**
 * ユーザーのタスク一覧をDBから取得する
 */
async function dbGetTasks(userId: string): Promise<Task[]> {
    const rows = await sql`
        SELECT id, owner_id, title, description, due_date, created_at
        FROM tasks
        WHERE owner_id = ${userId}
        ORDER BY created_at DESC
    `;
    return rows as Task[];
}

/**
 * 新しいタスクをDBに挿入して返す
 */
async function dbCreateTask(userId: string, title: string, description: string, due_date: string): Promise<Task> {
    const rows = await sql`
        INSERT INTO tasks (owner_id, title, description, due_date)
        VALUES (${userId}, ${title}, ${description}, ${due_date})
        RETURNING id, owner_id, title, done, created_at
    `;
    return rows[0] as Task;
}

/**
 * GET /api/tasks
 * 認証済みユーザーのタスク一覧を返す
 */
export async function handleGetTasks() {
    try {
        // アクセストークンをCookieから取得
        const token = await readAccessTokenFromCookie();
        if (!token) {
            return NextResponse.json(
                { ok: false, error: 'no_auth' },
                { status: 401 }
            );
        }
        const payload = await verifyAccess(token);

        // DBからタスク一覧を取得
        const tasks = await dbGetTasks(String(payload.sub));
        return NextResponse.json({ ok: true, tasks });
    } catch {
        return NextResponse.json(
            { ok: false, error: 'failed_to_fetch' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/tasks
 * 認証 + CSRF 検証を通過した場合にタスクを1件作成する
 * body: { title: string }
 */
export async function handlePostTasks(req: Request) {
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

        // CSRF 検証
        await requireCsrf();

        // リクエストBodyをパース
        type Body = { title?: string, description?: string, due_date?: string };
        let body: Body = {};
        try {
            body = (await req.json()) as Body;
        } catch {
            body = {};
        }

        // title必須チェック
        const title = (body?.title ?? '').trim();
        if (!title) {
            return NextResponse.json(
                { ok: false, error: 'title_required' },
                { status: 400 }
            );
        }
        const description = (body?.description ?? '').trim();
        const due_date = (body?.due_date ?? '').trim();

        // DBに新規タスク作成
        const task = await dbCreateTask(String(payload.sub), title, description, due_date);
        return NextResponse.json({ ok: true, task }, { status: 201 });
    } catch (e) {
        // CSRF mismatch とそれ以外でステータスを分ける
        const msg =
            (e as Error).message === 'csrf_mismatch'
                ? 'csrf_mismatch'
                : 'create_failed';
        const status = msg === 'csrf_mismatch' ? 403 : 500;
        return NextResponse.json({ ok: false, error: msg }, { status });
    }
}
