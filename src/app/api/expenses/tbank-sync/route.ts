import { requireOwner } from '@/lib/auth/require-owner';
import { getPrisma } from '@/lib/db/client';
import { parseSyncRange } from '@/lib/tbank/sync-range';
import { runTbankSync, tbankSyncWindow } from '@/lib/tbank/sync';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Расходы из Т-Бизнеса сейчас (кнопка на «Расходах»). Без тела — последние 7 дней; с { from, till } — свой период. */
export async function POST(req: Request) {
  const session = await requireOwner();
  if (session instanceof Response) return session;

  const body = (await req.json().catch(() => null)) as { from?: unknown; till?: unknown } | null;
  let range = tbankSyncWindow(new Date());
  if (body && (body.from !== undefined || body.till !== undefined)) {
    const parsed = parseSyncRange(body.from, body.till);
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    range = parsed;
  }

  try {
    return Response.json(await runTbankSync(getPrisma(), range));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error('tbank-sync failed:', error);
    return Response.json({ error }, { status: 502 });
  }
}
