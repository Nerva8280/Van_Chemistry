-- =============================================================================
-- DATABASE.sql
-- Raw SQL migration for "Hệ thống Quản lý Học phí" — mirrors backend/prisma/schema.prisma
-- exactly (models: User, Class, Student, TuitionPayment, ReminderLog), plus the
-- `session` table used by connect-pg-simple for express-session storage.
--
-- Tables are created in dependency order so foreign keys resolve correctly.
-- Safe to run against a fresh PostgreSQL >= 13 database:
--   psql "$DATABASE_URL" -f docs/DATABASE.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Extension needed for gen_random_uuid() (used as default for all id columns,
-- matching Prisma's @default(uuid())). Available via pgcrypto on PG >= 13.
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- User
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "User" (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email        TEXT NOT NULL,
    name         TEXT NOT NULL,
    "avatarUrl"  TEXT,
    provider     TEXT NOT NULL, -- 'google' | 'microsoft'
    "providerId" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_email_key" UNIQUE (email)
);

-- -----------------------------------------------------------------------------
-- Class
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Class" (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name                TEXT NOT NULL,
    "defaultTuitionFee" DECIMAL(12, 0) NOT NULL,
    "userId"            TEXT NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Class_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User" (id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Class_userId_idx" ON "Class" ("userId");

-- -----------------------------------------------------------------------------
-- Student
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Student" (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "fullName"          TEXT NOT NULL,
    "classId"           TEXT NOT NULL,
    "parentEmail"       TEXT,
    "parentPhone"       TEXT,
    "monthlyTuitionFee" DECIMAL(12, 0) NOT NULL,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Student_classId_fkey" FOREIGN KEY ("classId")
        REFERENCES "Class" (id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Student_classId_idx" ON "Student" ("classId");

-- -----------------------------------------------------------------------------
-- TuitionPayment
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "TuitionPayment" (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "studentId" TEXT NOT NULL,
    year        INTEGER NOT NULL,
    month       INTEGER NOT NULL, -- 1-12
    "isPaid"    BOOLEAN NOT NULL DEFAULT FALSE,
    "paidDate"  TIMESTAMP(3),
    amount      DECIMAL(12, 0) NOT NULL,
    "dueDate"   TIMESTAMP(3) NOT NULL, -- e.g. day 5 of that month
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TuitionPayment_studentId_fkey" FOREIGN KEY ("studentId")
        REFERENCES "Student" (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TuitionPayment_month_check" CHECK (month >= 1 AND month <= 12),
    CONSTRAINT "TuitionPayment_studentId_year_month_key" UNIQUE ("studentId", year, month)
);

CREATE INDEX IF NOT EXISTS "TuitionPayment_studentId_idx" ON "TuitionPayment" ("studentId");
CREATE INDEX IF NOT EXISTS "TuitionPayment_year_month_idx" ON "TuitionPayment" (year, month);

-- Keep updatedAt current on every row update (mirrors Prisma's @updatedAt).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "TuitionPayment_set_updated_at" ON "TuitionPayment";
CREATE TRIGGER "TuitionPayment_set_updated_at"
    BEFORE UPDATE ON "TuitionPayment"
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- ReminderLog
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ReminderLog" (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "studentId"    TEXT NOT NULL,
    year           INTEGER NOT NULL,
    month          INTEGER NOT NULL,
    "reminderType" TEXT NOT NULL, -- 'due' | 'overdue7' | 'overdue15'
    "sentAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_studentId_fkey" FOREIGN KEY ("studentId")
        REFERENCES "Student" (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReminderLog_reminderType_check"
        CHECK ("reminderType" IN ('due', 'overdue7', 'overdue15')),
    CONSTRAINT "ReminderLog_studentId_year_month_reminderType_key"
        UNIQUE ("studentId", year, month, "reminderType")
);

CREATE INDEX IF NOT EXISTS "ReminderLog_studentId_idx" ON "ReminderLog" ("studentId");

-- -----------------------------------------------------------------------------
-- session — used by connect-pg-simple (express-session store). Not part of
-- the Prisma schema (managed by connect-pg-simple at runtime via
-- createTableIfMissing), included here so the whole DB can be provisioned
-- from this single script if desired. Schema matches connect-pg-simple's
-- official table-schema.sql.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "session" (
    sid    VARCHAR NOT NULL COLLATE "default",
    sess   JSON    NOT NULL,
    expire TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" (expire);

COMMIT;
