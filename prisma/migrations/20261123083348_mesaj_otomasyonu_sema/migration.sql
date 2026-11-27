-- CreateEnum
CREATE TYPE "DmChannel" AS ENUM ('INSTAGRAM', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "DmConversationMode" AS ENUM ('AI', 'HUMAN');

-- CreateEnum
CREATE TYPE "DmClassification" AS ENUM ('UNKNOWN', 'PURCHASED', 'UNDECIDED', 'INFO_DONE', 'PERSONAL', 'SPAM');

-- CreateEnum
CREATE TYPE "DmDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "DmSender" AS ENUM ('CONTACT', 'AI', 'HUMAN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DmDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "DmPromptSource" AS ENUM ('ONBOARDING', 'CLIENT_EDIT', 'ADMIN_EDIT');

-- CreateEnum
CREATE TYPE "DmApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DmKnowledgeSource" AS ENUM ('OWNER_ANSWER', 'ONBOARDING', 'ADMIN');

-- CreateEnum
CREATE TYPE "DmOwnerQuestionStatus" AS ENUM ('PENDING', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DmJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "DmLedgerType" AS ENUM ('PLAN_GRANT', 'PLAN_EXPIRE', 'TOPUP', 'ADJUSTMENT', 'USAGE', 'REFUND');

-- CreateEnum
CREATE TYPE "DmCreditBucket" AS ENUM ('PLAN', 'PERMANENT');

-- CreateEnum
CREATE TYPE "DmAvailabilityKind" AS ENUM ('WEEKLY_OPEN', 'CLOSED_RANGE');

-- CreateEnum
CREATE TYPE "DmAppointmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'REJECTED', 'RESCHEDULE_PROPOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DmAppointmentSource" AS ENUM ('AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "DmStorePlatform" AS ENUM ('SHOPIFY', 'IKAS', 'TICIMAX', 'MANUAL');

-- CreateEnum
CREATE TYPE "DmFollowUpStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'SENT', 'SKIPPED_EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DmOnboardingStatus" AS ENUM ('DRAFT', 'IN_CALL', 'UPLOADS', 'ANALYZING', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'DM_CREDIT_LOW';
ALTER TYPE "NotificationType" ADD VALUE 'DM_CREDIT_EMPTY';
ALTER TYPE "NotificationType" ADD VALUE 'DM_DAILY_MISSED';
ALTER TYPE "NotificationType" ADD VALUE 'DM_RENEWAL_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'DM_FOLLOWUP_APPROVAL';
ALTER TYPE "NotificationType" ADD VALUE 'DM_APPOINTMENT_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'DM_HOT_LEAD';
ALTER TYPE "NotificationType" ADD VALUE 'DM_AI_QUESTION';
ALTER TYPE "NotificationType" ADD VALUE 'DM_APPROVAL_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'DM_HANDOFF';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "dmManaged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dmModuleAppointment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dmModuleMedia" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "dmModuleProducts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dmPaused" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "url" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dmAccess" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DmConfig" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "textModel" TEXT,
    "mediaModel" TEXT,
    "classifyModel" TEXT,
    "setupModel" TEXT,
    "activePromptId" TEXT,
    "businessHours" JSONB,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "holidayMode" BOOLEAN NOT NULL DEFAULT false,
    "holidayMessage" TEXT,
    "holidayUntil" TIMESTAMP(3),
    "waitTextSec" INTEGER NOT NULL DEFAULT 9,
    "waitMediaSec" INTEGER NOT NULL DEFAULT 35,
    "waitMaxSec" INTEGER NOT NULL DEFAULT 60,
    "historyLimit" INTEGER NOT NULL DEFAULT 30,
    "followUpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "followUpSilenceMin" INTEGER NOT NULL DEFAULT 180,
    "followUpNotifyTime" TEXT NOT NULL DEFAULT '09:30',
    "followUpMorningStart" TEXT NOT NULL DEFAULT '10:00',
    "followUpMorningEnd" TEXT NOT NULL DEFAULT '12:00',
    "followUpEveningStart" TEXT NOT NULL DEFAULT '17:00',
    "followUpEveningEnd" TEXT NOT NULL DEFAULT '20:00',
    "quietStart" TEXT NOT NULL DEFAULT '22:00',
    "quietEnd" TEXT NOT NULL DEFAULT '09:00',
    "followUpAutoApprove" BOOLEAN NOT NULL DEFAULT false,
    "appointmentDurationMin" INTEGER NOT NULL DEFAULT 30,
    "appointmentGapMin" INTEGER NOT NULL DEFAULT 0,
    "calendarToken" TEXT,
    "negativeLimit" INTEGER,
    "testSpendsCredit" BOOLEAN NOT NULL DEFAULT false,
    "planBalance" INTEGER NOT NULL DEFAULT 0,
    "permanentBalance" INTEGER NOT NULL DEFAULT 0,
    "balanceUpdatedAt" TIMESTAMP(3),
    "lowAlertLevel" INTEGER,
    "emptyNotifiedAt" TIMESTAMP(3),
    "dailyMissedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "renewalNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmPromptVersion" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" "DmPromptSource" NOT NULL,
    "status" "DmApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmPromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmBusinessInfo" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmBusinessInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmKnowledgeItem" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "source" "DmKnowledgeSource" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmKnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "channel" "DmChannel" NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "username" TEXT,
    "profilePic" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "aiBlocked" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmConversation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" "DmChannel" NOT NULL,
    "mode" "DmConversationMode" NOT NULL DEFAULT 'AI',
    "lastUserMessageAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "pendingSince" TIMESTAMP(3),
    "classification" "DmClassification" NOT NULL DEFAULT 'UNKNOWN',
    "classifiedAt" TIMESTAMP(3),
    "appointmentRequested" BOOLEAN NOT NULL DEFAULT false,
    "hotLead" BOOLEAN NOT NULL DEFAULT false,
    "waitingHuman" BOOLEAN NOT NULL DEFAULT false,
    "missedWhilePaused" BOOLEAN NOT NULL DEFAULT false,
    "handoffReason" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "direction" "DmDirection" NOT NULL,
    "sender" "DmSender" NOT NULL,
    "text" TEXT,
    "media" JSONB,
    "externalId" TEXT,
    "isEcho" BOOLEAN NOT NULL DEFAULT false,
    "referral" JSONB,
    "batchId" TEXT,
    "status" "DmDeliveryStatus" NOT NULL DEFAULT 'SENT',
    "error" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(65,30),
    "creditCost" INTEGER,
    "sentById" TEXT,
    "sentByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmMediaAnalysis" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "model" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmMediaAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmOwnerQuestion" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "status" "DmOwnerQuestionStatus" NOT NULL DEFAULT 'PENDING',
    "answeredByName" TEXT,
    "answeredAt" TIMESTAMP(3),
    "knowledgeItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmOwnerQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DmJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyCredits" INTEGER NOT NULL,
    "priceNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmSubscriptionPeriod" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "monthlyCredits" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "months" INTEGER NOT NULL,
    "paidThrough" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "incomeId" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmSubscriptionPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmCreditLedger" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "DmLedgerType" NOT NULL,
    "bucket" "DmCreditBucket" NOT NULL,
    "amount" INTEGER NOT NULL,
    "messageId" TEXT,
    "conversationId" TEXT,
    "periodId" TEXT,
    "idempotencyKey" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmPricing" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "textCost" INTEGER NOT NULL DEFAULT 1,
    "imageCost" INTEGER NOT NULL DEFAULT 2,
    "videoCost" INTEGER NOT NULL DEFAULT 3,
    "followUpCost" INTEGER NOT NULL DEFAULT 2,
    "cachedMediaCost" INTEGER NOT NULL DEFAULT 1,
    "negativeLimit" INTEGER NOT NULL DEFAULT 2,
    "graceDays" INTEGER NOT NULL DEFAULT 3,
    "renewalNoticeDays" INTEGER NOT NULL DEFAULT 3,
    "lowAlertPercents" INTEGER[] DEFAULT ARRAY[20, 5]::INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmAvailabilityRule" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "DmAvailabilityKind" NOT NULL,
    "weekday" INTEGER,
    "startTime" TEXT,
    "endTime" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmAvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmAppointment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "conversationId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "DmAppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "source" "DmAppointmentSource" NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "service" TEXT,
    "note" TEXT,
    "proposedStartAt" TIMESTAMP(3),
    "proposedEndAt" TIMESTAMP(3),
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmStoreConnection" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" "DmStorePlatform" NOT NULL,
    "name" TEXT,
    "shopDomain" TEXT,
    "credentials" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmStoreConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmProduct" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "connectionId" TEXT,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "url" TEXT,
    "images" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalId" TEXT,
    "sku" TEXT,
    "title" TEXT,
    "options" JSONB,
    "price" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmProductEmbedding" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "vector" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmProductEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmFollowUp" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "reason" TEXT,
    "text" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "windowEndsAt" TIMESTAMP(3) NOT NULL,
    "status" "DmFollowUpStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "messageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmOnboardingSession" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "DmOnboardingStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerName" TEXT,
    "businessName" TEXT,
    "transcript" JSONB,
    "fields" JSONB,
    "durationSec" INTEGER,
    "files" JSONB,
    "analysis" JSONB,
    "promptDraft" TEXT,
    "startedByName" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmOnboardingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmAiUsage" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmAiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DmConfig_clientId_key" ON "DmConfig"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "DmConfig_calendarToken_key" ON "DmConfig"("calendarToken");

-- CreateIndex
CREATE INDEX "DmPromptVersion_clientId_createdAt_idx" ON "DmPromptVersion"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "DmPromptVersion_status_idx" ON "DmPromptVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DmBusinessInfo_clientId_version_key" ON "DmBusinessInfo"("clientId", "version");

-- CreateIndex
CREATE INDEX "DmKnowledgeItem_clientId_isActive_idx" ON "DmKnowledgeItem"("clientId", "isActive");

-- CreateIndex
CREATE INDEX "DmContact_clientId_idx" ON "DmContact"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "DmContact_channel_accountId_externalId_key" ON "DmContact"("channel", "accountId", "externalId");

-- CreateIndex
CREATE INDEX "DmConversation_clientId_lastMessageAt_idx" ON "DmConversation"("clientId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "DmConversation_contactId_key" ON "DmConversation"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "DmMessage_externalId_key" ON "DmMessage"("externalId");

-- CreateIndex
CREATE INDEX "DmMessage_conversationId_createdAt_idx" ON "DmMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "DmMessage_clientId_createdAt_idx" ON "DmMessage"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "DmMessage_batchId_idx" ON "DmMessage"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "DmMediaAnalysis_key_key" ON "DmMediaAnalysis"("key");

-- CreateIndex
CREATE INDEX "DmOwnerQuestion_clientId_status_idx" ON "DmOwnerQuestion"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DmJob_dedupeKey_key" ON "DmJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "DmJob_status_runAt_idx" ON "DmJob"("status", "runAt");

-- CreateIndex
CREATE INDEX "DmSubscriptionPeriod_clientId_paidThrough_idx" ON "DmSubscriptionPeriod"("clientId", "paidThrough");

-- CreateIndex
CREATE UNIQUE INDEX "DmCreditLedger_idempotencyKey_key" ON "DmCreditLedger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DmCreditLedger_clientId_createdAt_idx" ON "DmCreditLedger"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "DmAvailabilityRule_clientId_kind_idx" ON "DmAvailabilityRule"("clientId", "kind");

-- CreateIndex
CREATE INDEX "DmAppointment_clientId_startAt_idx" ON "DmAppointment"("clientId", "startAt");

-- CreateIndex
CREATE INDEX "DmAppointment_status_idx" ON "DmAppointment"("status");

-- CreateIndex
CREATE INDEX "DmProduct_clientId_isActive_idx" ON "DmProduct"("clientId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DmProduct_connectionId_externalId_key" ON "DmProduct"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "DmProductVariant_productId_idx" ON "DmProductVariant"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DmProductEmbedding_productId_imageUrl_model_key" ON "DmProductEmbedding"("productId", "imageUrl", "model");

-- CreateIndex
CREATE INDEX "DmFollowUp_clientId_status_idx" ON "DmFollowUp"("clientId", "status");

-- CreateIndex
CREATE INDEX "DmFollowUp_status_scheduledAt_idx" ON "DmFollowUp"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "DmOnboardingSession_clientId_idx" ON "DmOnboardingSession"("clientId");

-- CreateIndex
CREATE INDEX "DmAiUsage_clientId_createdAt_idx" ON "DmAiUsage"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialAccount_igId_idx" ON "SocialAccount"("igId");

-- AddForeignKey
ALTER TABLE "DmConfig" ADD CONSTRAINT "DmConfig_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmPromptVersion" ADD CONSTRAINT "DmPromptVersion_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmBusinessInfo" ADD CONSTRAINT "DmBusinessInfo_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmKnowledgeItem" ADD CONSTRAINT "DmKnowledgeItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmContact" ADD CONSTRAINT "DmContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmConversation" ADD CONSTRAINT "DmConversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmConversation" ADD CONSTRAINT "DmConversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "DmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmMessage" ADD CONSTRAINT "DmMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DmConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmMessage" ADD CONSTRAINT "DmMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmOwnerQuestion" ADD CONSTRAINT "DmOwnerQuestion_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmOwnerQuestion" ADD CONSTRAINT "DmOwnerQuestion_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DmConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmSubscriptionPeriod" ADD CONSTRAINT "DmSubscriptionPeriod_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmSubscriptionPeriod" ADD CONSTRAINT "DmSubscriptionPeriod_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DmPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmCreditLedger" ADD CONSTRAINT "DmCreditLedger_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmAvailabilityRule" ADD CONSTRAINT "DmAvailabilityRule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmAppointment" ADD CONSTRAINT "DmAppointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmAppointment" ADD CONSTRAINT "DmAppointment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "DmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmAppointment" ADD CONSTRAINT "DmAppointment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DmConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmStoreConnection" ADD CONSTRAINT "DmStoreConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmProduct" ADD CONSTRAINT "DmProduct_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmProduct" ADD CONSTRAINT "DmProduct_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "DmStoreConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmProductVariant" ADD CONSTRAINT "DmProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "DmProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmProductEmbedding" ADD CONSTRAINT "DmProductEmbedding_productId_fkey" FOREIGN KEY ("productId") REFERENCES "DmProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmFollowUp" ADD CONSTRAINT "DmFollowUp_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmFollowUp" ADD CONSTRAINT "DmFollowUp_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DmConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmOnboardingSession" ADD CONSTRAINT "DmOnboardingSession_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmAiUsage" ADD CONSTRAINT "DmAiUsage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
