-- The source-sheet concept is no longer shown anywhere in the app.
ALTER TABLE "Class" DROP COLUMN "sheetName";

UPDATE "TuitionPayment" SET "note" = 'Nhập từ file Excel' WHERE "note" LIKE 'Nhập từ file (sheet %';
