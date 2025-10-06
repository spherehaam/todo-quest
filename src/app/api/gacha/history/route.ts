export const runtime = 'nodejs';

import { handleGetGachaHistory } from '@/lib/api/gacha';

export async function GET() {
    return handleGetGachaHistory();
}
