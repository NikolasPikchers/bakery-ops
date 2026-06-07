import { describe, it, expect } from 'vitest';
import { parseSheetAction } from './sheet-actions';

describe('parseSheetAction', () => {
  it('parses a save action with edits', () => {
    const r = parseSheetAction({
      action: 'save',
      edits: [
        { productId: 'p1', date: '2026-06-05', prihod: 24, ostatok: 9, spisanie: null },
        { productId: 'p1', date: '2026-06-06', prihod: null, ostatok: 2, spisanie: 0 },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.action === 'save') expect(r.value.edits).toHaveLength(2);
  });
  it('parses a confirm action', () => {
    const r = parseSheetAction({ action: 'confirm' });
    expect(r).toEqual({ ok: true, value: { action: 'confirm' } });
  });
  it('parses mapUnknown / ignoreUnknown', () => {
    expect(parseSheetAction({ action: 'mapUnknown', id: 'u1', productId: 'p1' }).ok).toBe(true);
    expect(parseSheetAction({ action: 'ignoreUnknown', id: 'u1' }).ok).toBe(true);
  });
  it('rejects unknown action', () => {
    expect(parseSheetAction({ action: 'nuke' }).ok).toBe(false);
  });
  it('rejects a save edit with a non-integer quantity', () => {
    const r = parseSheetAction({
      action: 'save',
      edits: [{ productId: 'p1', date: '2026-06-05', prihod: 1.5, ostatok: null, spisanie: null }],
    });
    expect(r.ok).toBe(false);
  });
  it('rejects a save edit with a bad date', () => {
    const r = parseSheetAction({
      action: 'save',
      edits: [{ productId: 'p1', date: '05.06.2026', prihod: 1, ostatok: null, spisanie: null }],
    });
    expect(r.ok).toBe(false);
  });
});
