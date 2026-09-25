-- Add driver push-notification device registrations.
-- Safe, additive migration: no existing rows are deleted or rewritten.

CREATE TABLE "PushDevice" (
  "id" SERIAL NOT NULL,
  "token" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "userId" INTEGER NOT NULL,
  "lastRegisteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushDevice_token_key"
  ON "PushDevice"("token");

CREATE INDEX "PushDevice_userId_active_idx"
  ON "PushDevice"("userId", "active");

ALTER TABLE "PushDevice"
  ADD CONSTRAINT "PushDevice_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
