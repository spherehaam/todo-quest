export const runtime = 'nodejs';

import { handlePatchTasksAccept } from '@/lib/api/tasks';

export async function PATCH(req: Request) {
    return handlePatchTasksAccept(req);
}