-- MAVTRACK: editable current driver equipment.
-- Safe additive migration. No rows or tables are removed.

ALTER TABLE "DriverProfile"
  ADD COLUMN "currentTruckNumber" TEXT,
  ADD COLUMN "currentTrailerNumber" TEXT;

CREATE INDEX "DriverProfile_currentTruckNumber_idx"
  ON "DriverProfile"("currentTruckNumber");
