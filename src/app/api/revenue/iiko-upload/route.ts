import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { parseSalesXlsx, dateFromFilename } from '@/lib/iiko/parse-sales-xlsx';
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
    const date = dateFromFilename(f.name);
    if (!date) {
      results.push({ file: f.name, date: null, status: 'нет даты в имени файла' });
      continue;
    }
    try {
      const { total } = await parseSalesXlsx(await f.arrayBuffer());
      if (!(total > 0)) {
        results.push({ file: f.name, date, amount: 0, status: 'выручка 0 — пропущено' });
        continue;
      }
      const r = await upsertImportedRevenue(prisma, { pointId: POINT, date, amount: total, source: 'iiko' });
      if (r === 'imported') imported++;
      else updated++;
      results.push({ file: f.name, date, amount: total, status: r === 'imported' ? 'добавлено' : 'обновлено' });
    } catch {
      results.push({ file: f.name, date, status: 'ошибка чтения xlsx' });
    }
  }

  return Response.json({ imported, updated, results });
}
