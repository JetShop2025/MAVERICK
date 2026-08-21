-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM (
  'ASSIGNED',
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'LOADED',
  'IN_TRANSIT',
  'AT_DELIVERY',
  'DELIVERED',
  'CANCELLED'
);

-- CreateTable
CREATE TABLE "Dispatch" (
  "id" SERIAL NOT NULL,
  "loadNumber" TEXT NOT NULL,
  "status" "DispatchStatus" NOT NULL DEFAULT 'ASSIGNED',
  "companyId" INTEGER NOT NULL,
  "assetId" INTEGER,
  "pickupName" TEXT NOT NULL,
  "pickupAddress" TEXT NOT NULL,
  "pickupLatitude" DOUBLE PRECISION,
  "pickupLongitude" DOUBLE PRECISION,
  "pickupScheduledAt" TIMESTAMP(3),
  "deliveryName" TEXT NOT NULL,
  "deliveryAddress" TEXT NOT NULL,
  "deliveryLatitude" DOUBLE PRECISION,
  "deliveryLongitude" DOUBLE PRECISION,
  "deliveryScheduledAt" TIMESTAMP(3),
  "commodity" TEXT,
  "referenceNumber" TEXT,
  "temperatureSetpointC" DOUBLE PRECISION,
  "temperatureMinC" DOUBLE PRECISION,
  "temperatureMaxC" DOUBLE PRECISION,
  "notes" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Dispatch_pkey"
  PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchStatusEvent" (
  "id" SERIAL NOT NULL,
  "status" "DispatchStatus" NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dispatchId" INTEGER NOT NULL,

  CONSTRAINT "DispatchStatusEvent_pkey"
  PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX
"Dispatch_companyId_loadNumber_key"
ON "Dispatch"("companyId", "loadNumber");

CREATE INDEX
"Dispatch_companyId_status_idx"
ON "Dispatch"("companyId", "status");

CREATE INDEX
"Dispatch_assetId_status_idx"
ON "Dispatch"("assetId", "status");

CREATE INDEX
"Dispatch_pickupScheduledAt_idx"
ON "Dispatch"("pickupScheduledAt");

CREATE INDEX
"Dispatch_deliveryScheduledAt_idx"
ON "Dispatch"("deliveryScheduledAt");

CREATE INDEX
"DispatchStatusEvent_dispatchId_createdAt_idx"
ON "DispatchStatusEvent"("dispatchId", "createdAt");

-- Foreign Keys
ALTER TABLE "Dispatch"
ADD CONSTRAINT "Dispatch_companyId_fkey"
FOREIGN KEY ("companyId")
REFERENCES "Company"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Dispatch"
ADD CONSTRAINT "Dispatch_assetId_fkey"
FOREIGN KEY ("assetId")
REFERENCES "Asset"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "DispatchStatusEvent"
ADD CONSTRAINT "DispatchStatusEvent_dispatchId_fkey"
FOREIGN KEY ("dispatchId")
REFERENCES "Dispatch"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
