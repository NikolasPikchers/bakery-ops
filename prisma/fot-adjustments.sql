-- Аддитивное обновление существующей БД (до выкладки кода с корректировками ФОТ).
-- Проект исторически использует db push / SQL без начальной истории migrate.
-- Не меняет старые таблицы, сотрудников, ставки и начисления.
BEGIN;

CREATE TABLE IF NOT EXISTS "PayrollDayAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollDayAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollDayAdjustment_employeeId_date_key" ON "PayrollDayAdjustment"("employeeId", "date");
CREATE INDEX IF NOT EXISTS "PayrollDayAdjustment_date_idx" ON "PayrollDayAdjustment"("date");

CREATE TABLE IF NOT EXISTS "PayrollPaymentAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "month" VARCHAR(7) NOT NULL,
  "half" INTEGER NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollPaymentAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PayrollPaymentAdjustment_half_check" CHECK ("half" IN (1, 2))
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPaymentAdjustment_employeeId_month_half_key" ON "PayrollPaymentAdjustment"("employeeId", "month", "half");
CREATE INDEX IF NOT EXISTS "PayrollPaymentAdjustment_month_idx" ON "PayrollPaymentAdjustment"("month");

COMMIT;
