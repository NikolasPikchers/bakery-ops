/**
 * Аддитивные изменения схемы, которые приложение применяет само при старте.
 * В проекте нет истории prisma migrate (схема — db push / SQL), а база Timeweb доступна только
 * из приложения, поэтому новые таблицы создаются здесь: только «если нет», старые данные не трогаются.
 * DDL сверен с `prisma migrate diff` по модели DishSale.
 */
export const DISH_SALE_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "DishSale" (
    "id" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dishId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dishGroup" TEXT,
    "qty" DECIMAL(12,3) NOT NULL,
    "revenue" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "checks" INTEGER NOT NULL,
    "soloChecks" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DishSale_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DishSale_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "Point"("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "DishSale_pointId_date_idx" ON "DishSale"("pointId", "date")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DishSale_pointId_date_dishId_key" ON "DishSale"("pointId", "date", "dishId")`,
];

export async function ensureDishSaleTable(db: { $executeRawUnsafe(sql: string): Promise<unknown> }): Promise<void> {
  for (const sql of DISH_SALE_DDL) await db.$executeRawUnsafe(sql);
}
