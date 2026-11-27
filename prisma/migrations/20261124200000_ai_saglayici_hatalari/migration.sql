-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DM_AI_PROVIDER_ERROR';

-- CreateTable
CREATE TABLE "DmAiFailure" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DmAiFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DmAiFailure_provider_createdAt_idx" ON "DmAiFailure"("provider", "createdAt");
CREATE INDEX "DmAiFailure_createdAt_idx" ON "DmAiFailure"("createdAt");

-- AI kullanım raporu için tarih indeksi
CREATE INDEX "DmAiUsage_createdAt_idx" ON "DmAiUsage"("createdAt");
