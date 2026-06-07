import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const g = globalThis as unknown as { __prisma?: PrismaClient };

/**
 * Ленивый синглтон (для маршрутов/serverless). Тесты используют DI, не это.
 * Prisma 7 требует driver adapter: URL подаётся в PrismaPg (из DATABASE_URL),
 * а не в конструктор PrismaClient. Используем пулинговый DATABASE_URL (serverless).
 */
export function getPrisma(): PrismaClient {
  if (!g.__prisma) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    g.__prisma = new PrismaClient({ adapter });
  }
  return g.__prisma;
}
