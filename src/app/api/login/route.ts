export const runtime = 'nodejs';

import { handleLogin } from '@/lib/auth/login';

export async function POST(req: Request) {
    return handleLogin(req);
}
