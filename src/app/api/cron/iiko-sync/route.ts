import { getPrisma } from '@/lib/db/client';
import { iikoCatchUpWindow, runIikoSync } from '@/lib/iiko/sync';
import { parseSyncRange } from '@/lib/sync-range';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** История за год — iiko режется по 31 дню внутри синхронизации. */
const MAX_DAYS = 366;

/**
 * Выручка и продажи по позициям Плюшкино из iiko по CRON_SECRET (`Authorization: Bearer …`);
 * без заданного секрета роут закрыт. Middleware путь пропускает — сессии у крона нет.
 * По умолчанию — вчера и сегодня, а после сбоя iiko — с последнего загруженного дня;
 * ?from=&till= — свой период (загрузка истории).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const q = new URL(req.url).searchParams;
  let range: { from: string; till: string } | null = null;
  if (q.has('from') || q.has('till')) {
    const parsed = parseSyncRange(q.get('from'), q.get('till'), MAX_DAYS);
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    range = parsed;
  }
  try {
    range ??= await iikoCatchUpWindow(getPrisma(), new Date());
    return Response.json(await runIikoSync(getPrisma(), range));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error('cron iiko-sync failed:', error);
    return Response.json({ error, ...range }, { status: 500 });
  }
}
