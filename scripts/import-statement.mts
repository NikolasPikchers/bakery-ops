import 'dotenv/config';
import { readFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { parseStatementCsv } from '../src/lib/tbank/parse-statement';
import { categorize, isImportableExpense } from '../src/lib/tbank/categorize';
import { importExpenses } from '../src/lib/tbank/import-expenses';
import { upsertImportedExpense } from '../src/lib/db/expense-import-repo';

const POINT = 'point-1'; // v1: все импортированные расходы → Плюшкино

function readCsv(path: string): string {
  if (path.toLowerCase().endsWith('.zip')) {
    const dir = mkdtempSync(join(tmpdir(), 'tb-stmt-'));
    execFileSync('unzip', ['-o', '-j', path, '-d', dir]);
    const csv = readdirSync(dir).find((f) => f.toLowerCase().endsWith('.csv'));
    if (!csv) throw new Error('В архиве нет .csv');
    return readFileSync(join(dir, csv), 'utf8');
  }
  return readFileSync(path, 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const path = args.find((a) => !a.startsWith('--'));
  if (!path) {
    console.error('Использование: npm run import:statement -- <путь к .csv|.zip> [--dry]');
    process.exit(1);
  }

  const ops = parseStatementCsv(readCsv(path));
  const outgoing = ops.filter(isImportableExpense);
  const excluded = ops.filter((o) => o.direction === 'out' && !isImportableExpense(o));
  console.log(`Операций в файле: ${ops.length} | к импорту (расходы): ${outgoing.length} | исключено (переводы себе): ${excluded.length}`);

  if (dry) {
    const byCat = new Map<string, { n: number; sum: number }>();
    let review = 0;
    for (const o of outgoing) {
      const { category, needsReview } = categorize(o);
      const c = byCat.get(category) ?? { n: 0, sum: 0 };
      c.n++;
      c.sum += o.amount;
      byCat.set(category, c);
      if (needsReview) review++;
    }
    console.log('Категории (предпросмотр, без записи в БД):');
    for (const [cat, v] of [...byCat.entries()].sort((a, b) => b[1].sum - a[1].sum)) {
      console.log(`  ${cat.padEnd(11)} ${String(v.n).padStart(4)} оп  ${(Math.round(v.sum).toLocaleString('ru-RU') + ' ₽').padStart(15)}`);
    }
    console.log(`Требуют ручной проверки (prochee/needsReview): ${review}`);
    return;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const summary = await importExpenses({
      fetchStatement: async () => ops,
      upsert: (e) => upsertImportedExpense(prisma, e),
      pointId: POINT,
      from: '',
      till: '',
    });
    console.log(JSON.stringify(summary));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('import-statement failed:', err);
  process.exit(1);
});
