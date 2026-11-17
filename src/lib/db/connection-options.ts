import type { PoolConfig } from 'pg';

/** Timeweb uses a provider CA; keep TLS verification enabled for its database domain. */
export function databaseOptions(env: Record<string, string | undefined> = process.env): PoolConfig {
  const options: PoolConfig = { connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10_000, query_timeout: 15_000 };
  if (env.DATABASE_CA_CERT && env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
    options.connectionString = url.toString();
    options.ssl = { ca: env.DATABASE_CA_CERT.replace(/\\n/g, '\n'), rejectUnauthorized: true };
  }
  return options;
}
