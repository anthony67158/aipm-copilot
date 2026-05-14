-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "phone" TEXT,
    "nickname" TEXT,
    "avatarUrl" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'anonymous',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AnalysisSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "status" TEXT NOT NULL,
    "resumeText" TEXT NOT NULL,
    "resumeFileUrl" TEXT,
    "jobDescriptionText" TEXT NOT NULL,
    "jobTitle" TEXT,
    "jobCategory" TEXT,
    "applicationType" TEXT,
    "focusModules" JSONB NOT NULL,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnalysisSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiagnosisResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "matchedKeywords" JSONB NOT NULL,
    "missingKeywords" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "modelVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiagnosisResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AnalysisSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OptimizationResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "beforeScore" INTEGER,
    "afterScore" INTEGER,
    "rewriteMode" TEXT NOT NULL DEFAULT 'balanced',
    "selectedModules" JSONB NOT NULL,
    "optimizedSections" JSONB NOT NULL,
    "fullOptimizedResumeText" TEXT NOT NULL,
    "modelVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OptimizationResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AnalysisSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResumeVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "jobTitle" TEXT,
    "jobCategory" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'optimized',
    "resumeText" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ResumeVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ResumeVersion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AnalysisSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fileUrl" TEXT,
    "failureReason" TEXT,
    "expiredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "productCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "amountTotal" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentOrder_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AnalysisSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "channelTradeNo" TEXT,
    "eventType" TEXT NOT NULL,
    "eventStatus" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PaymentOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntitlementLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "entitlementCode" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntitlementLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "AnalysisSession_userId_createdAt_idx" ON "AnalysisSession"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AnalysisSession_status_createdAt_idx" ON "AnalysisSession"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AnalysisSession_jobCategory_idx" ON "AnalysisSession"("jobCategory");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosisResult_sessionId_key" ON "DiagnosisResult"("sessionId");

-- CreateIndex
CREATE INDEX "DiagnosisResult_matchScore_idx" ON "DiagnosisResult"("matchScore");

-- CreateIndex
CREATE UNIQUE INDEX "OptimizationResult_sessionId_key" ON "OptimizationResult"("sessionId");

-- CreateIndex
CREATE INDEX "OptimizationResult_afterScore_idx" ON "OptimizationResult"("afterScore");

-- CreateIndex
CREATE INDEX "ResumeVersion_userId_createdAt_idx" ON "ResumeVersion"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ResumeVersion_sessionId_idx" ON "ResumeVersion"("sessionId");

-- CreateIndex
CREATE INDEX "ResumeVersion_isArchived_idx" ON "ResumeVersion"("isArchived");

-- CreateIndex
CREATE INDEX "ExportJob_userId_createdAt_idx" ON "ExportJob"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ExportJob_sourceType_sourceId_idx" ON "ExportJob"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ExportJob_status_createdAt_idx" ON "ExportJob"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PaymentOrder_userId_createdAt_idx" ON "PaymentOrder"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PaymentOrder_status_createdAt_idx" ON "PaymentOrder"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PaymentOrder_sessionId_idx" ON "PaymentOrder"("sessionId");

-- CreateIndex
CREATE INDEX "PaymentRecord_orderId_createdAt_idx" ON "PaymentRecord"("orderId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PaymentRecord_channelTradeNo_idx" ON "PaymentRecord"("channelTradeNo");

-- CreateIndex
CREATE INDEX "EntitlementLedger_userId_createdAt_idx" ON "EntitlementLedger"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EntitlementLedger_entitlementCode_idx" ON "EntitlementLedger"("entitlementCode");
