-- DropForeignKey
ALTER TABLE "TuitionPayment" DROP CONSTRAINT "TuitionPayment_studentId_fkey";

-- DropForeignKey
ALTER TABLE "ReminderLog" DROP CONSTRAINT "ReminderLog_studentId_fkey";

-- DropIndex
DROP INDEX "TuitionPayment_studentId_year_month_key";

-- DropIndex
DROP INDEX "ReminderLog_studentId_year_month_reminderType_key";

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "sheetName" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "stt" INTEGER;

-- AlterTable
ALTER TABLE "TuitionPayment" DROP COLUMN "amount",
DROP COLUMN "dueDate",
DROP COLUMN "month",
DROP COLUMN "year",
ADD COLUMN     "expectedAmount" DECIMAL(12,0) NOT NULL,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "paidAmount" DECIMAL(12,0) NOT NULL DEFAULT 0,
ADD COLUMN     "periodId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ReminderLog" DROP COLUMN "month",
DROP COLUMN "year",
ADD COLUMN     "paymentId" TEXT NOT NULL;

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

-- CreateIndex
CREATE UNIQUE INDEX "TuitionPeriod_classId_year_month_key" ON "TuitionPeriod"("classId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "TuitionPayment_studentId_periodId_key" ON "TuitionPayment"("studentId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_paymentId_reminderType_key" ON "ReminderLog"("paymentId", "reminderType");

-- AddForeignKey
ALTER TABLE "TuitionPeriod" ADD CONSTRAINT "TuitionPeriod_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TuitionPayment" ADD CONSTRAINT "TuitionPayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TuitionPayment" ADD CONSTRAINT "TuitionPayment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "TuitionPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "TuitionPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
