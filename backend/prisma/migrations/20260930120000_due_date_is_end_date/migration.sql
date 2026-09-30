-- The due date is now always the period's last day. Keep any due date the teacher set on a
-- period that had no end date, so it stays overdue-tracked.
UPDATE "TuitionPeriod" SET "endDate" = "dueDate" WHERE "endDate" IS NULL AND "dueDate" IS NOT NULL;

ALTER TABLE "TuitionPeriod" DROP COLUMN "dueDate";
