import type { PrismaClient } from '@prisma/client';

/** Меняется только подпись. ID, смены, ставки и корректировки остаются прежними. */
export function renameEmployee(prisma: PrismaClient, employeeId: string, name: string) {
  return prisma.employee.update({
    where: { id: employeeId, active: true },
    data: { name },
    select: { id: true, name: true },
  });
}
