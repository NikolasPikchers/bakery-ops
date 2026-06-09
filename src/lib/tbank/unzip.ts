import JSZip from 'jszip';

/**
 * Достаёт сырые байты первого .csv из zip-архива выписки (Т-Бизнес отдаёт выписку
 * либо .csv, либо .zip с .csv внутри). Декодирование (UTF-8/Windows-1251) — выше по стеку.
 */
export async function firstCsvBytesFromZip(bytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  const entry = Object.values(zip.files).find((f) => !f.dir && f.name.toLowerCase().endsWith('.csv'));
  if (!entry) throw new Error('В архиве нет .csv-файла');
  return entry.async('uint8array');
}
