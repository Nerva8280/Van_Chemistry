ALTER TABLE "Student"
    ADD COLUMN "parentContactName" TEXT,
    ADD COLUMN "parentFacebook" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "parentZalo" BOOLEAN NOT NULL DEFAULT false;
