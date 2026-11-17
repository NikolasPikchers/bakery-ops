import { describe, expect, it } from 'vitest';
import { databaseOptions } from './connection-options';

describe('PostgreSQL TLS configuration', () => {
  it('keeps the existing connection settings when no custom CA is configured', () => {
    expect(databaseOptions({ DATABASE_URL: 'postgres://user:pass@db/app?sslmode=require' }).connectionString).toBe('postgres://user:pass@db/app?sslmode=require');
  });

  it('uses the provider CA with certificate verification and prevents URL SSL flags overriding it', () => {
    const options = databaseOptions({ DATABASE_URL: 'postgres://user:pass@db/app?sslmode=require&sslrootcert=system&application_name=bakery', DATABASE_CA_CERT: 'certificate\\nnext-line' });
    expect(options.ssl).toEqual({ ca: 'certificate\nnext-line', rejectUnauthorized: true });
    expect(options.connectionString).not.toContain('sslmode');
    expect(options.connectionString).not.toContain('sslrootcert');
    expect(options.connectionString).toContain('application_name=bakery');
  });
});
