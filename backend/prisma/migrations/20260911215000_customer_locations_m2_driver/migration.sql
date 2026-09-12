-- Customer/location directory, manual MAV2 driver, and geocoded stop fields.
-- Additive only; preserves all existing dispatches and telemetry.

ALTER TABLE "Dispatch"
  ADD COLUMN IF NOT EXISTS "manualDriverName" TEXT;

ALTER TABLE "DispatchStop"
  ADD COLUMN IF NOT EXISTS "customerCode" TEXT,
  ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "CustomerLocation" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "phone" TEXT,
  "city" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerLocation_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerLocation_companyId_code_key"
  ON "CustomerLocation"("companyId", "code");

CREATE INDEX IF NOT EXISTS "CustomerLocation_companyId_customerName_idx"
  ON "CustomerLocation"("companyId", "customerName");

CREATE INDEX IF NOT EXISTS "CustomerLocation_companyId_lastUsedAt_idx"
  ON "CustomerLocation"("companyId", "lastUsedAt");
