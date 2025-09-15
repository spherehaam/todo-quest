export const runtime = 'nodejs';

import { handlePostTasksAccept } from '@/lib/api/tasks';

export async function POST(req: Request) {
    return handlePostTasksAccept(req);
}