import { describe, expect, it, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { createS3BlobStore, isSheetImageKey, s3ConfigFromEnv } from './s3';

const env = {
  S3_ENDPOINT: 'https://s3.twcstorage.ru',
  S3_REGION: 'ru-1',
  S3_BUCKET: 'bakery-sheets',
  S3_ACCESS_KEY_ID: 'access-key',
  S3_SECRET_ACCESS_KEY: 'secret-key',
};

describe('S3 storage', () => {
  it('requires explicit credentials and reports missing variable names only', () => {
    expect(() => s3ConfigFromEnv({ S3_ENDPOINT: env.S3_ENDPOINT })).toThrow(/S3_BUCKET.*S3_ACCESS_KEY_ID.*S3_SECRET_ACCESS_KEY/);
    expect(s3ConfigFromEnv(env)).toMatchObject({ bucket: 'bakery-sheets', region: 'ru-1' });
  });

  it('uploads original bytes to a private bucket and returns a same-origin image URL', async () => {
    const send = vi.fn().mockResolvedValue({});
    const store = createS3BlobStore(s3ConfigFromEnv(env), { send } as unknown as S3Client);
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await store.put('sheets/sheet-123.jpg', bytes, 'image/jpeg')).toEqual({ url: '/api/storage/sheets/sheet-123.jpg' });
    expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: 'bakery-sheets', Key: 'sheets/sheet-123.jpg', Body: bytes, ContentType: 'image/jpeg' });
    expect(send.mock.calls[0][0].input.ACL).toBeUndefined();
  });

  it('cannot read arbitrary keys or paths from the bucket', () => {
    expect(isSheetImageKey('sheets/abc_123-456.webp')).toBe(true);
    for (const key of ['secrets/.env', 'sheets/../passwords.jpg', 'sheets/nested/file.jpg', 'sheets/file.svg', '/sheets/file.jpg']) {
      expect(isSheetImageKey(key)).toBe(false);
    }
  });
});
