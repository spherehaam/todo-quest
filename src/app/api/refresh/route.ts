export const runtime = 'nodejs';

import { handleRefresh } from '@/lib/auth/refresh';

export async function POST() {
    return handleRefresh();
}
