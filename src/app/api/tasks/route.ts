export const runtime = 'nodejs';

import { handleGetTasks } from '@/lib/api/tasks';
import { handlePostTasks } from '@/lib/api/tasks';

export async function GET(req: Request) {
    return handleGetTasks(req);
}

export async function POST(req: Request) {
    return handlePostTasks(req);
}