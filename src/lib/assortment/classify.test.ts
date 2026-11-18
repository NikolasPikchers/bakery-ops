import { describe, expect, it } from 'vitest';
import { dishCategory, displayName, isServiceDish } from './classify';

describe('dishCategory — категория позиции Плюшкино', () => {
  it('сытное: префикс «//» и группа «Сытная мелкоштучка»', () => {
    expect(dishCategory('// Пицца куриная 154', 'Сытная мелкоштучка')).toBe('savory');
    expect(dishCategory('Слойка курица/сыр 98', 'Сытная мелкоштучка')).toBe('savory');
  });

  it('кондитерка по префиксу «\\» — префикс важнее группы iiko', () => {
    expect(dishCategory('\\ Эскимо 155', null)).toBe('confectionery');
    expect(dishCategory('\\ Пончики на сметане 83', 'Сладкая мелкоштучка')).toBe('confectionery');
  });

  it('сладкая выпечка, напитки, под заказ, прочее — по группе', () => {
    expect(dishCategory('Сочень с творогом 73', 'Сладкая мелкоштучка')).toBe('sweet');
    expect(dishCategory('Капучино 139', 'Кофе, чай, напитки, фри')).toBe('drinks');
    expect(dishCategory('Лимонад 95', 'ЛПЗ')).toBe('drinks');
    expect(dishCategory('Пирог Жульен (Заказной) 729', 'Заказные пироги')).toBe('order');
    expect(dishCategory('ЧикенБургер 235', null)).toBe('other');
    expect(dishCategory('Тесто Дрожжевое 1000 грамм 190', 'ТЕСТО')).toBe('other');
  });
});

describe('isServiceDish — пакеты, стаканчики, допы', () => {
  it('служебное', () => {
    for (const n of ['Пакет Майка 8р', 'Стаканчик 10р', 'Упаковка 100р', 'Доп. Сироп (любой) 15р', 'Соус ASTORIA Сыр 25р']) {
      expect(isServiceDish(n)).toBe(true);
    }
  });

  it('товар — не служебное', () => {
    expect(isServiceDish('// Сосиска в тесте 86')).toBe(false);
    expect(isServiceDish('Тесто Дрожжевое 500 грамм 120')).toBe(false);
  });
});

describe('displayName', () => {
  it('убирает префикс категории', () => {
    expect(displayName('// Пицца куриная 154')).toBe('Пицца куриная 154');
    expect(displayName('\\ Эскимо 155')).toBe('Эскимо 155');
    expect(displayName(' Постный лук грибы 77')).toBe('Постный лук грибы 77');
    expect(displayName('Капучино 139')).toBe('Капучино 139');
  });
});
