-- Per-student period dates for students who joined at a different time than their class.
ALTER TABLE "TuitionPayment" ADD COLUMN "customStartDate" TIMESTAMP(3),
ADD COLUMN "customEndDate" TIMESTAMP(3);
