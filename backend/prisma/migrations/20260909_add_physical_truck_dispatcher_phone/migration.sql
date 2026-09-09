-- Safe additive migration for MAVAPP/MAVTRACK dispatch improvements
ALTER TABLE "DriverProfile"
  ADD COLUMN "physicalTruckNumber" TEXT;

ALTER TABLE "Dispatch"
  ADD COLUMN "dispatcherPhone" TEXT;
