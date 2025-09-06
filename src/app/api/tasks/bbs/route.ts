export const runtime = 'nodejs';

import { handleGetTasksBbs } from '@/lib/api/tasks';
import { handlePostTasksBbs } from '@/lib/api/tasks';

export async function GET() {
    console.log('handleGetTasksBbs');
    return handleGetTasksBbs();
}

export async function POST(req: Request) {
    return handlePostTasksBbs(req);
}