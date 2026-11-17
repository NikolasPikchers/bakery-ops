import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { TbankSyncCard, tbankSyncMessage } from './TbankSyncCard';

describe('карточка «Расходы из Т-Бизнеса»', () => {
  it('есть кнопка обновления и поля периода', () => {
    const html = renderToStaticMarkup(createElement(TbankSyncCard));
    expect(html).toContain('Расходы из Т-Бизнеса');
    expect(html).toContain('Обновить из банка');
    expect(html.match(/type="date"/g)).toHaveLength(2);
  });

  it('итог понятен: сколько расходов, сколько новых, сколько уже было', () => {
    expect(tbankSyncMessage({ from: '2026-11-12', till: '2026-11-18', fetched: 40, outgoing: 30, imported: 5, updated: 25 })).toBe(
      'Готово за 2026-11-12 — 2026-11-18: расходов в банке 30, добавлено 5, уже было 25.',
    );
  });
});
