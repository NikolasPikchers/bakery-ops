import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { parseSalesXlsx } from '@/lib/iiko/parse-sales-xlsx';
import { salesDaysFromFile } from '@/lib/iiko/sales-days';
import { upsertImportedRevenue } from '@/lib/db/revenue-import-repo';

export const runtime = 'nodejs';
export const maxDuration = 60;

const POINT = 'point-1'; // Плюшкино

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return Response.json({ error: 'Нет файлов' }, { status: 400 });

  const prisma = getPrisma();
  const results: { file: string; date: string | null; amount?: number; status: string }[] = [];
  let imported = 0;
  let updated = 0;

  for (const f of files) {
    let parsed;
    try {
      parsed = await parseSalesXlsx(await f.arrayBuffer());
    } catch (e) {
      results.push({ file: f.name, date: null, status: e instanceof Error ? e.message : 'ошибка чтения xlsx' });
      continue;
    }

    const resolved = salesDaysFromFile(f.name, parsed);
    if (!resolved.ok) {
      results.push({ file: f.name, date: null, status: resolved.error });
      continue;
    }
    const label = resolved.from === resolved.till ? resolved.from : `${resolved.from} — ${resolved.till}`;
    if (!(parsed.total > 0)) {
      results.push({ file: f.name, date: label, amount: 0, status: 'выручка 0 — пропущено' });
      continue;
    }

    try {
      let added = 0;
      let changed = 0;
      for (const d of resolved.days) {
        const r = await upsertImportedRevenue(prisma, {
          pointId: POINT,
          date: d.date,
          amount: d.amount,
          confectionery: d.confectionery,
          source: 'iiko',
        });
        if (r === 'imported') added++;
        else changed++;
      }
      imported += added;
      updated += changed;
      const what = added > 0 && changed > 0 ? `добавлено ${added}, обновлено ${changed}` : added > 0 ? 'добавлено' : 'обновлено';
      results.push({
        file: f.name,
        date: label,
        amount: parsed.total,
        status: resolved.days.length > 1 ? `${what} · разбито по ${resolved.days.length} дн` : what,
      });
    } catch {
      results.push({ file: f.name, date: label, status: 'ошибка записи в БД' });
    }
  }

  return Response.json({ imported, updated, results });
}
