import { describe, it, expect } from 'vitest';
import { parseUploadFields } from './upload-input';

const file = (type: string) => ({ type, name: 'x' }) as File;

describe('parseUploadFields', () => {
  it('accepts a valid point/type/file triple', () => {
    const r = parseUploadFields({ pointId: 'point-1', sheetType: 'pies', file: file('image/jpeg') });
    expect(r).toEqual({ ok: true, value: { pointId: 'point-1', sheetType: 'pies', mediaType: 'image/jpeg' } });
  });
  it('rejects an unknown point', () => {
    const r = parseUploadFields({ pointId: 'x', sheetType: 'pies', file: file('image/jpeg') });
    expect(r.ok).toBe(false);
  });
  it('rejects an unknown sheet type', () => {
    const r = parseUploadFields({ pointId: 'point-1', sheetType: 'bread', file: file('image/jpeg') });
    expect(r.ok).toBe(false);
  });
  it('rejects an unsupported media type', () => {
    const r = parseUploadFields({ pointId: 'point-1', sheetType: 'pies', file: file('application/pdf') });
    expect(r.ok).toBe(false);
  });
  it('rejects a missing file', () => {
    const r = parseUploadFields({ pointId: 'point-1', sheetType: 'pies', file: null });
    expect(r.ok).toBe(false);
  });
});
