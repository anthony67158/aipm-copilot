-- AlterTable
ALTER TABLE "AnalysisSession" ADD COLUMN "currentRole" TEXT;
ALTER TABLE "AnalysisSession" ADD COLUMN "userIdentity" TEXT;
ALTER TABLE "AnalysisSession" ADD COLUMN "yearsOfExperience" INTEGER;

-- CreateTable
CREATE TABLE "DecisionReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "recommendationLabel" TEXT NOT NULL,
    "overallMatchScore" INTEGER NOT NULL,
    "oneLiner" TEXT NOT NULL,
    "dimensionsJson" JSONB NOT NULL,
    "interviewPredJson" JSONB NOT NULL,
    "twoWeekPlanJson" JSONB NOT NULL,
    "modelVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DecisionReport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AnalysisSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "whyAsked" TEXT NOT NULL,
    "answerFramework" TEXT NOT NULL,
    "keyPoints" JSONB NOT NULL,
    "pitfalls" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterviewQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AnalysisSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DecisionReport_sessionId_key" ON "DecisionReport"("sessionId");

-- CreateIndex
CREATE INDEX "DecisionReport_recommendation_idx" ON "DecisionReport"("recommendation");

-- CreateIndex
CREATE INDEX "DecisionReport_overallMatchScore_idx" ON "DecisionReport"("overallMatchScore");

-- CreateIndex
CREATE INDEX "InterviewQuestion_sessionId_idx" ON "InterviewQuestion"("sessionId");

-- CreateIndex
CREATE INDEX "InterviewQuestion_category_idx" ON "InterviewQuestion"("category");
