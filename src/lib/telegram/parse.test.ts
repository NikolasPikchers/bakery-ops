import { describe, it, expect } from 'vitest';
import { extractMessage, parseCaption, parseAllowedChatIds, isAllowed } from './parse';

describe('extractMessage', () => {
  it('pulls chatId, caption text and the largest photo file_id', () => {
    const update = {
      update_id: 1,
      message: {
        chat: { id: 555 },
        caption: 'Плюшкино пироги',
        photo: [
          { file_id: 'small', width: 90 },
          { file_id: 'big', width: 1280 },
        ],
      },
    };
    expect(extractMessage(update)).toEqual({ chatId: 555, text: 'Плюшкино пироги', photoFileId: 'big' });
  });
  it('uses text when there is no caption, and null photo when none', () => {
    expect(extractMessage({ message: { chat: { id: 7 }, text: 'привет' } })).toEqual({ chatId: 7, text: 'привет', photoFileId: null });
  });
  it('returns null when there is no message', () => {
    expect(extractMessage({ update_id: 1 })).toBeNull();
    expect(extractMessage(null)).toBeNull();
  });
});

describe('parseCaption', () => {
  it('parses point + pies', () => {
    expect(parseCaption('Плюшкино пироги')).toEqual({ pointId: 'point-1', sheetType: 'pies' });
  });
  it('parses point + desserts (any order, case-insensitive)', () => {
    expect(parseCaption('десерты корица')).toEqual({ pointId: 'point-2', sheetType: 'desserts' });
  });
  it('parses freeform confectionery', () => {
    expect(parseCaption('Плюшкино кондитерка')).toEqual({ pointId: 'point-1', sheetType: 'confectionery_freeform' });
  });
  it('accepts point ids and "выпечка" synonym', () => {
    expect(parseCaption('point-2 выпечка')).toEqual({ pointId: 'point-2', sheetType: 'pies' });
  });
  it('returns null when point or type missing', () => {
    expect(parseCaption('просто пироги')).toBeNull();
    expect(parseCaption('Плюшкино')).toBeNull();
    expect(parseCaption('')).toBeNull();
  });
});

describe('allowlist', () => {
  it('parses comma/space separated ids, ignoring junk', () => {
    expect(parseAllowedChatIds('111, 222 , ,abc, 333')).toEqual([111, 222, 333]);
    expect(parseAllowedChatIds('')).toEqual([]);
  });
  it('isAllowed checks membership', () => {
    expect(isAllowed(222, [111, 222])).toBe(true);
    expect(isAllowed(999, [111, 222])).toBe(false);
  });
});
