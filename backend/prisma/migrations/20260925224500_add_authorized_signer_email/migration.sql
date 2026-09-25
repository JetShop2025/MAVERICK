-- Add the authorized signer email to remembered customer/location records
-- and snapshot the selected signer email on each dispatch.
ALTER TABLE "CustomerLocation"
ADD COLUMN "authorizedSignerEmail" TEXT;

ALTER TABLE "Dispatch"
ADD COLUMN "authorizedSignerEmail" TEXT;
