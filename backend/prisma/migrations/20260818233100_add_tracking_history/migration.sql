-- AlterTable
ALTER TABLE "Telemetry"
ADD COLUMN "movementStatus" TEXT,
ADD COLUMN "speedKph" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Telemetry_assetId_recordedAt_idx"
ON "Telemetry"("assetId", "recordedAt");
