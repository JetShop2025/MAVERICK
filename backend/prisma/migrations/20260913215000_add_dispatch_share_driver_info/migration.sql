-- Add a per-shared-link privacy switch for driver information.
-- Existing links keep their current behavior by defaulting to true.
ALTER TABLE "DispatchShare"
ADD COLUMN IF NOT EXISTS "allowDriverInfo" BOOLEAN NOT NULL DEFAULT true;
