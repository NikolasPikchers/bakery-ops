import { getPrisma } from '@/lib/db/client';
import { toDbDate } from '@/lib/db/dates';
import { TBusinessClient } from '@/lib/tbank/client';
import { diagnoseStatement } from '@/lib/tbank/diagnose';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/**
 * Диагностика T-API без записи в базу: выписка за период сверяется с расходами,
 * загруженными из файла. Токен банка привязан к IP сервера — проверить можно только с прода.
 * Доступ — по CRON_SECRET, как у ночных синхронизаций (middleware путь не закрывает).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = process.env.TBUSINESS_API_TOKEN;
  if (!token) return Response.json({ error: 'Нет TBUSINESS_API_TOKEN' }, { status: 500 });

  const params = new URL(req.url).searchParams;
  const from = params.get('from') ?? '2026-10-01';
  const till = params.get('till') ?? '2026-10-31';
  if (!validDate(from) || !validDate(till) || till < from) {
    return Response.json({ error: 'Период: from и till в формате ГГГГ-ММ-ДД, till ≥ from' }, { status: 400 });
  }

  const started = Date.now();
  const steps: string[] = [];
  const step = (s: string) => {
    const line = `${Math.round((Date.now() - started) / 100) / 10}s ${s}`;
    steps.push(line);
    console.log('tbank diagnose:', line);
  };

  try {
    const client = new TBusinessClient({ token });
    const accounts = await client.getAccounts();
    step(`счетов: ${accounts.length}`);
    const reports = [];
    for (const a of accounts) {
      const tag = `…${a.accountNumber.slice(-4)}`;
      let page = 0;
      const ops = await client.getStatement(a.accountNumber, from, till, (n) => step(`${tag} страница ${++page}: ${n} операций`));
      const existing = await getPrisma().expense.findMany({
        where: { source: 'tbusiness', date: { gte: toDbDate(from), lte: toDbDate(till) }, externalId: { startsWith: `${a.accountNumber}|` } },
        select: { externalId: true, category: true },
      });
      const rows = existing.flatMap((e) => (e.externalId ? [{ externalId: e.externalId, category: String(e.category) }] : []));
      step(`${tag}: в базе ${rows.length} расходов из файла за период`);
      reports.push({ account: tag, accountType: a.accountType ?? null, ...diagnoseStatement(ops, a.accountNumber, rows) });
    }
    return Response.json({ from, till, accounts: accounts.length, steps, reports });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error('tbank diagnose failed:', error);
    return Response.json({ error, steps }, { status: 502 });
  }
}
