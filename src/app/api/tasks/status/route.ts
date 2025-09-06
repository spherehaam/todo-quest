export const runtime = 'nodejs';

import { handlePatchTasksStatus } from '@/lib/api/tasks';

export async function PATCH(req: Request) {
    return handlePatchTasksStatus(req);
}