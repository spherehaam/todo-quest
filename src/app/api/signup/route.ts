export const runtime = 'nodejs';

import { handlePostSignup } from '@/lib/api/signup';

export async function POST(req: Request) {
    return handlePostSignup(req);
}
