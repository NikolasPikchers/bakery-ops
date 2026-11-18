import { describe, expect, it } from 'vitest';
import { DISH_SALE_DDL, ensureDishSaleTable } from './ensure-schema';

describe('ensureDishSaleTable — таблица продаж по позициям в уже живой базе', () => {
  it('каждая команда повторяема: при каждом старте приложения ничего не ломает', () => {
    expect(DISH_SALE_DDL.length).toBeGreaterThan(0);
    for (const sql of DISH_SALE_DDL) expect(sql).toMatch(/IF NOT EXISTS/);
  });

  it('колонки и ключи — как в модели Prisma DishSale', () => {
    const ddl = DISH_SALE_DDL.join('\n');
    for (const col of ['"pointId"', '"date" DATE', '"dishId"', '"dishGroup"', '"qty" DECIMAL(12,3)', '"revenue" DECIMAL(12,2)', '"cost" DECIMAL(12,2)', '"checks"', '"soloChecks"']) {
      expect(ddl).toContain(col);
    }
    expect(ddl).toContain('"DishSale_pointId_date_dishId_key"');
    expect(ddl).toContain('"DishSale_pointId_date_idx"');
    expect(ddl).toContain('REFERENCES "Point"("id")');
  });

  it('выполняет команды по порядку', async () => {
    const ran: string[] = [];
    await ensureDishSaleTable({ $executeRawUnsafe: async (sql: string) => ran.push(sql) });
    expect(ran).toEqual(DISH_SALE_DDL);
  });
});
