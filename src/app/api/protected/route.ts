export const runtime = 'nodejs';

import { handlePostProtected } from '@/lib/api/protected';

export async function POST() {
    return handlePostProtected();
}
