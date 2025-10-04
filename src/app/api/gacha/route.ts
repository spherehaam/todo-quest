export const runtime = 'nodejs';

import { handleGetGacha } from '@/lib/api/gacha';

export async function GET(req: Request) {
    return handleGetGacha(req);
}
