-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "assetType" TEXT NOT NULL DEFAULT 'TRL',
ADD COLUMN     "trackingSource" TEXT NOT NULL DEFAULT 'MAV2';

-- AlterTable
ALTER TABLE "Telemetry" ADD COLUMN     "accuracyMeters" DOUBLE PRECISION,
ADD COLUMN     "headingDegrees" DOUBLE PRECISION,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MAV2',
ALTER COLUMN "temperature" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Asset_companyId_assetType_idx" ON "Asset"("companyId", "assetType");

-- CreateIndex
CREATE INDEX "Telemetry_source_idx" ON "Telemetry"("source");
