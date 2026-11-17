import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseOptions } from '../src/lib/db/connection-options';
import { IikoClient } from '../src/lib/iiko/client';
import { iikoAuthFromEnv, runIikoSync, syncWindow } from '../src/lib/iiko/sync';

// Выручка Плюшкино из iikoCloud → Revenue (point-1, source iiko). Идемпотентно по дню.
//   npm run import:iiko                                   — вчера и сегодня (как крон)
//   npm run import:iiko -- --from=2026-02-01 --till=2026-06-08   — история (режется по 31 дню)
//   npm run import:iiko -- --debug                        — организации и поля OLAP, без записи

function arg(name: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p?.split('=')[1];
}

async function main() {
  const window = syncWindow(new Date());
  const range = { from: arg('from') ?? window.from, till: arg('till') ?? window.till };

  if (process.argv.includes('--debug')) {
    const client = new IikoClient({ auth: iikoAuthFromEnv() });
    console.log('организации:', JSON.stringify(await client.getOrganizations()));
    const cols = await client.getOlapColumns();
    console.log(`OLAP SALES: ${cols.length} полей`);
    for (const c of cols) console.log(`  ${c.name} — ${c.displayName ?? ''}`);
    return;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseOptions()) });
  try {
    console.log(JSON.stringify(await runIikoSync(prisma, range)));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('import-iiko-revenue failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
