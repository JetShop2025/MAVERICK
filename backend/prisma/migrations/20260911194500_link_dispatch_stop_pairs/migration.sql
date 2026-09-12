-- Link each pickup to its corresponding drop without deleting existing data.
ALTER TABLE "DispatchStop"
  ADD COLUMN IF NOT EXISTS "pairNumber" INTEGER NOT NULL DEFAULT 1;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "dispatchId", "type"
      ORDER BY "sequence", "id"
    ) AS pair_number
  FROM "DispatchStop"
)
UPDATE "DispatchStop" AS stop
SET "pairNumber" = ranked.pair_number
FROM ranked
WHERE ranked."id" = stop."id";

CREATE INDEX IF NOT EXISTS
  "DispatchStop_dispatchId_pairNumber_idx"
ON "DispatchStop"("dispatchId", "pairNumber");
