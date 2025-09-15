export const runtime = 'nodejs';

import { handleGetLevels } from '@/lib/api/levels';

export async function GET(req: Request) {
    return handleGetLevels(req);
}