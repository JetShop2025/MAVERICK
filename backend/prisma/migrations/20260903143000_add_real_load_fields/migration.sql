-- MAVTRACK: Add real dispatch/load fields used by rate confirmations
-- Additive only. No existing columns or rows are removed.

ALTER TABLE "Dispatch"
  ADD COLUMN "dispatcherName" TEXT,
  ADD COLUMN "poNumber" TEXT,
  ADD COLUMN "bolNumber" TEXT,
  ADD COLUMN "carrierName" TEXT,
  ADD COLUMN "lessorName" TEXT,
  ADD COLUMN "truckNumber" TEXT,
  ADD COLUMN "trailerNumber" TEXT,
  ADD COLUMN "pickupPhone" TEXT,
  ADD COLUMN "pickupReference" TEXT,
  ADD COLUMN "deliveryPhone" TEXT,
  ADD COLUMN "deliveryReference" TEXT,
  ADD COLUMN "units" DOUBLE PRECISION,
  ADD COLUMN "weightLbs" DOUBLE PRECISION,
  ADD COLUMN "miles" DOUBLE PRECISION,
  ADD COLUMN "carrierPay" DOUBLE PRECISION,
  ADD COLUMN "rateType" TEXT,
  ADD COLUMN "driverInstructions" TEXT,
  ADD COLUMN "termsAndAgreement" TEXT;
