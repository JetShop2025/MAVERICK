-- MAVTRACK: Driver profiles + dispatch assignment workflow
-- Safe additive migration. No existing tables or rows are dropped.

CREATE TYPE "DriverAssignmentStatus" AS ENUM (
  'UNASSIGNED',
  'PENDING',
  'ACCEPTED',
  'DECLINED'
);

CREATE TABLE "DriverProfile" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "phone" TEXT,
  "licenseNumber" TEXT,
  "licenseState" TEXT,
  "profilePhotoUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Dispatch"
  ADD COLUMN "driverId" INTEGER,
  ADD COLUMN "assignmentStatus" "DriverAssignmentStatus" NOT NULL DEFAULT 'UNASSIGNED',
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "declinedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "DriverProfile_userId_key"
  ON "DriverProfile"("userId");

CREATE INDEX "DriverProfile_companyId_idx"
  ON "DriverProfile"("companyId");

CREATE INDEX "DriverProfile_lastName_firstName_idx"
  ON "DriverProfile"("lastName", "firstName");

CREATE INDEX "Dispatch_driverId_assignmentStatus_idx"
  ON "Dispatch"("driverId", "assignmentStatus");

ALTER TABLE "DriverProfile"
  ADD CONSTRAINT "DriverProfile_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "DriverProfile"
  ADD CONSTRAINT "DriverProfile_companyId_fkey"
  FOREIGN KEY ("companyId")
  REFERENCES "Company"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "Dispatch"
  ADD CONSTRAINT "Dispatch_driverId_fkey"
  FOREIGN KEY ("driverId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
