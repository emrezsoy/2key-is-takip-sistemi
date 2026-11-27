-- AlterTable
ALTER TABLE "DmConfig" ADD COLUMN     "graceNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DmCreditRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "note" TEXT,
    "requestedById" TEXT,
    "requestedByName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmCreditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DmCreditRequest_resolvedAt_idx" ON "DmCreditRequest"("resolvedAt");

-- AddForeignKey
ALTER TABLE "DmCreditRequest" ADD CONSTRAINT "DmCreditRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
