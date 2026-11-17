import { describe, expect, it } from 'vitest';
import { apiExternalId, canonicalExpenseKey, reconcileExternalIds } from './expense-key';

const ACC = '40802810000000000001';

describe('canonicalExpenseKey', () => {
  it('ключ из файла: дата ДД.ММ.ГГГГ, сумма с запятой', () => {
    expect(canonicalExpenseKey(`${ACC}|24108|31.10.2026|406,7`)).toBe(`${ACC}|24108|2026-10-31|406.70`);
    expect(canonicalExpenseKey(`${ACC}|5|01.10.2026|1020`)).toBe(`${ACC}|5|2026-10-01|1020.00`);
  });

  it('ключ из API: дата ISO, сумма с точкой — тот же канонический вид', () => {
    expect(canonicalExpenseKey(`${ACC}|24108|2026-10-31|406.70`)).toBe(`${ACC}|24108|2026-10-31|406.70`);
  });

  it('не ключ — null', () => {
    expect(canonicalExpenseKey('мусор')).toBeNull();
    expect(canonicalExpenseKey(`${ACC}|1|31/10/2026|5`)).toBeNull();
  });
});

describe('apiExternalId', () => {
  it('сразу в каноническом виде', () => {
    expect(apiExternalId(ACC, '24108', '2026-10-31', 406.7)).toBe(`${ACC}|24108|2026-10-31|406.70`);
  });
});

describe('reconcileExternalIds', () => {
  const row = (externalId: string) => ({ externalId, amount: 1 });

  it('строка из API, уже загруженная из файла, получает externalId файла — обновится, а не задвоится', () => {
    const { rows, matched } = reconcileExternalIds([row(`${ACC}|24108|2026-10-31|406.70`)], [`${ACC}|24108|31.10.2026|406,7`]);
    expect(rows[0].externalId).toBe(`${ACC}|24108|31.10.2026|406,7`);
    expect(matched).toBe(1);
  });

  it('и наоборот: файл после API находит строку из API', () => {
    const { rows } = reconcileExternalIds([row(`${ACC}|24108|31.10.2026|406,7`)], [`${ACC}|24108|2026-10-31|406.70`]);
    expect(rows[0].externalId).toBe(`${ACC}|24108|2026-10-31|406.70`);
  });

  it('новая операция остаётся как есть', () => {
    const { rows, matched } = reconcileExternalIds([row(`${ACC}|999|2026-11-02|10.00`)], [`${ACC}|24108|31.10.2026|406,7`]);
    expect(rows[0].externalId).toBe(`${ACC}|999|2026-11-02|10.00`);
    expect(matched).toBe(0);
  });

  it('другая сумма при том же номере — разные операции', () => {
    const { matched } = reconcileExternalIds([row(`${ACC}|24108|2026-10-31|406.71`)], [`${ACC}|24108|31.10.2026|406,7`]);
    expect(matched).toBe(0);
  });
});
