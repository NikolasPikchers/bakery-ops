import { getPrisma } from '@/lib/db/client';
import { runIikoSync, syncWindow } from '@/lib/iiko/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Ночной Vercel Cron (vercel.json): выручка Плюшкино из iiko за вчера и сегодня.
 * Vercel шлёт `Authorization: Bearer $CRON_SECRET`; без заданного секрета роут закрыт.
 * Middleware этот путь пропускает — сессии у крона нет.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return Response.json(await runIikoSync(getPrisma(), syncWindow(new Date())));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error('cron iiko-sync failed:', error);
    return Response.json({ error }, { status: 500 });
  }
}
