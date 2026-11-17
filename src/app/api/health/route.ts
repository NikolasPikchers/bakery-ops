import { getPrisma } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'cache-control': 'no-store' };
  try {
    await getPrisma().$queryRaw`SELECT 1 AS ready`;
    return Response.json({ status: 'ok', revision: process.env.APP_REVISION || null }, { headers });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers });
  }
}
