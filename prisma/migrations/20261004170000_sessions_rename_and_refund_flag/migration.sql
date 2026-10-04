ALTER TABLE "Session" RENAME TO "sessions";
ALTER TABLE "sessions" RENAME CONSTRAINT "Session_pkey" TO "sessions_pkey";
ALTER TABLE "sessions" RENAME CONSTRAINT "Session_userId_fkey" TO "sessions_userId_fkey";
ALTER INDEX "Session_tokenHash_key" RENAME TO "sessions_tokenHash_key";
ALTER INDEX "Session_userId_idx" RENAME TO "sessions_userId_idx";
ALTER INDEX "Session_expiresAt_idx" RENAME TO "sessions_expiresAt_idx";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "requiresRefund" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "payments_requiresRefund_idx" ON "payments"("requiresRefund");
