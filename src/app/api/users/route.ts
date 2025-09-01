export const runtime = 'nodejs';

import { handleGetUsers } from '@/lib/api/users';
import { handlePostUsers } from '@/lib/api/users';

export async function GET() {
    return handleGetUsers();
}

export async function POST(req: Request) {
    return handlePostUsers(req);
}