import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { databaseOptions, describeDatabaseConfig } from './connection-options';

const timewebCa = readFileSync(join(__dirname, 'fixtures/timeweb-managed-ca.crt'), 'utf8');

describe('describeDatabaseConfig — диагностика для логов деплоя, без секретов', () => {
  it('показывает хост, порт и базу, но не пользователя и пароль', () => {
    const text = describeDatabaseConfig({ DATABASE_URL: 'postgresql://bakery_app:n%2C%23%40secret@db.twc1.net:5432/default_db' });
    expect(text).toContain('db.twc1.net:5432/default_db');
    expect(text).not.toContain('bakery_app');
    expect(text).not.toContain('secret');
  });

  it('сертификат одной строкой с \\n — валиден, видно CN и срок', () => {
    const text = describeDatabaseConfig({ DATABASE_URL: 'postgresql://u:p@db:5432/app', DATABASE_CA_CERT: timewebCa.trim().replace(/\n/g, '\\n') });
    expect(text).toMatch(/CA: ok, CN=managed-service\.timeweb\.cloud, до 2040-05-16/);
  });

  it('сертификат с настоящими переводами строк — тоже валиден', () => {
    expect(describeDatabaseConfig({ DATABASE_URL: 'postgresql://u:p@db:5432/app', DATABASE_CA_CERT: timewebCa })).toMatch(/CA: ok/);
  });

  it('испорченный сертификат (например, двойное экранирование) — «CA: не разбирается»', () => {
    const doubled = timewebCa.trim().replace(/\n/g, '\\\\n');
    expect(describeDatabaseConfig({ DATABASE_URL: 'postgresql://u:p@db:5432/app', DATABASE_CA_CERT: doubled })).toMatch(/CA: не разбирается/);
  });

  it('нет адреса базы или он не URL — так и пишет', () => {
    expect(describeDatabaseConfig({})).toMatch(/DATABASE_URL: нет/);
    expect(describeDatabaseConfig({ DATABASE_URL: 'not a url with p@ss' })).toMatch(/DATABASE_URL: не URL/);
    expect(describeDatabaseConfig({ DATABASE_URL: 'not a url with p@ss' })).not.toContain('p@ss');
  });

  it('без DATABASE_CA_CERT — «CA: нет»', () => {
    expect(describeDatabaseConfig({ DATABASE_URL: 'postgresql://u:p@db:5432/app' })).toMatch(/CA: нет/);
  });
});

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
