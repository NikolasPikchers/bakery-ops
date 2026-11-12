import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const ROSTER = [
  { name: 'Катя', group: 'bakery', role: 'baker', brigade: 'A', basePay: 2300, schedOffset: 0 },
  { name: 'Евгения', group: 'bakery', role: 'baker', brigade: 'A', basePay: 2300, schedOffset: 0 },
  { name: 'Наташа', group: 'bakery', role: 'cashier', brigade: 'A', basePay: 2100, schedOffset: 0 },
  { name: 'Алёна', group: 'bakery', role: 'baker', brigade: 'B', basePay: 2300, schedOffset: 0 },
  { name: 'Валентина', group: 'bakery', role: 'baker', brigade: 'B', basePay: 2300, schedOffset: 0 },
  { name: 'Кристина', group: 'bakery', role: 'cashier', brigade: 'B', basePay: 2100, schedOffset: 0 },
  { name: 'Людмила', group: 'bakery', role: 'kitchen', brigade: null, basePay: 1500, schedOffset: 0 },
  { name: 'Лена', group: 'confectionery', role: 'confectioner', brigade: null, basePay: 2500, schedOffset: 0 },
  { name: 'Оксана', group: 'confectionery', role: 'confectioner', brigade: null, basePay: 2500, schedOffset: 1 },
  { name: 'Лариса', group: 'confectionery', role: 'confectioner', brigade: null, basePay: 2500, schedOffset: 2 },
] as const;

// Только первоначальное заполнение: имя редактируется владельцем и больше не ключ сида.
// Повторный запуск не возвращает старые имена и не создаёт дубли после переименования.
const created = await prisma.$transaction(async (tx) => {
  if (await tx.employee.count() > 0) return false;
  await tx.employee.createMany({ data: ROSTER.map((e) => ({ ...e })) });
  return true;
});
if (!created) console.log('Сотрудники уже заведены — первоначальное заполнение пропущено.');
console.log('employees:', await prisma.employee.count());
await prisma.$disconnect();
