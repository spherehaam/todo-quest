export const runtime = 'nodejs';

import { handleGetTasks } from '@/lib/api/tasks';
import { handlePostTasks } from '@/lib/api/tasks';

export async function GET() {
    return handleGetTasks();
}

export async function POST(req: Request) {
    return handlePostTasks(req);
}