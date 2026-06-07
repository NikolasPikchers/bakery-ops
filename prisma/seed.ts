import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SEED_CATALOG } from '../src/lib/catalog/seed-catalog';
import { POINTS } from '../src/lib/domain/points';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Точки
  for (const p of POINTS) {
    await prisma.point.upsert({
      where: { id: p.id },
      update: { name: p.name },
      create: { id: p.id, name: p.name },
    });
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
