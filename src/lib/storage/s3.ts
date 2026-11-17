import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { BlobStore } from './blob';

type StorageEnv = Record<string, string | undefined>;
type S3Config = { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string };

export function s3ConfigFromEnv(env: StorageEnv = process.env): S3Config {
  const required = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing S3 configuration: ${missing.join(', ')}`);
  return {
    endpoint: env.S3_ENDPOINT!,
    region: env.S3_REGION || 'ru-1',
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
  };
}

/** Only original raster photos may be served through the authenticated image route. */
export function isSheetImageKey(key: string): boolean {
  return /^sheets\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(key);
}

type S3BlobStore = BlobStore & {
  read(key: string): Promise<{ bytes: Uint8Array; contentType: string }>;
};

export function createS3BlobStore(config: S3Config, client = new S3Client({
  endpoint: config.endpoint,
  region: config.region,
  credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
})): S3BlobStore {
  function checkKey(key: string) {
    if (!isSheetImageKey(key)) throw new Error('Invalid sheet image key');
  }

  return {
    async put(key, bytes, contentType) {
      checkKey(key);
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: bytes, ContentType: contentType }), { abortSignal: AbortSignal.timeout(30_000) });
      // A private bucket keeps photos behind the application's existing owner login.
      return { url: `/api/storage/${key}` };
    },
    async read(key) {
      checkKey(key);
      const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: AbortSignal.timeout(30_000) });
      if (!result.Body) throw new Error('Empty S3 image');
      return { bytes: await result.Body.transformToByteArray(), contentType: result.ContentType || 'application/octet-stream' };
    },
  };
}

let store: S3BlobStore | undefined;

export function getS3BlobStore(): S3BlobStore {
  return store ??= createS3BlobStore(s3ConfigFromEnv());
}
