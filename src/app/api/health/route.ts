import { getPrisma } from '@/lib/db/client';
import { describeDatabaseError } from '@/lib/db/connection-options';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'cache-control': 'no-store' };
  try {
    await getPrisma().$queryRaw`SELECT 1 AS ready`;
    return Response.json({ status: 'ok', revision: process.env.APP_REVISION || null }, { headers });
  } catch (error) {
    // Ответ без подробностей, а причина — в лог: без неё неудачный деплой не объяснить.
    console.error('Health check: база недоступна —', describeDatabaseError(error));
    return Response.json({ status: 'unavailable' }, { status: 503, headers });
  }
}
