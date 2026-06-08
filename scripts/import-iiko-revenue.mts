import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { IikoClient, type IikoAuth } from '../src/lib/iiko/client';
import { importRevenue } from '../src/lib/iiko/import-revenue';
import { upsertImportedRevenue } from '../src/lib/db/revenue-import-repo';

const POINT = 'point-1'; // v1: выручка iiko → Плюшкино

function authFromEnv(): IikoAuth {
  if (process.env.IIKO_API_LOGIN) return { mode: 'apiLogin', apiLogin: process.env.IIKO_API_LOGIN };
  const { IIKO_APP_ID, IIKO_API_KEY, IIKO_CLIENT_SECRET } = process.env;
  if (IIKO_APP_ID && IIKO_API_KEY && IIKO_CLIENT_SECRET) {
    return { mode: 'app', appId: IIKO_APP_ID, apiKey: IIKO_API_KEY, clientSecret: IIKO_CLIENT_SECRET };
  }
  throw new Error('Нет кредов iiko: задайте IIKO_API_LOGIN либо IIKO_APP_ID+IIKO_API_KEY+IIKO_CLIENT_SECRET');
}

function arg(name: string, def: string): string {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.split('=')[1] : def;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const from = arg('from', '2026-02-01');
  const till = arg('till', today);
  const client = new IikoClient({ auth: authFromEnv() });
  const orgs = await client.getOrganizations();
  const orgId = process.env.IIKO_ORG_ID ?? orgs[0]?.id;
  if (!orgId) throw new Error('Не найдена организация iiko');

  if (process.argv.includes('--debug')) {
    console.log('организации:', JSON.stringify(orgs));
    console.log('orgId:', orgId, 'период:', from, '→', till);
    console.log('OLAP SALES columns:', JSON.stringify(await client.getOlapColumns()).slice(0, 1500));
    return;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const summary = await importRevenue({
      fetchSales: (f, t) => client.getOlapSales(orgId, f, t),
      upsert: (pointId, date, amount) => upsertImportedRevenue(prisma, { pointId, date, amount }),
      pointId: POINT,
      from,
      till,
    });
    console.log(JSON.stringify({ orgId, from, till, ...summary }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('import-iiko-revenue failed:', err);
  process.exit(1);
});
