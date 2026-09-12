-- Safe additive migration: multi-stop dispatch, load documents, signed acceptance, timeline event labels.

DO $$
BEGIN
  CREATE TYPE "DispatchStopType" AS ENUM ('PICKUP', 'DROP');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DispatchStopStatus" AS ENUM ('PENDING', 'EN_ROUTE', 'ARRIVED', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "DispatchStatusEvent"
  ADD COLUMN IF NOT EXISTS "eventType" TEXT NOT NULL DEFAULT 'STATUS',
  ADD COLUMN IF NOT EXISTS "title" TEXT;

CREATE TABLE IF NOT EXISTS "DispatchStop" (
  "id" SERIAL PRIMARY KEY,
  "dispatchId" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "type" "DispatchStopType" NOT NULL,
  "status" "DispatchStopStatus" NOT NULL DEFAULT 'PENDING',
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "phone" TEXT,
  "reference" TEXT,
  "notes" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "arrivedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DispatchStop_dispatchId_fkey"
    FOREIGN KEY ("dispatchId")
    REFERENCES "Dispatch"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS
  "DispatchStop_dispatchId_sequence_key"
  ON "DispatchStop"("dispatchId", "sequence");

CREATE INDEX IF NOT EXISTS
  "DispatchStop_dispatchId_status_idx"
  ON "DispatchStop"("dispatchId", "status");

CREATE TABLE IF NOT EXISTS "DispatchDocument" (
  "id" SERIAL PRIMARY KEY,
  "dispatchId" INTEGER NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'OTHER',
  "dataBase64" TEXT NOT NULL,
  "uploadedByUserId" INTEGER,
  "uploadedByRole" TEXT NOT NULL,
  "uploadedByName" TEXT,
  "customerVisible" BOOLEAN NOT NULL DEFAULT TRUE,
  "isSignature" BOOLEAN NOT NULL DEFAULT FALSE,
  "signedBy" TEXT,
  "signedAt" TIMESTAMP(3),
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DispatchDocument_dispatchId_fkey"
    FOREIGN KEY ("dispatchId")
    REFERENCES "Dispatch"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS
  "DispatchDocument_dispatchId_createdAt_idx"
  ON "DispatchDocument"("dispatchId", "createdAt");

CREATE INDEX IF NOT EXISTS
  "DispatchDocument_dispatchId_category_idx"
  ON "DispatchDocument"("dispatchId", "category");

-- Backfill stop rows for existing loads that do not yet have stop records.
INSERT INTO "DispatchStop" (
  "dispatchId",
  "sequence",
  "type",
  "status",
  "name",
  "address",
  "phone",
  "reference",
  "scheduledAt",
  "createdAt",
  "updatedAt"
)
SELECT
  d."id",
  1,
  'PICKUP'::"DispatchStopType",
  CASE
    WHEN d."status" IN ('LOADED','IN_TRANSIT','AT_DELIVERY','DELIVERED')
      THEN 'COMPLETED'::"DispatchStopStatus"
    WHEN d."status" = 'AT_PICKUP'
      THEN 'ARRIVED'::"DispatchStopStatus"
    WHEN d."status" = 'EN_ROUTE_TO_PICKUP'
      THEN 'EN_ROUTE'::"DispatchStopStatus"
    ELSE 'PENDING'::"DispatchStopStatus"
  END,
  d."pickupName",
  d."pickupAddress",
  d."pickupPhone",
  d."pickupReference",
  d."pickupScheduledAt",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Dispatch" d
WHERE NOT EXISTS (
  SELECT 1
  FROM "DispatchStop" s
  WHERE s."dispatchId" = d."id"
);

INSERT INTO "DispatchStop" (
  "dispatchId",
  "sequence",
  "type",
  "status",
  "name",
  "address",
  "phone",
  "reference",
  "scheduledAt",
  "createdAt",
  "updatedAt"
)
SELECT
  d."id",
  2,
  'DROP'::"DispatchStopType",
  CASE
    WHEN d."status" = 'DELIVERED'
      THEN 'COMPLETED'::"DispatchStopStatus"
    WHEN d."status" = 'AT_DELIVERY'
      THEN 'ARRIVED'::"DispatchStopStatus"
    WHEN d."status" = 'IN_TRANSIT'
      THEN 'EN_ROUTE'::"DispatchStopStatus"
    ELSE 'PENDING'::"DispatchStopStatus"
  END,
  d."deliveryName",
  d."deliveryAddress",
  d."deliveryPhone",
  d."deliveryReference",
  d."deliveryScheduledAt",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Dispatch" d
WHERE NOT EXISTS (
  SELECT 1
  FROM "DispatchStop" s
  WHERE s."dispatchId" = d."id"
    AND s."sequence" = 2
);
