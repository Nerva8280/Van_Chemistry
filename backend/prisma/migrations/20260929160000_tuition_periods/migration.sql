-- Moves from fixed (year, month) payment rows to per-class TuitionPeriod rows, preserving existing data:
-- each existing (class, year, month) becomes a "Tháng N" period, amount -> expectedAmount,
-- and a paid row keeps paidAmount = amount.

-- DropForeignKey
ALTER TABLE "TuitionPayment" DROP CONSTRAINT "TuitionPayment_studentId_fkey";
ALTER TABLE "ReminderLog" DROP CONSTRAINT "ReminderLog_studentId_fkey";

-- DropIndex
DROP INDEX "TuitionPayment_studentId_year_month_key";
DROP INDEX "ReminderLog_studentId_year_month_reminderType_key";

-- AlterTable
ALTER TABLE "Class" ADD COLUMN "sheetName" TEXT;
ALTER TABLE "Student" ADD COLUMN "stt" INTEGER;

-- CreateTable
CREATE TABLE "TuitionPeriod" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TuitionPeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TuitionPeriod_classId_year_month_key" ON "TuitionPeriod"("classId", "year", "month");

-- Data: one period per (class, year, month) that already has payment rows.
INSERT INTO "TuitionPeriod" ("id", "classId", "name", "year", "month", "startDate", "endDate", "dueDate")
SELECT gen_random_uuid()::text,
       s."classId",
       'Tháng ' || tp."month",
       tp."year",
       tp."month",
       make_date(tp."year", tp."month", 1)::timestamp,
       (make_date(tp."year", tp."month", 1) + interval '1 month' - interval '1 day')::timestamp,
       min(tp."dueDate")
FROM "TuitionPayment" tp
JOIN "Student" s ON s."id" = tp."studentId"
GROUP BY s."classId", tp."year", tp."month";

-- TuitionPayment: add new columns, backfill, then tighten.
ALTER TABLE "TuitionPayment"
    ADD COLUMN "periodId" TEXT,
    ADD COLUMN "expectedAmount" DECIMAL(12,0),
    ADD COLUMN "paidAmount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    ADD COLUMN "note" TEXT;

UPDATE "TuitionPayment" tp
SET "periodId" = p."id",
    "expectedAmount" = tp."amount",
    "paidAmount" = CASE WHEN tp."isPaid" THEN tp."amount" ELSE 0 END
FROM "Student" s, "TuitionPeriod" p
WHERE s."id" = tp."studentId"
  AND p."classId" = s."classId"
  AND p."year" = tp."year"
  AND p."month" = tp."month";

ALTER TABLE "TuitionPayment"
    ALTER COLUMN "periodId" SET NOT NULL,
    ALTER COLUMN "expectedAmount" SET NOT NULL;

-- ReminderLog: point at the payment instead of (year, month).
ALTER TABLE "ReminderLog" ADD COLUMN "paymentId" TEXT;

UPDATE "ReminderLog" r
SET "paymentId" = tp."id"
FROM "TuitionPayment" tp
WHERE tp."studentId" = r."studentId" AND tp."year" = r."year" AND tp."month" = r."month";

DELETE FROM "ReminderLog" WHERE "paymentId" IS NULL;

ALTER TABLE "ReminderLog" ALTER COLUMN "paymentId" SET NOT NULL;

-- Drop the old columns.
ALTER TABLE "TuitionPayment" DROP COLUMN "amount",
DROP COLUMN "dueDate",
DROP COLUMN "month",
DROP COLUMN "year";

ALTER TABLE "ReminderLog" DROP COLUMN "month",
DROP COLUMN "year";

-- CreateIndex
CREATE UNIQUE INDEX "TuitionPayment_studentId_periodId_key" ON "TuitionPayment"("studentId", "periodId");
CREATE UNIQUE INDEX "ReminderLog_paymentId_reminderType_key" ON "ReminderLog"("paymentId", "reminderType");

-- AddForeignKey
ALTER TABLE "TuitionPeriod" ADD CONSTRAINT "TuitionPeriod_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TuitionPayment" ADD CONSTRAINT "TuitionPayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TuitionPayment" ADD CONSTRAINT "TuitionPayment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "TuitionPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "TuitionPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
