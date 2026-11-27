-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'CLIENT');

-- CreateEnum
CREATE TYPE "DurationUnit" AS ENUM ('HOUR', 'DAY');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'PENDING_APPROVAL', 'DONE');

-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('NONE', 'HALF', 'FULL', 'LEAVE');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('DAILY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ClientNotifyMode" AS ENUM ('DAILY', 'WEEKLY', 'LOGIN_POPUP', 'HOURLY', 'NONE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ShareKind" AS ENUM ('POST', 'STORY', 'REEL');

-- CreateEnum
CREATE TYPE "ShareCalendarAccess" AS ENUM ('NONE', 'USE', 'EDIT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_PENDING_APPROVAL', 'TASK_RETURNED', 'TASK_UNASSIGNED', 'CLIENT_REQUEST', 'REQUEST_DECISION', 'PAYMENT_REMINDER', 'TASK_DONE', 'SHARE_REMINDER', 'DELIVERY_READY', 'DELIVERY_APPROVED', 'PROPOSAL_REMINDER', 'REPORT_READY');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('NONE', 'HALF', 'FULL', 'PARTIAL');

-- CreateEnum
CREATE TYPE "RadioStatus" AS ENUM ('QUEUED', 'PLAYING', 'PLAYED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "employmentType" TEXT,
    "paymentType" "PaymentType" NOT NULL DEFAULT 'DAILY',
    "dailyRate" DECIMAL(65,30),
    "monthlyRate" DECIMAL(65,30),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "shareCalendarAccess" "ShareCalendarAccess" NOT NULL DEFAULT 'NONE',
    "proposalAccess" BOOLEAN NOT NULL DEFAULT false,
    "adPanelAccess" BOOLEAN NOT NULL DEFAULT false,
    "adManageAccess" BOOLEAN NOT NULL DEFAULT false,
    "contentAccess" BOOLEAN NOT NULL DEFAULT false,
    "clientOrder" TEXT,
    "clientId" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "portalTourDoneAt" TIMESTAMP(3),
    "avatarUrl" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletionReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "supervisorId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shareColor" TEXT,
    "autoMonthlyReport" BOOLEAN NOT NULL DEFAULT false,
    "autoReportSince" TIMESTAMP(3),
    "paymentDueDay" INTEGER,
    "notifyMode" "ClientNotifyMode" NOT NULL DEFAULT 'LOGIN_POPUP',
    "lastPaymentNotifyAt" TIMESTAMP(3),
    "metaAdsManaged" BOOLEAN NOT NULL DEFAULT false,
    "googleAdsManaged" BOOLEAN NOT NULL DEFAULT false,
    "socialManaged" BOOLEAN NOT NULL DEFAULT true,
    "contentEditable" BOOLEAN NOT NULL DEFAULT false,
    "shareRevisionEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "note" TEXT,
    "urgency" "Urgency" NOT NULL DEFAULT 'MEDIUM',
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL DEFAULT 'REQUEST',
    "sharePostId" TEXT,
    "contentItemId" TEXT,
    "sourceRequestId" TEXT,
    "deliveryStatus" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "deliveredByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByName" TEXT,

    CONSTRAINT "ClientRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryFile" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT,
    "requestId" TEXT,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'IMAGE',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DeliveryFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRequestFile" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClientRequestFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItemFile" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContentItemFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "note" TEXT,
    "contentType" TEXT,
    "taskId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deliveryStatus" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "deliveredByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByName" TEXT,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDoc" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharePost" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT,
    "kind" "ShareKind" NOT NULL DEFAULT 'POST',
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "metaScheduled" BOOLEAN NOT NULL DEFAULT false,
    "metaStatus" TEXT,
    "metaError" TEXT,
    "metaScheduledAt" TIMESTAMP(3),
    "metaScheduledById" TEXT,
    "metaPublishedAt" TIMESTAMP(3),
    "igMediaId" TEXT,
    "igPermalink" TEXT,
    "fbPostId" TEXT,
    "coverUrl" TEXT,
    "coverName" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "clientId" TEXT,
    "clientName" TEXT NOT NULL,
    "title" TEXT,
    "text" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharePostImage" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "position" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'IMAGE',

    CONSTRAINT "SharePostImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCredential" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "username" TEXT,
    "encryptedPassword" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "clientId" TEXT,
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,
    "durationValue" INTEGER,
    "durationUnit" "DurationUnit",
    "difficulty" INTEGER,
    "urgency" "Urgency" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "calculatedDeadline" TIMESTAMP(3),
    "revisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskRevisionFile" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "TaskRevisionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSubmission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloadedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TaskSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dayType" "DayType" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "clientId" TEXT,
    "clientName" TEXT NOT NULL,
    "service" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "invoiced" BOOLEAN NOT NULL DEFAULT false,
    "vatOverride" DECIMAL(65,30),
    "collection" "CollectionStatus" NOT NULL DEFAULT 'NONE',
    "collectedAmount" DECIMAL(65,30),
    "note" TEXT,
    "seriesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeSeries" (
    "id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedExpense" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "fromYear" INTEGER NOT NULL,
    "fromMonth" INTEGER NOT NULL,
    "endYear" INTEGER,
    "endMonth" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedExpenseSkip" (
    "id" TEXT NOT NULL,
    "fixedExpenseId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,

    CONSTRAINT "FixedExpenseSkip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSkip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,

    CONSTRAINT "PayrollSkip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL,
    "metaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" INTEGER,
    "currency" TEXT,
    "timezone" TEXT,
    "clientId" TEXT,
    "canManage" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "metaId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "effectiveStatus" TEXT NOT NULL,
    "objective" TEXT,
    "dailyBudget" DECIMAL(65,30),
    "startTime" TIMESTAMP(3),
    "stopTime" TIMESTAMP(3),
    "createdTime" TIMESTAMP(3),

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdInsightDaily" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignMetaId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "spend" DECIMAL(65,30) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "linkClicks" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdInsightDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleAdAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT,
    "timezone" TEXT,
    "status" TEXT,
    "clientId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleAdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleAdCampaign" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "channelType" TEXT,
    "dailyBudget" DECIMAL(65,30),

    CONSTRAINT "GoogleAdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleAdInsightDaily" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "cost" DECIMAL(65,30) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "GoogleAdInsightDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "clientId" TEXT,
    "kind" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveFolder" (
    "key" TEXT NOT NULL,
    "driveId" TEXT NOT NULL,

    CONSTRAINT "DriveFolder_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companySize" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PROPOSAL',
    "fromReport" BOOLEAN NOT NULL DEFAULT false,
    "services" TEXT NOT NULL DEFAULT '[]',
    "customService" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "date" TEXT NOT NULL,
    "lastSentDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultNote" TEXT,
    "resultAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalFile" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "igId" TEXT,
    "igUsername" TEXT,
    "clientId" TEXT,
    "visibleToClient" BOOLEAN NOT NULL DEFAULT false,
    "canPublish" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialDaily" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "igFollowers" INTEGER,
    "fbFollowers" INTEGER,
    "followerDelta" INTEGER,
    "reach" INTEGER,
    "profileViews" INTEGER,
    "accountsEngaged" INTEGER,
    "totalInteractions" INTEGER,
    "views" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialMedia" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "igMediaId" TEXT NOT NULL,
    "caption" TEXT,
    "mediaType" TEXT NOT NULL,
    "product" TEXT,
    "permalink" TEXT,
    "thumbnailUrl" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER,
    "views" INTEGER,
    "saved" INTEGER,
    "shares" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientReport" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ClientReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskRevision" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ADMIN',
    "note" TEXT NOT NULL,
    "byId" TEXT,
    "byName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadioTrack" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channel" TEXT,
    "addedById" TEXT NOT NULL,
    "addedByName" TEXT NOT NULL,
    "status" "RadioStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadioTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadioSkipVote" (
    "trackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadioSkipVote_pkey" PRIMARY KEY ("trackId","userId")
);

-- CreateTable
CREATE TABLE "_ClientLeads" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ClientLeads_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_supervisorId_idx" ON "User"("supervisorId");

-- CreateIndex
CREATE INDEX "User_clientId_idx" ON "User"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientRequest_taskId_key" ON "ClientRequest"("taskId");

-- CreateIndex
CREATE INDEX "ClientRequest_clientId_idx" ON "ClientRequest"("clientId");

-- CreateIndex
CREATE INDEX "ClientRequest_status_idx" ON "ClientRequest"("status");

-- CreateIndex
CREATE INDEX "DeliveryFile_contentItemId_idx" ON "DeliveryFile"("contentItemId");

-- CreateIndex
CREATE INDEX "DeliveryFile_requestId_idx" ON "DeliveryFile"("requestId");

-- CreateIndex
CREATE INDEX "ClientRequestFile_requestId_idx" ON "ClientRequestFile"("requestId");

-- CreateIndex
CREATE INDEX "ContentItemFile_itemId_idx" ON "ContentItemFile"("itemId");

-- CreateIndex
CREATE INDEX "ContentItem_clientId_year_month_idx" ON "ContentItem"("clientId", "year", "month");

-- CreateIndex
CREATE INDEX "ContentDoc_clientId_year_month_idx" ON "ContentDoc"("clientId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "SharePost_date_idx" ON "SharePost"("date");

-- CreateIndex
CREATE INDEX "SharePostImage_postId_idx" ON "SharePostImage"("postId");

-- CreateIndex
CREATE INDEX "ClientCredential_clientId_idx" ON "ClientCredential"("clientId");

-- CreateIndex
CREATE INDEX "Task_assignedToId_idx" ON "Task"("assignedToId");

-- CreateIndex
CREATE INDEX "Task_clientId_idx" ON "Task"("clientId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "TaskRevisionFile_taskId_idx" ON "TaskRevisionFile"("taskId");

-- CreateIndex
CREATE INDEX "TaskAttachment_taskId_idx" ON "TaskAttachment"("taskId");

-- CreateIndex
CREATE INDEX "TaskSubmission_taskId_idx" ON "TaskSubmission"("taskId");

-- CreateIndex
CREATE INDEX "Attendance_userId_idx" ON "Attendance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_userId_date_key" ON "Attendance"("userId", "date");

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Income_year_month_idx" ON "Income"("year", "month");

-- CreateIndex
CREATE INDEX "Income_seriesId_idx" ON "Income"("seriesId");

-- CreateIndex
CREATE INDEX "Expense_year_month_idx" ON "Expense"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "FixedExpenseSkip_fixedExpenseId_year_month_key" ON "FixedExpenseSkip"("fixedExpenseId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollSkip_userId_year_month_key" ON "PayrollSkip"("userId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_metaId_key" ON "AdAccount"("metaId");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaign_metaId_key" ON "AdCampaign"("metaId");

-- CreateIndex
CREATE INDEX "AdCampaign_adAccountId_idx" ON "AdCampaign"("adAccountId");

-- CreateIndex
CREATE INDEX "AdInsightDaily_date_idx" ON "AdInsightDaily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AdInsightDaily_adAccountId_campaignMetaId_date_key" ON "AdInsightDaily"("adAccountId", "campaignMetaId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAdAccount_customerId_key" ON "GoogleAdAccount"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAdCampaign_campaignId_key" ON "GoogleAdCampaign"("campaignId");

-- CreateIndex
CREATE INDEX "GoogleAdCampaign_adAccountId_idx" ON "GoogleAdCampaign"("adAccountId");

-- CreateIndex
CREATE INDEX "GoogleAdInsightDaily_date_idx" ON "GoogleAdInsightDaily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAdInsightDaily_adAccountId_campaignId_date_key" ON "GoogleAdInsightDaily"("adAccountId", "campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_driveFileId_key" ON "StoredFile"("driveFileId");

-- CreateIndex
CREATE INDEX "StoredFile_clientId_idx" ON "StoredFile"("clientId");

-- CreateIndex
CREATE INDEX "Proposal_date_idx" ON "Proposal"("date");

-- CreateIndex
CREATE INDEX "Proposal_status_idx" ON "Proposal"("status");

-- CreateIndex
CREATE INDEX "ProposalFile_proposalId_idx" ON "ProposalFile"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_pageId_key" ON "SocialAccount"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialDaily_accountId_date_key" ON "SocialDaily"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SocialMedia_igMediaId_key" ON "SocialMedia"("igMediaId");

-- CreateIndex
CREATE INDEX "SocialMedia_accountId_postedAt_idx" ON "SocialMedia"("accountId", "postedAt");

-- CreateIndex
CREATE INDEX "ClientReport_clientId_year_month_idx" ON "ClientReport"("clientId", "year", "month");

-- CreateIndex
CREATE INDEX "TaskRevision_taskId_idx" ON "TaskRevision"("taskId");

-- CreateIndex
CREATE INDEX "TaskRevision_createdAt_idx" ON "TaskRevision"("createdAt");

-- CreateIndex
CREATE INDEX "RadioTrack_status_createdAt_idx" ON "RadioTrack"("status", "createdAt");

-- CreateIndex
CREATE INDEX "_ClientLeads_B_index" ON "_ClientLeads"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryFile" ADD CONSTRAINT "DeliveryFile_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryFile" ADD CONSTRAINT "DeliveryFile_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ClientRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequestFile" ADD CONSTRAINT "ClientRequestFile_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ClientRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItemFile" ADD CONSTRAINT "ContentItemFile_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDoc" ADD CONSTRAINT "ContentDoc_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharePost" ADD CONSTRAINT "SharePost_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharePostImage" ADD CONSTRAINT "SharePostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SharePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCredential" ADD CONSTRAINT "ClientCredential_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRevisionFile" ADD CONSTRAINT "TaskRevisionFile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSubmission" ADD CONSTRAINT "TaskSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "IncomeSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpenseSkip" ADD CONSTRAINT "FixedExpenseSkip_fixedExpenseId_fkey" FOREIGN KEY ("fixedExpenseId") REFERENCES "FixedExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdInsightDaily" ADD CONSTRAINT "AdInsightDaily_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleAdAccount" ADD CONSTRAINT "GoogleAdAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleAdCampaign" ADD CONSTRAINT "GoogleAdCampaign_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "GoogleAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleAdInsightDaily" ADD CONSTRAINT "GoogleAdInsightDaily_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "GoogleAdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalFile" ADD CONSTRAINT "ProposalFile_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialDaily" ADD CONSTRAINT "SocialDaily_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialMedia" ADD CONSTRAINT "SocialMedia_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientReport" ADD CONSTRAINT "ClientReport_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRevision" ADD CONSTRAINT "TaskRevision_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadioSkipVote" ADD CONSTRAINT "RadioSkipVote_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "RadioTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientLeads" ADD CONSTRAINT "_ClientLeads_A_fkey" FOREIGN KEY ("A") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientLeads" ADD CONSTRAINT "_ClientLeads_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

