import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SEED_CATALOG } from '../src/lib/catalog/seed-catalog';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Точки
  const points = [
    { id: 'point-1', name: 'Точка 1' },
    { id: 'point-2', name: 'Точка 2' },
  ];
  for (const p of points) {
    await prisma.point.upsert({ where: { name: p.name }, update: {}, create: p });
  }

  // Каталог SKU
  for (const sp of SEED_CATALOG) {
    await prisma.product.upsert({
      where: { name_sheetType: { name: sp.name, sheetType: sp.sheetType } },
      update: {
        pointScope: sp.pointScope,
        shelfLifeDays: sp.shelfLifeDays ?? null,
        aliases: sp.aliases ?? [],
      },
      create: {
        name: sp.name,
        sheetType: sp.sheetType,
        pointScope: sp.pointScope,
        shelfLifeDays: sp.shelfLifeDays ?? null,
        aliases: sp.aliases ?? [],
      },
    });
  }

  const [pts, prods] = await Promise.all([prisma.point.count(), prisma.product.count()]);
  console.log(`Seeded: ${pts} points, ${prods} products`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
