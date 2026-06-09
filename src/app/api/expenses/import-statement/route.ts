import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { parseStatementCsv } from '@/lib/tbank/parse-statement';
import { buildStatementPreview } from '@/lib/tbank/preview';
import { importExpenses } from '@/lib/tbank/import-expenses';
import { firstCsvBytesFromZip } from '@/lib/tbank/unzip';
import type { BankOperation } from '@/lib/tbank/types';
import { upsertImportedExpense } from '@/lib/db/expense-import-repo';

export const runtime = 'nodejs';
export const maxDuration = 60;

// v1: все расходы со счёта вешаем на Плюшкино (счёт общий).
const POINT = 'point-1';
const MAX_BYTES = 15 * 1024 * 1024; // выписка — это небольшой CSV/zip

/** Декодирует байты CSV: сперва UTF-8, при провале парсинга — Windows-1251 (Т-Бизнес бывает в обеих). */
function parseWithEncoding(bytes: Uint8Array): BankOperation[] {
  try {
    return parseStatementCsv(new TextDecoder('utf-8').decode(bytes));
  } catch {
    return parseStatementCsv(new TextDecoder('windows-1251').decode(bytes));
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const fileEntry = form.get('file');
  const file = fileEntry instanceof File ? fileEntry : null;
  if (!file) return Response.json({ error: 'Нет файла' }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: 'Файл слишком большой (макс. 15 МБ)' }, { status: 413 });

  // 1. Достаём сырые байты выписки (.csv напрямую или .csv из .zip).
  let csvBytes: Uint8Array;
  try {
    const raw = new Uint8Array(await file.arrayBuffer());
    csvBytes = file.name.toLowerCase().endsWith('.zip') ? await firstCsvBytesFromZip(raw) : raw;
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Не удалось прочитать файл' }, { status: 400 });
  }

  // 2. Разбираем формат банка (бросает, если колонки не те — отдаём понятную 400, а не 500).
  let ops: BankOperation[];
  try {
    ops = parseWithEncoding(csvBytes);
  } catch (e) {
    const why = e instanceof Error ? e.message : '';
    return Response.json(
      { error: `Не похоже на выписку Т-Бизнес (${why}). Скачайте выписку по счёту в формате CSV.` },
      { status: 400 },
    );
  }
  if (ops.length === 0) return Response.json({ error: 'В файле нет операций' }, { status: 400 });

  const preview = buildStatementPreview(ops);

  // 3. Импорт — только операции с распознанной датой (пустая дата сломала бы запись).
  const datedOps = ops.filter((o) => o.date !== '');
  const skippedNoDate = ops.length - datedOps.length;

  const prisma = getPrisma();
  const summary = await importExpenses({
    fetchStatement: async () => datedOps,
    upsert: (e) => upsertImportedExpense(prisma, e),
    pointId: POINT,
    from: '',
    till: '',
  });

  return Response.json({ summary, preview, skippedNoDate });
}
