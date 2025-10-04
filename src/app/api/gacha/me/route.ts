export const runtime = 'nodejs';

import { handleGetGachaMe } from '@/lib/api/gacha';

export async function GET() {
    return handleGetGachaMe();
}
