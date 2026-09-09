-- CreateTable
CREATE TABLE "Camera" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'BLACKVUE',
    "model" TEXT,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cloudStatus" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "assetId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Camera_assetId_idx" ON "Camera"("assetId");

-- CreateIndex
CREATE INDEX "Camera_provider_idx" ON "Camera"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "Camera_provider_externalId_key" ON "Camera"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "Camera"
ADD CONSTRAINT "Camera_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
