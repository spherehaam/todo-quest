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
    description: string | null;
    due_date: string | null; // ISO文字列
    status: 'open' | 'in_progress' | 'done';
    created_at: string; // ISO文字列
};

/** 許可ステータス */
const ALLOWED_STATUS = new Set(['open', 'in_progress', 'done'] as const);

/**
 * ユーザーのタスク一覧をDBから取得する
 */
async function dbGetTasks(userId: string): Promise<Task[]> {
    const rows = await sql`
        SELECT id, owner_id, title, description, due_date, status, created_at
        FROM tasks
        WHERE owner_id = ${userId}
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
    status: 'open' | 'in_progress' | 'done';
}): Promise<Task> {
    const { userId, title, description, due_date, status } = params;

    // due_date は timestamptz にキャスト（nullはそのまま）
    const rows = await sql`
        INSERT INTO tasks (owner_id, title, description, due_date, status)
        VALUES (${userId}, ${title}, ${description}, ${due_date ? new Date(due_date) : null}, ${status})
        RETURNING id, owner_id, title, description, due_date, status, created_at
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
 * body:
 *  - title: string (必須)
 *  - description: string（任意・どちらのキーでもOK）
 *  - due_date: ISO文字列（任意）
 *  - status: 'open' | 'in_progress' | 'done'（任意：未指定は 'open'）
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

        await requireCsrf();

        type Body = {
            title?: string;
            description?: string;
            due_date?: string;
            status?: 'open' | 'in_progress' | 'done' | string;
        };

        let body: Body = {};
        try {
            body = (await req.json()) as Body;
        } catch {
            body = {};
        }

        // title必須
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

        // status（未指定は open）。不正値は 400。
        const incomingStatus = (body?.status ?? 'open') as string;
        const status =
            ALLOWED_STATUS.has(incomingStatus as any)
                ? (incomingStatus as Task['status'])
                : null;

        if (!status) {
            return NextResponse.json(
                { ok: false, error: 'invalid_status' },
                { status: 400 }
            );
        }

        const task = await dbCreateTask({
            userId: String(payload.sub),
            title,
            description,
            due_date,
            status,
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
