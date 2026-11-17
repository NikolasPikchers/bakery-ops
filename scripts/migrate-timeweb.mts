import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'dotenv';
import pg from 'pg';
import { databaseOptions } from '../src/lib/db/connection-options';
import { createS3BlobStore, s3ConfigFromEnv } from '../src/lib/storage/s3';

class MigrationError extends Error {}

type Env = Record<string, string>;
const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function counts(client: pg.Client): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const tables = await client.query<{ tablename: string }>('SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', ['public']);
  for (const { tablename } of tables.rows) {
    const rows = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${identifier(tablename)}`);
    result[tablename] = rows.rows[0].count;
  }
  return result;
}

/** Credentials travel in environment variables, never command-line arguments or logs. */
async function postgresTool(command: 'pg_dump' | 'pg_restore', url: string, env: Env, args: string[], backup: string, directory: string) {
  const parsed = new URL(url);
  const ca = env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  const rootCertificate = ca ? '/tmp/database-ca.crt' : '/etc/ssl/certs/ca-certificates.crt';
  const dockerArgs = ['run', '--rm', '-i'];
  if (ca) {
    const path = join(directory, 'database-ca.crt');
    writeFileSync(path, ca, { mode: 0o600 });
    dockerArgs.push('--mount', `type=bind,source=${path},target=/tmp/database-ca.crt,readonly`);
  }
  const pgEnv = {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: rootCertificate,
  };
  for (const name of Object.keys(pgEnv)) dockerArgs.push('-e', name);
  dockerArgs.push('postgres:17', command, ...args);
  const descriptor = openSync(backup, command === 'pg_dump' ? 'w' : 'r', 0o600);
  try {
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn('docker', dockerArgs, {
        env: { ...process.env, ...pgEnv },
        stdio: command === 'pg_dump' ? ['ignore', descriptor, 'pipe'] : [descriptor, 'ignore', 'pipe'],
      });
      // Drain stderr, which can contain private connection metadata. Only report an exit code.
      child.stderr?.resume();
      child.once('error', () => reject(new MigrationError(`${command}: failed to start Docker`)));
      child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new MigrationError(`${command}: failed with exit code ${code}`)));
    });
  } finally {
    closeSync(descriptor);
  }
}

async function main() {
  const sourceEnv = parse(readFileSync('.env'));
  const targetEnv = parse(readFileSync('.env.timeweb'));
  const sourceUrl = sourceEnv.DATABASE_URL_UNPOOLED || sourceEnv.DATABASE_URL;
  const targetUrl = targetEnv.DATABASE_URL;
  if (!sourceUrl || !targetUrl) throw new MigrationError('DATABASE_URL is required in both .env and .env.timeweb');
  const sourceAddress = new URL(sourceUrl);
  const targetAddress = new URL(targetUrl);
  if (sourceAddress.hostname === targetAddress.hostname) throw new MigrationError('Source and target database hosts must differ');
  const storage = createS3BlobStore(s3ConfigFromEnv(targetEnv));
  const source = new pg.Client(databaseOptions({ ...sourceEnv, DATABASE_URL: sourceUrl }));
  const target = new pg.Client(databaseOptions(targetEnv));
  const directory = resolve(join(homedir(), '.codex', 'backups', 'bakery-ops', new Date().toISOString().replaceAll(':', '-')));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const backup = join(directory, 'database.pgdump');

  try {
    await source.connect();
    await target.connect();
    if (Object.keys(await counts(target)).length) throw new MigrationError('Target database is not empty; refusing to overwrite it');

    console.log('Creating a consistent read-only snapshot and local backup');
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = await source.query<{ snapshot: string }>('SELECT pg_export_snapshot() AS snapshot');
    const expected = await counts(source);
    const sheets = await source.query<{ id: string; imageUrl: string }>('SELECT id, "imageUrl" FROM "Sheet" ORDER BY id');
    await postgresTool('pg_dump', sourceUrl, sourceEnv, ['--format=custom', '--no-owner', '--no-acl', `--snapshot=${snapshot.rows[0].snapshot}`], backup, directory);
    await source.query('COMMIT');

    console.log('Restoring the snapshot into the empty Timeweb database');
    await postgresTool('pg_restore', targetUrl, targetEnv, ['--no-owner', '--no-acl', '--exit-on-error', '--single-transaction', '--dbname', decodeURIComponent(targetAddress.pathname.slice(1))], backup, directory);
    const actual = await counts(target);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new MigrationError('Source snapshot and target row counts differ');

    console.log('Copying original photos into private S3 storage');
    for (const sheet of sheets.rows) {
      const url = new URL(sheet.imageUrl);
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.public.blob.vercel-storage.com')) throw new MigrationError('Unexpected source image host');
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new MigrationError('Could not download an original photo');
      const contentType = response.headers.get('content-type')?.split(';')[0];
      const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[contentType || ''];
      if (!ext) throw new MigrationError('Unsupported original photo format');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const key = `sheets/${sheet.id}.${ext}`;
      const result = await storage.put(key, bytes, contentType!);
      if (hash((await storage.read(key)).bytes) !== hash(bytes)) throw new MigrationError('Photo checksum mismatch after migration');
      await target.query('UPDATE "Sheet" SET "imageUrl" = $1 WHERE id = $2', [result.url, sheet.id]);
    }

    const receipt = { tables: actual, photosVerified: sheets.rowCount, backupSha256: hash(readFileSync(backup)), completedAt: new Date().toISOString() };
    writeFileSync(join(directory, 'verification.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ ...receipt, backupDirectory: directory }, null, 2));
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof MigrationError ? error.message : 'Migration failed; check the last completed step. Connection details were suppressed.');
  process.exitCode = 1;
});
