import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { analyzeAssortment } from '@/lib/assortment/analyze';
import type { DishSaleDay } from '@/lib/iiko/types';
import { AssortmentClient, lossMessage } from './AssortmentClient';
import { AssortmentCard } from './AssortmentCard';

const sale = (date: string, dishId: string, name: string, revenue: number): DishSaleDay => ({
  date, dishId, name, dishGroup: null, qty: 1, revenue, cost: 0, checks: 1, soloChecks: 0,
});

// 3 дня работы; «Ириска» продавалась 2 из 3 — самая слабая, класс C.
const rows = [
  sale('2026-11-15', 'pizza', '// Пицца куриная 154', 90000),
  sale('2026-11-16', 'pizza', '// Пицца куриная 154', 90000),
  sale('2026-11-17', 'pizza', '// Пицца куриная 154', 90000),
  sale('2026-11-15', 'eclair', '\\ Эклер Пломбирный 165', 20000),
  sale('2026-11-15', 'toffee', '\\ Ириска с гимолайской солью', 700),
  sale('2026-11-17', 'toffee', '\\ Ириска с гимолайской солью', 700),
];
const spans = new Map([
  ['pizza', { first: '2026-01-03', last: '2026-11-17' }],
  ['eclair', { first: '2026-01-03', last: '2026-11-15' }],
  ['toffee', { first: '2026-01-03', last: '2026-11-17' }],
]);
const view = analyzeAssortment({ rows, spans, from: '2026-10-19', till: '2026-11-17' });
const plain = (s: string) => s.replace(/\u00a0/g, ' ');
/** Текст без тегов: числа в карточках выделены <b>. */
const text = (s: string) => plain(s).replace(/<[^>]+>/g, '');

describe('страница «Ассортимент»', () => {
  it('кандидаты на сокращение — класс C, с днями в продаже', () => {
    const html = text(renderToStaticMarkup(createElement(AssortmentClient, { view })));
    expect(html).toContain('Кандидаты на сокращение');
    const candidates = html.slice(html.indexOf('Кандидаты на сокращение'), html.indexOf('Все позиции'));
    expect(candidates).toContain('Ириска с гимолайской солью');
    expect(candidates).not.toContain('Пицца куриная');
    expect(candidates).toContain('2 из 3');
  });

  it('«что потеряю» — сумма, доля, как часто брали отдельно', () => {
    expect(plain(lossMessage({ count: 5, perMonth: 14200, share: 0.8, soloShare: 6 }))).toBe(
      'Отмечено 5 позиций: 14 200 ₽/мес — 0,8% выручки · отдельно их брали в 6% чеков',
    );
    expect(plain(lossMessage({ count: 1, perMonth: 1400, share: 0.08, soloShare: null }))).toBe('Отмечена 1 позиция: 1 400 ₽/мес — 0,08% выручки');
    expect(plain(lossMessage({ count: 3, perMonth: 900, share: 0.1, soloShare: null }))).toBe('Отмечено 3 позиции: 900 ₽/мес — 0,1% выручки');
  });

  it('карточка на дашборде: сколько в продаже и сколько кандидатов', () => {
    const html = renderToStaticMarkup(createElement(AssortmentCard, { view }));
    expect(html).toContain('href="/assortment"');
    expect(text(html)).toContain('в продаже 3');
    expect(text(html)).toMatch(/кандидатов на сокращение 1 \(0,48% выручки\)/);
  });
});
