-- =====================================================
-- MAVERICK CORE SCHEMA RECONCILIATION
-- Historical migration for shadow database rebuild
-- =====================================================

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key"
ON "Company"("slug");


-- =====================================================
-- ALTER USER
-- =====================================================

ALTER TABLE "User"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "companyId" INTEGER NOT NULL;

ALTER TABLE "User"
ALTER COLUMN "role"
SET DEFAULT 'viewer';

CREATE INDEX "User_companyId_idx"
ON "User"("companyId");


-- =====================================================
-- CREATE ASSET
-- =====================================================

CREATE TABLE "Asset" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    "temperatureMinC" DOUBLE PRECISION,
    "temperatureMaxC" DOUBLE PRECISION,
    "temperatureAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,

    "companyId" INTEGER NOT NULL,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Asset_deviceId_key"
ON "Asset"("deviceId");

CREATE INDEX "Asset_companyId_idx"
ON "Asset"("companyId");


-- =====================================================
-- ALTER TELEMETRY
-- =====================================================

ALTER TABLE "Telemetry"
ADD COLUMN "recordedAt" TIMESTAMP(3),
ADD COLUMN "isBackfill" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "assetId" INTEGER;

CREATE INDEX "Telemetry_deviceId_idx"
ON "Telemetry"("deviceId");

CREATE INDEX "Telemetry_assetId_idx"
ON "Telemetry"("assetId");

CREATE INDEX "Telemetry_receivedAt_idx"
ON "Telemetry"("receivedAt");

CREATE INDEX "Telemetry_recordedAt_idx"
ON "Telemetry"("recordedAt");

CREATE INDEX "Telemetry_isBackfill_idx"
ON "Telemetry"("isBackfill");


-- =====================================================
-- FOREIGN KEYS
-- =====================================================

ALTER TABLE "User"
ADD CONSTRAINT "User_companyId_fkey"
FOREIGN KEY ("companyId")
REFERENCES "Company"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Asset"
ADD CONSTRAINT "Asset_companyId_fkey"
FOREIGN KEY ("companyId")
REFERENCES "Company"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Telemetry"
ADD CONSTRAINT "Telemetry_assetId_fkey"
FOREIGN KEY ("assetId")
REFERENCES "Asset"("id")
ON DELETE NO ACTION
ON UPDATE CASCADE;