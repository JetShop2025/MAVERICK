CREATE TABLE "DispatchSignatureRequest" (
  "id" SERIAL NOT NULL,
  "dispatchId" INTEGER NOT NULL,
  "token" TEXT NOT NULL,
  "signerEmail" TEXT NOT NULL,
  "signerName" TEXT,
  "signerTitle" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3),
  "viewedAt" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3),
  "changesRequestedAt" TIMESTAMP(3),
  "changesNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DispatchSignatureRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DispatchSignatureRequest_token_key" ON "DispatchSignatureRequest"("token");
CREATE INDEX "DispatchSignatureRequest_dispatchId_createdAt_idx" ON "DispatchSignatureRequest"("dispatchId", "createdAt");
CREATE INDEX "DispatchSignatureRequest_signerEmail_idx" ON "DispatchSignatureRequest"("signerEmail");
CREATE INDEX "DispatchSignatureRequest_status_idx" ON "DispatchSignatureRequest"("status");

ALTER TABLE "DispatchSignatureRequest"
ADD CONSTRAINT "DispatchSignatureRequest_dispatchId_fkey"
FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
