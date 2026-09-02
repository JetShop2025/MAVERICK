ALTER TABLE "Asset"
ADD COLUMN "temperatureAlertEmail" TEXT;

CREATE TABLE "DispatchShare" (
  "id" SERIAL NOT NULL,
  "token" TEXT NOT NULL,
  "customerName" TEXT,
  "customerEmail" TEXT NOT NULL,
  "allowLocation" BOOLEAN NOT NULL DEFAULT true,
  "allowTemperature" BOOLEAN NOT NULL DEFAULT true,
  "allowEta" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "dispatchId" INTEGER NOT NULL,
  CONSTRAINT "DispatchShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DispatchShare_token_key"
ON "DispatchShare"("token");

CREATE INDEX "DispatchShare_dispatchId_idx"
ON "DispatchShare"("dispatchId");

CREATE INDEX "DispatchShare_customerEmail_idx"
ON "DispatchShare"("customerEmail");

CREATE INDEX "DispatchShare_expiresAt_idx"
ON "DispatchShare"("expiresAt");

ALTER TABLE "DispatchShare"
ADD CONSTRAINT "DispatchShare_dispatchId_fkey"
FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationEvent" (
  "id" SERIAL NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'info',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "emailRecipients" TEXT,
  "emailSent" BOOLEAN NOT NULL DEFAULT false,
  "emailedAt" TIMESTAMP(3),
  "companyId" INTEGER NOT NULL,
  "assetId" INTEGER,
  "dispatchId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationEvent_companyId_createdAt_idx"
ON "NotificationEvent"("companyId", "createdAt");

CREATE INDEX "NotificationEvent_assetId_createdAt_idx"
ON "NotificationEvent"("assetId", "createdAt");

CREATE INDEX "NotificationEvent_dispatchId_createdAt_idx"
ON "NotificationEvent"("dispatchId", "createdAt");

ALTER TABLE "NotificationEvent"
ADD CONSTRAINT "NotificationEvent_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationEvent"
ADD CONSTRAINT "NotificationEvent_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationEvent"
ADD CONSTRAINT "NotificationEvent_dispatchId_fkey"
FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
