-- MAVTRACK PHONE GPS v2 tracking-session fields
-- Non-destructive: only adds nullable/defaulted columns.

ALTER TABLE "Asset"
  ADD COLUMN IF NOT EXISTS "trackingActive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "trackingStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trackingStoppedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastPhoneGpsAt" TIMESTAMP(3);
