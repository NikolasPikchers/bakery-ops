import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { __prisma?: PrismaClient };

/**
 * Ленивый синглтон (для маршрутов/serverless). Тесты используют DI, не это.
 * В Prisma 7 URL датасорса задаётся через DATABASE_URL (env) или prisma.config.ts —
 * конструктор PrismaClient не принимает datasourceUrl напрямую.
 */
export function getPrisma(): PrismaClient {
  if (!g.__prisma) {
    g.__prisma = new PrismaClient();
  }
  return g.__prisma;
}
