import { createHash } from 'node:crypto';

/** Стабильный SHA-256 (hex) от байтов изображения — ключ дедупа загруженных листов. */
export function computeImageHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
