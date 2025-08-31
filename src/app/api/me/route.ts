export const runtime = 'nodejs';

import { handleGetMe } from '@/lib/api/me';

export async function GET() {
    return handleGetMe();
}
