import { describe, expect, it } from 'vitest';
import { aggregateDishSales } from './dish-sales';

const row = (date: string, check: string, dishId: string, name: string, qty: number, sum: number, cost?: number, group: string | null = null) => ({
  'OpenDate.Typed': date,
  'UniqOrderId.Id': check,
  DishId: dishId,
  DishName: name,
  DishGroup: group,
  DishAmountInt: qty,
  DishDiscountSumInt: sum,
  ...(cost === undefined ? {} : { 'ProductCostBase.ProductCost': cost }),
});

describe('aggregateDishSales — чеки iiko → продажи «день × блюдо»', () => {
  it('складывает чеки, считает чеки с позицией и чеки, где она одна', () => {
    const out = aggregateDishSales([
      // чек A: пицца ×2 + пакет — пицца взята «отдельно» (пакет не товар)
      row('2026-11-16', 'A', 'pizza', '// Пицца Классическая 126', 2, 252, 60, 'Сытная мелкоштучка'),
      row('2026-11-16', 'A', 'bag', 'Пакет Майка 8р', 1, 8, 0),
      // чек B: пицца + чай
      row('2026-11-16', 'B', 'pizza', '// Пицца Классическая 126', 1, 126, 30, 'Сытная мелкоштучка'),
      row('2026-11-16', 'B', 'tea', 'Чай (черный, зеленый) 40', 1, 40, undefined, 'Кофе, чай, напитки, фри'),
      // чек C: только пакет — ни для кого не «покупка отдельно»
      row('2026-11-16', 'C', 'bag', 'Пакет Майка 8р', 1, 8, 0),
    ]);
    const by = Object.fromEntries(out.map((d) => [d.dishId, d]));
    expect(by.pizza).toEqual({
      date: '2026-11-16', dishId: 'pizza', name: '// Пицца Классическая 126', dishGroup: 'Сытная мелкоштучка',
      qty: 3, revenue: 378, cost: 90, checks: 2, soloChecks: 1,
    });
    expect(by.tea).toMatchObject({ qty: 1, revenue: 40, cost: 0, checks: 1, soloChecks: 0 });
    expect(by.bag).toMatchObject({ qty: 2, revenue: 16, checks: 2, soloChecks: 0 });
  });

  it('разные дни — разные строки, по дате и id; строки без даты пропускаются; копейки округляются', () => {
    const out = aggregateDishSales([
      row('2026-11-17', 'X', 'b', 'Б', 1, 10.006),
      row('2026-11-16', 'Y', 'b', 'Б', 1, 0.1),
      row('2026-11-16', 'Y', 'a', 'А', 1, 0.2),
      row('', 'Z', 'a', 'А', 5, 500),
    ]);
    expect(out.map((d) => `${d.date}/${d.dishId}`)).toEqual(['2026-11-16/a', '2026-11-16/b', '2026-11-17/b']);
    expect(out[2].revenue).toBe(10.01);
  });
});
