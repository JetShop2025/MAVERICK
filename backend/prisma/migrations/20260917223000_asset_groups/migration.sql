ALTER TABLE "Asset"
  ADD COLUMN IF NOT EXISTS "groupName" TEXT;

CREATE INDEX IF NOT EXISTS "Asset_companyId_groupName_idx"
  ON "Asset"("companyId", "groupName");
