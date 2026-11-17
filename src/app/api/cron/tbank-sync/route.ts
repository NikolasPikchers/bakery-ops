import { getPrisma } from '@/lib/db/client';
import { parseSyncRange } from '@/lib/tbank/sync-range';
import { runTbankSync, tbankSyncWindow } from '@/lib/tbank/sync';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Расходы из Т-Бизнеса по CRON_SECRET (без сессии; middleware путь не закрывает).
 * По умолчанию — последние 7 дней; ?from=&till= — свой период; ?dry=1 — посчитать, не записывая.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const q = new URL(req.url).searchParams;
  let range = tbankSyncWindow(new Date());
  if (q.has('from') || q.has('till')) {
    const parsed = parseSyncRange(q.get('from'), q.get('till'));
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    range = parsed;
  }
  try {
    return Response.json(await runTbankSync(getPrisma(), range, { dryRun: q.get('dry') === '1' }));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error('cron tbank-sync failed:', error);
    return Response.json({ error }, { status: 500 });
  }
}
