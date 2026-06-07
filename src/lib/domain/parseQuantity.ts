import type { ParsedQuantity } from './types';

const CIRCLED: Record<string, number> = {
  '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5, '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10,
  '⑪': 11, '⑫': 12, '⑬': 13, '⑭': 14, '⑮': 15, '⑯': 16, '⑰': 17, '⑱': 18, '⑲': 19, '⑳': 20,
};

export function parseQuantity(input: string | null | undefined): ParsedQuantity {
  const raw = input ?? '';
  const trimmed = raw.trim();

  // пустое / прочерк (минус, en-dash, em-dash)
  if (trimmed === '' || /^[-–—]+$/.test(trimmed)) {
    return { value: null, raw, parts: [], ambiguous: false };
  }

  // нормализуем тире в минус, схлопываем пробелы
  let s = trimmed.replace(/[–—]/g, '-').replace(/\s+/g, ' ');

  // вынимаем кружок-итог, если есть, и убираем его из строки
  let circled: number | null = null;
  for (const ch of s) {
    if (CIRCLED[ch] != null) circled = CIRCLED[ch];
  }
  s = [...s].filter((ch) => CIRCLED[ch] == null).join('').trim();

  // вынимаем явный «=N»
  let stated: number | null = null;
  const eq = s.match(/=\s*(\d+)\s*$/);
  if (eq) {
    stated = parseInt(eq[1], 10);
    s = s.slice(0, eq.index).trim();
    // несколько «=» (опечатка/мусор) → структуре не доверяем, на ручную проверку
    if (s.includes('=')) {
      const nums = (s.match(/\d+/g) ?? []).map((n) => parseInt(n, 10));
      return { value: stated, raw, parts: nums, ambiguous: true };
    }
  }

  // строка должна быть арифметикой из чисел и +/-
  const isPureExpr = /^\d+(\s*[+\-]\s*\d+)*$/.test(s);
  if (!isPureExpr) {
    const nums = (s.match(/\d+/g) ?? []).map((n) => parseInt(n, 10));
    const explicit = stated ?? circled;
    // одиночный итог без выражения (кружок ⑨ или «=N») — доверяем, не ambiguous
    if (explicit != null && nums.length === 0) {
      return { value: explicit, raw, parts: [], ambiguous: false };
    }
    const value = explicit ?? (nums.length ? nums[0] : null);
    return { value, raw, parts: nums, ambiguous: true };
  }

  // isPureExpr гарантирует непустое совпадение (минимум одна цифра)
  const tokens = s.match(/\d+|[+\-]/g)!;
  let acc = parseInt(tokens[0], 10);
  const parts = [acc];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const n = parseInt(tokens[i + 1], 10);
    parts.push(n);
    acc = op === '+' ? acc + n : acc - n;
  }

  const explicit = stated ?? circled;
  if (explicit != null) {
    return { value: explicit, raw, parts, ambiguous: explicit !== acc };
  }
  return { value: acc, raw, parts, ambiguous: false };
}
