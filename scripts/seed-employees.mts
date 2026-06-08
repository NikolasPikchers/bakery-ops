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

for (const e of ROSTER) {
  await prisma.employee.upsert({
    where: { name_group: { name: e.name, group: e.group } },
    create: { name: e.name, group: e.group, role: e.role, brigade: e.brigade, basePay: e.basePay, schedOffset: e.schedOffset },
    update: { role: e.role, brigade: e.brigade, basePay: e.basePay, schedOffset: e.schedOffset, active: true },
  });
}
console.log('employees:', await prisma.employee.count());
await prisma.$disconnect();
