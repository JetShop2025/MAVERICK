ALTER TABLE "Asset"
ADD COLUMN "mav2FirmwareVersion" TEXT,
ADD COLUMN "mav2LastCheckInAt" TIMESTAMP(3);

CREATE TABLE "Mav2Firmware" (
  "id" SERIAL NOT NULL,
  "version" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "sketchSource" TEXT NOT NULL,
  "binary" BYTEA,
  "binarySha256" TEXT,
  "binarySize" INTEGER,
  "compileStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "compileLog" TEXT,
  "createdByEmail" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Mav2Firmware_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Mav2Command" (
  "id" SERIAL NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "payload" JSONB,
  "requestedByEmail" TEXT NOT NULL,
  "resultMessage" TEXT,
  "companyId" INTEGER NOT NULL,
  "assetId" INTEGER NOT NULL,
  "firmwareId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "Mav2Command_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Mav2Firmware_companyId_version_key"
ON "Mav2Firmware"("companyId", "version");

CREATE INDEX "Mav2Firmware_companyId_createdAt_idx"
ON "Mav2Firmware"("companyId", "createdAt");

CREATE INDEX "Mav2Command_assetId_status_createdAt_idx"
ON "Mav2Command"("assetId", "status", "createdAt");

CREATE INDEX "Mav2Command_companyId_createdAt_idx"
ON "Mav2Command"("companyId", "createdAt");

ALTER TABLE "Mav2Firmware"
ADD CONSTRAINT "Mav2Firmware_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Mav2Command"
ADD CONSTRAINT "Mav2Command_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Mav2Command"
ADD CONSTRAINT "Mav2Command_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Mav2Command"
ADD CONSTRAINT "Mav2Command_firmwareId_fkey"
FOREIGN KEY ("firmwareId") REFERENCES "Mav2Firmware"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
