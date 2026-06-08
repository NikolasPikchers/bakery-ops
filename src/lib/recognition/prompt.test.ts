import { describe, it, expect } from 'vitest';
import { buildRecognitionPrompt } from './prompt';
import type { CatalogEntry } from './match-product';

const catalog: CatalogEntry[] = [
  { id: 'p1', name: 'Самса' },
  { id: 'p2', name: 'Пицца открытая' },
];

describe('buildRecognitionPrompt', () => {
  it('включает позиции каталога и тип листа', () => {
    const p = buildRecognitionPrompt(catalog, 'pies');
    expect(p).toContain('Самса');
    expect(p).toContain('Пицца открытая');
    expect(p).toContain('pies');
  });
  it('инструктирует НЕ вычислять, а транскрибировать как написано', () => {
    const p = buildRecognitionPrompt(catalog, 'pies');
    expect(p).toMatch(/не вычисля/i);
    expect(p).toContain('24+12+6');
  });
  it('просит дописанные от руки строки класть в unknownLines', () => {
    const p = buildRecognitionPrompt(catalog, 'pies');
    expect(p).toContain('unknownLines');
  });
  it('указывает русский формат дат ДД.ММ (день первым) и ISO на выход', () => {
    const p = buildRecognitionPrompt(catalog, 'pies');
    expect(p).toMatch(/ДД\.ММ|день\.месяц/i);
    expect(p).toContain('YYYY-MM-DD');
  });
});
