export const runtime = 'nodejs';

import { handleLogout } from '@/lib/auth/logout';

export async function POST() {
    return handleLogout();
}
