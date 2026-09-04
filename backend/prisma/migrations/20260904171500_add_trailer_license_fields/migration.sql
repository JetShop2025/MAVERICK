-- MAVTRACK: free-form trailer information for TRK drivers.
-- Safe additive migration: no existing data is removed.

ALTER TABLE "DriverProfile"
  ADD COLUMN "currentTrailerLicense" TEXT;

ALTER TABLE "Dispatch"
  ADD COLUMN "trailerLicense" TEXT;
