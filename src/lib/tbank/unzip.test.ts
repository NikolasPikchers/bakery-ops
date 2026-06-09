import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { firstCsvBytesFromZip } from './unzip';

const dec = (b: Uint8Array) => new TextDecoder('utf-8').decode(b);

describe('firstCsvBytesFromZip', () => {
  it('достаёт байты первого .csv из архива', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'не csv');
    zip.file('Выписка.csv', 'Дата;Сумма\n01.06.2026;100');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    expect(dec(await firstCsvBytesFromZip(bytes))).toBe('Дата;Сумма\n01.06.2026;100');
  });

  it('кидает ошибку, если csv в архиве нет', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'hi');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    await expect(firstCsvBytesFromZip(bytes)).rejects.toThrow('нет .csv');
  });
});
