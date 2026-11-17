import { vercelBlobStore, type BlobStore } from './blob';
import { getS3BlobStore } from './s3';

export function getBlobStore(): BlobStore {
  const provider = process.env.STORAGE_PROVIDER || 'vercel';
  if (provider === 's3') return getS3BlobStore();
  if (provider === 'vercel') return vercelBlobStore;
  throw new Error(`Unknown STORAGE_PROVIDER: ${provider}`);
}
