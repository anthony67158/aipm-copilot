import { prisma } from "@/lib/prisma";
import { generateDecisionReport, generateAIPMRewrite, generateInterviewQuestions, generateInterviewQuestionDetail } from "@/lib/llm";
import type { GenerationProgressCallback } from "@/lib/llm";
import { buildDiagnosis, inferJobCategory } from "@/lib/analysis-engine";
import { FULL_REPORT_PRODUCT_CODES } from "@/lib/product-codes";
import { AIPM_DIMENSIONS } from "@/lib/aipm-model";
import type {
  AnalysisSession,
  AnalysisSessionId,
  CreateAnalysisSessionRequest,
  DecisionReport,
  DiagnosisResult,
  InterviewQuestionItem,
  OptimizationResult,
  Pagination,
  ReportHistoryItem,
  ResumeModuleKey,
  RewriteMode,
  AIPMDimensionId,
  InterviewQuestionCategory,
  UserProfile,
  RewriteResult,
} from "@/types/api";

const createId = <T extends string>(prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}` as T;

function getUsableResumeTextForQuestions(optimizedText: string | null | undefined, fallbackText: string) {
  const text = optimizedText?.trim();
  if (!text) return fallbackText;
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const moduleCount = (text.match(/^##\s+/gm) ?? []).length;
  const bulletCount = (text.match(/^- /gm) ?? []).length;
  const hasLongLine = lines.some((line) => !line.startsWith("## ") && line.length > 150);
  const hasIncompleteLine = lines.some((line) => {
    const content = line.replace(/^-\s*/, "").trim();
    return /[，,、；;：:]$/.test(content) || /(通过|基于|围绕|包括|以及|并|和|及|或|与|为|将|对)$/.test(content);
  });

  if (moduleCount < 2 || bulletCount < 2 || hasLongLine || hasIncompleteLine) {
    console.warn("optimized resume ignored for interview questions because format quality is low");
    return fallbackText;
  }
  return text;
}

function isCachedDecisionReportComplete(report: DecisionReport) {
  const isMissingEvidence = (text: string) => /未找到|没有证据|暂无证据|证据不足|未体现|未提供/.test(text);
  const looksTemplateRisk = (text: string) =>
    /职责列表|最薄弱的是|如果负责一个 AI 功能|你理解的 AI 产品经理和普通产品经理|请详细描述一个|会重点验证.+风险不是“有没有做过”|当前可用证据是|这个项目里你本人做了哪一步关键判断|临时追热点|AI 产品经理真实工作/.test(text);
  const dimensionsComplete = Array.isArray(report.dimensions)
    && report.dimensions.length === AIPM_DIMENSIONS.length
    && report.dimensions.every((dimension) =>
      Boolean(dimension.dimensionLabel)
      && typeof dimension.evidence === "string"
      && dimension.evidence.trim().length >= 45
      && (dimension.gap !== "met" || !isMissingEvidence(dimension.evidence))
      && !(dimension.requiredLevel === 0 && dimension.currentLevel === 0)
      && (dimension.gap === "met" || (
        Array.isArray(dimension.remedyActions)
        && dimension.remedyActions.length >= 2
        && dimension.remedyActions.every((action) => typeof action === "string" && action.trim().length >= 30)
      ))
    );
  const risksComplete = Boolean(
    report.interviewRoundPrediction?.resumeScreening?.risk?.length >= 90
    && report.interviewRoundPrediction?.firstRound?.weakness?.length >= 90
    && report.interviewRoundPrediction?.secondRound?.weakness?.length >= 90
    && report.interviewRoundPrediction?.hrRound?.risk?.length >= 80
    && !looksTemplateRisk(report.interviewRoundPrediction.resumeScreening.risk)
    && !looksTemplateRisk(report.interviewRoundPrediction.firstRound.weakness)
    && !looksTemplateRisk(report.interviewRoundPrediction.secondRound.weakness)
    && !looksTemplateRisk(report.interviewRoundPrediction.hrRound.risk)
    && (report.interviewRoundPrediction?.firstRound?.likelyQuestions?.length ?? 0) >= 2
    && (report.interviewRoundPrediction?.secondRound?.likelyQuestions?.length ?? 0) >= 2
  );
  const planComplete = (report.twoWeekPlan?.week1?.length ?? 0) >= 3
    && (report.twoWeekPlan?.week2?.length ?? 0) >= 3
    && [...(report.twoWeekPlan?.week1 ?? []), ...(report.twoWeekPlan?.week2 ?? [])].every((action) => {
      const hasStructured = typeof action.title === "string"
        && action.title.trim().length >= 4
        && Array.isArray(action.steps)
        && action.steps.length >= 3
        && typeof action.deliverable === "string"
        && action.deliverable.trim().length >= 6
        && typeof action.acceptance === "string"
        && action.acceptance.trim().length >= 10;
      const hasLegacy = typeof action.action === "string"
        && action.action.trim().length >= 80
        && /输出物|验收/.test(action.action);
      return hasStructured || hasLegacy;
    });

  return dimensionsComplete && risksComplete && planComplete && report.oneLiner.trim().length >= 40;
}

function mapAnalysisSession(record: {
  id: string;
  userId: string | null;
  status: string;
  resumeText: string;
  resumeFileUrl: string | null;
  jobDescriptionText: string;
  jobTitle: string | null;
  jobCategory: string | null;
  applicationType: string | null;
  focusModules: unknown;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AnalysisSession {
  return {
    id: record.id as AnalysisSessionId,
    userId: record.userId as AnalysisSession["userId"],
    status: record.status as AnalysisSession["status"],
    resumeText: record.resumeText,
    resumeFileUrl: record.resumeFileUrl,
    jobDescriptionText: record.jobDescriptionText,
    jobTitle: record.jobTitle,
    jobCategory: record.jobCategory,
    applicationType: record.applicationType as AnalysisSession["applicationType"],
    focusModules: Array.isArray(record.focusModules) ? (record.focusModules as ResumeModuleKey[]) : [],
    failureReason: record.failureReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseRiskArray(value: unknown): DiagnosisResult["risks"] {
  return Array.isArray(value) ? (value as unknown as DiagnosisResult["risks"]) : [];
}

export const analysisStore = {
  async createSession(input: CreateAnalysisSessionRequest & { resumeFileUrl?: string | null; userProfile?: UserProfile; targetCompany?: string | null; userId?: string | null }) {
    const sessionId = createId<AnalysisSessionId>("as");
    const diagnosis = buildDiagnosis({
      sessionId,
      jobDescriptionText: input.jobDescriptionText,
    });

    const session = await prisma.analysisSession.create({
      data: {
        id: sessionId,
        userId: input.userId ?? null,
        status: "ANALYZED",
        resumeText: input.resumeText,
        resumeFileUrl: input.resumeFileUrl ?? null,
        jobDescriptionText: input.jobDescriptionText,
        jobTitle: input.jobTitle ?? null,
        jobCategory: input.jobCategory ?? inferJobCategory(input.jobTitle, input.jobDescriptionText),
        applicationType: input.applicationType ?? null,
        focusModules: input.focusModules ?? [],
        userIdentity: input.userProfile?.identity ?? null,
        currentRole: input.userProfile?.currentRole ?? null,
        roleSpecialty: input.userProfile?.roleSpecialty ?? null,
        yearsOfExperience: input.userProfile?.yearsOfExperience ?? null,
        targetCompany: input.targetCompany ?? null,
        diagnosisResult: {
          create: {
            id: diagnosis.id,
            matchScore: diagnosis.matchScore,
            summary: diagnosis.summary,
            matchedKeywords: diagnosis.matchedKeywords,
            missingKeywords: diagnosis.missingKeywords,
            risks: diagnosis.risks as never,
            recommendations: diagnosis.recommendations,
            modelVersion: diagnosis.modelVersion,
          },
        },
      },
    });

    return mapAnalysisSession(session);
  },

  async getSession(sessionId: string) {
    const session = await prisma.analysisSession.findUnique({ where: { id: sessionId } });
    return session ? mapAnalysisSession(session) : null;
  },

  async claimSessions(userId: string, sessionIds: string[]) {
    const uniqueSessionIds = Array.from(new Set(sessionIds.filter(Boolean)));
    if (uniqueSessionIds.length === 0) {
      return { count: 0 };
    }

    const result = await prisma.analysisSession.updateMany({
      where: {
        id: { in: uniqueSessionIds },
        OR: [{ userId: null }, { userId }],
      },
      data: { userId },
    });

    return { count: result.count };
  },

  async listUserReports(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [records, totalItems] = await Promise.all([
      prisma.analysisSession.findMany({
        where: { userId },
        include: {
          decisionReport: true,
          optimizationResult: true,
          _count: {
            select: { interviewQuestions: true },
          },
          paymentOrders: {
            where: { productCode: { in: FULL_REPORT_PRODUCT_CODES }, status: "PAID" },
            select: { id: true },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.analysisSession.count({ where: { userId } }),
    ]);

    const items: ReportHistoryItem[] = records.map((record: {
      id: string;
      jobTitle: string | null;
      targetCompany: string | null;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      decisionReport: { recommendationLabel: string; overallMatchScore: number; oneLiner: string } | null;
      optimizationResult: { id: string } | null;
      _count: { interviewQuestions: number };
      paymentOrders: { id: string }[];
    }) => ({
      sessionId: record.id as ReportHistoryItem["sessionId"],
      jobTitle: record.jobTitle,
      targetCompany: record.targetCompany,
      recommendationLabel: record.decisionReport?.recommendationLabel ?? null,
      overallMatchScore: record.decisionReport?.overallMatchScore ?? null,
      oneLiner: record.decisionReport?.oneLiner ?? null,
      status: record.status as ReportHistoryItem["status"],
      isPaid: record.paymentOrders.length > 0,
      hasRewrite: Boolean(record.optimizationResult),
      interviewQuestionCount: record._count.interviewQuestions,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }));

    const pagination: Pagination = {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    };

    return { items, pagination };
  },

  async getDiagnosis(sessionId: string): Promise<DiagnosisResult | null> {
    const diagnosis = await prisma.diagnosisResult.findUnique({ where: { sessionId } });
    if (!diagnosis) return null;

    return {
      id: diagnosis.id as DiagnosisResult["id"],
      sessionId: diagnosis.sessionId as DiagnosisResult["sessionId"],
      matchScore: diagnosis.matchScore,
      summary: diagnosis.summary,
      matchedKeywords: parseStringArray(diagnosis.matchedKeywords),
      missingKeywords: parseStringArray(diagnosis.missingKeywords),
      risks: parseRiskArray(diagnosis.risks),
      recommendations: parseStringArray(diagnosis.recommendations),
      modelVersion: diagnosis.modelVersion,
      createdAt: diagnosis.createdAt.toISOString(),
      updatedAt: diagnosis.updatedAt.toISOString(),
    };
  },

  async getOptimization(sessionId: string): Promise<OptimizationResult | null> {
    const result = await prisma.optimizationResult.findUnique({ where: { sessionId } });
    if (!result) return null;

    return {
      id: result.id as OptimizationResult["id"],
      sessionId: result.sessionId as OptimizationResult["sessionId"],
      beforeScore: result.beforeScore,
      afterScore: result.afterScore,
      rewriteMode: result.rewriteMode as RewriteMode,
      selectedModules: Array.isArray(result.selectedModules) ? (result.selectedModules as ResumeModuleKey[]) : [],
      optimizedSections: Array.isArray(result.optimizedSections)
        ? (result.optimizedSections as unknown as OptimizationResult["optimizedSections"])
        : [],
      fullOptimizedResumeText: result.fullOptimizedResumeText,
      modelVersion: result.modelVersion,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    };
  },

  async generateAndSaveDecisionReport(sessionId: string, options?: { onProgress?: GenerationProgressCallback }): Promise<DecisionReport | null> {
    const session = await prisma.analysisSession.findUnique({ where: { id: sessionId } });
    if (!session) return null;

    const report = await generateDecisionReport({
      sessionId,
      resumeText: session.resumeText,
      jobDescriptionText: session.jobDescriptionText,
      jobTitle: session.jobTitle,
      userIdentity: session.userIdentity || "fresh_graduate",
      currentRole: session.currentRole,
      roleSpecialty: session.roleSpecialty,
      yearsOfExperience: session.yearsOfExperience,
      targetCompany: session.targetCompany,
      onProgress: options?.onProgress,
    });

    try {
      const reportId = createId("dp");
      await prisma.decisionReport.upsert({
        where: { sessionId },
        update: {
          recommendation: report.recommendation,
          recommendationLabel: report.recommendationLabel,
          overallMatchScore: report.overallMatchScore,
          oneLiner: report.oneLiner,
          dimensionsJson: report.dimensions as never,
          interviewPredJson: report.interviewRoundPrediction as never,
          twoWeekPlanJson: report.twoWeekPlan as never,
          modelVersion: `llm`,
        },
        create: {
          id: reportId,
          sessionId,
          recommendation: report.recommendation,
          recommendationLabel: report.recommendationLabel,
          overallMatchScore: report.overallMatchScore,
          oneLiner: report.oneLiner,
          dimensionsJson: report.dimensions as never,
          interviewPredJson: report.interviewRoundPrediction as never,
          twoWeekPlanJson: report.twoWeekPlan as never,
          modelVersion: `llm`,
        },
      });
    } catch (error) {
      console.error("decision report save failed, returning generated report", error);
    }

    return report;
  },

  async getDecisionReport(sessionId: string): Promise<DecisionReport | null> {
    const record = await prisma.decisionReport.findUnique({ where: { sessionId } });
    if (!record) return null;

    const report = {
      sessionId: record.sessionId as DecisionReport["sessionId"],
      recommendation: record.recommendation as DecisionReport["recommendation"],
      recommendationLabel: record.recommendationLabel,
      oneLiner: record.oneLiner,
      overallMatchScore: record.overallMatchScore,
      dimensions: record.dimensionsJson as unknown as DecisionReport["dimensions"],
      interviewRoundPrediction: record.interviewPredJson as unknown as DecisionReport["interviewRoundPrediction"],
      twoWeekPlan: record.twoWeekPlanJson as unknown as DecisionReport["twoWeekPlan"],
    };
    return isCachedDecisionReportComplete(report) ? report : null;
  },

  async generateAndSaveRewrite(sessionId: string, options?: { rewriteMode?: string; focusDimensions?: AIPMDimensionId[]; onProgress?: GenerationProgressCallback }): Promise<RewriteResult | null> {
    const session = await prisma.analysisSession.findUnique({ where: { id: sessionId } });
    if (!session) return null;

    const decisionReport = await this.getDecisionReport(sessionId);

    const result = await generateAIPMRewrite({
      sessionId,
      resumeText: session.resumeText,
      jobDescriptionText: session.jobDescriptionText,
      jobTitle: session.jobTitle,
      userIdentity: session.userIdentity || "fresh_graduate",
      currentRole: session.currentRole,
      roleSpecialty: session.roleSpecialty,
      targetCompany: session.targetCompany,
      rewriteMode: options?.rewriteMode,
      focusDimensions: options?.focusDimensions,
      decisionReport: decisionReport ?? undefined,
      onProgress: options?.onProgress,
    });

    const resultId = createId("or");
    await prisma.optimizationResult.upsert({
      where: { sessionId },
      update: {
        beforeScore: result.beforeScore,
        afterScore: result.afterScore,
        rewriteMode: options?.rewriteMode ?? "conservative",
        selectedModules: options?.focusDimensions ?? [],
        optimizedSections: result.sections as never,
        fullOptimizedResumeText: result.fullRewrittenText,
        modelVersion: "aipm-rewrite",
      },
      create: {
        id: resultId,
        sessionId,
        beforeScore: result.beforeScore,
        afterScore: result.afterScore,
        rewriteMode: options?.rewriteMode ?? "conservative",
        selectedModules: options?.focusDimensions ?? [],
        optimizedSections: result.sections as never,
        fullOptimizedResumeText: result.fullRewrittenText,
        modelVersion: "aipm-rewrite",
      },
    });

    await prisma.analysisSession.update({
      where: { id: sessionId },
      data: { status: "OPTIMIZED" },
    });

    return {
      sessionId: sessionId as RewriteResult["sessionId"],
      beforeScore: result.beforeScore,
      afterScore: result.afterScore,
      rewriteStrategy: result.rewriteStrategy,
      sections: result.sections,
      fullRewrittenText: result.fullRewrittenText,
      aipmTermsHighlighted: result.aipmTermsHighlighted,
      factGuard: result.factGuard,
    };
  },

  async generateAndSaveInterviewQuestions(sessionId: string, options?: { questionCount?: number; includeCategories?: InterviewQuestionCategory[]; append?: boolean; onProgress?: GenerationProgressCallback }): Promise<InterviewQuestionItem[]> {
    const session = await prisma.analysisSession.findUnique({
      where: { id: sessionId },
      include: { optimizationResult: true },
    });
    if (!session) return [];
    const resumeTextForQuestions = getUsableResumeTextForQuestions(
      session.optimizationResult?.fullOptimizedResumeText,
      session.resumeText,
    );

    const questions = await generateInterviewQuestions({
      sessionId,
      resumeText: resumeTextForQuestions,
      jobDescriptionText: session.jobDescriptionText,
      jobTitle: session.jobTitle,
      userIdentity: session.userIdentity || "fresh_graduate",
      targetCompany: session.targetCompany,
      roleSpecialty: session.roleSpecialty,
      questionCount: options?.questionCount,
      includeCategories: options?.includeCategories,
      onProgress: options?.onProgress,
    });

    if (questions.length > 0) {
      const append = options?.append === true;
      const existingCount = append
        ? await prisma.interviewQuestion.count({ where: { sessionId } })
        : 0;
      if (!append) {
        await prisma.interviewQuestion.deleteMany({ where: { sessionId } });
      }
      await prisma.interviewQuestion.createMany({
        data: questions.map((q, index) => ({
          id: `${sessionId}_iq_${String(existingCount + index + 1).padStart(3, "0")}`,
          sessionId,
          category: q.category,
          question: q.question,
          whyAsked: q.whyAsked,
          answerFramework: q.answerFramework,
          sampleAnswer: q.sampleAnswer ?? "",
          keyPoints: q.keyPoints,
          pitfalls: q.pitfalls,
        })),
      });

      return questions.map((q, index) => ({
        ...q,
        id: `${sessionId}_iq_${String(existingCount + index + 1).padStart(3, "0")}`,
      }));
    }

    return questions.map((q, index) => ({
      ...q,
      id: `${sessionId}_iq_${String(index + 1).padStart(3, "0")}`,
    }));
  },

  async generateAndSaveInterviewQuestionDetail(sessionId: string, questionId: string, options?: { onProgress?: GenerationProgressCallback }): Promise<InterviewQuestionItem | null> {
    const session = await prisma.analysisSession.findUnique({
      where: { id: sessionId },
      include: { optimizationResult: true },
    });
    if (!session) return null;

    const record = await prisma.interviewQuestion.findFirst({
      where: { id: questionId, sessionId },
    });
    if (!record) return null;
    const recordWithSampleAnswer = record as typeof record & { sampleAnswer?: string | null };

    const baseQuestion: InterviewQuestionItem = {
      id: record.id,
      category: record.category as InterviewQuestionCategory,
      question: record.question,
      whyAsked: record.whyAsked,
      answerFramework: record.answerFramework,
      sampleAnswer: recordWithSampleAnswer.sampleAnswer ?? "",
      keyPoints: Array.isArray(record.keyPoints) ? (record.keyPoints as string[]) : [],
      pitfalls: Array.isArray(record.pitfalls) ? (record.pitfalls as string[]) : [],
    };

    const resumeTextForQuestions = getUsableResumeTextForQuestions(
      session.optimizationResult?.fullOptimizedResumeText,
      session.resumeText,
    );
    const detail = await generateInterviewQuestionDetail({
      resumeText: resumeTextForQuestions,
      jobDescriptionText: session.jobDescriptionText,
      jobTitle: session.jobTitle,
      userIdentity: session.userIdentity || "fresh_graduate",
      targetCompany: session.targetCompany,
      roleSpecialty: session.roleSpecialty,
      question: baseQuestion,
      onProgress: options?.onProgress,
    });

    const updated = await prisma.interviewQuestion.update({
      where: { id: questionId },
      data: {
        answerFramework: detail.answerFramework,
        sampleAnswer: detail.sampleAnswer,
        keyPoints: detail.keyPoints,
        pitfalls: detail.pitfalls,
      } as never,
    });
    const updatedWithSampleAnswer = updated as typeof updated & { sampleAnswer?: string | null };

    return {
      id: updated.id,
      category: updated.category as InterviewQuestionCategory,
      question: updated.question,
      whyAsked: updated.whyAsked,
      answerFramework: updated.answerFramework,
      sampleAnswer: updatedWithSampleAnswer.sampleAnswer ?? "",
      keyPoints: Array.isArray(updated.keyPoints) ? (updated.keyPoints as string[]) : [],
      pitfalls: Array.isArray(updated.pitfalls) ? (updated.pitfalls as string[]) : [],
    };
  },

  async getInterviewQuestions(sessionId: string): Promise<InterviewQuestionItem[]> {
    const records = await prisma.interviewQuestion.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
    return records.map((r: { id: string; category: string; question: string; whyAsked: string; answerFramework: string; sampleAnswer?: string | null; keyPoints: unknown; pitfalls: unknown }) => ({
      id: r.id,
      category: r.category as InterviewQuestionCategory,
      question: r.question,
      whyAsked: r.whyAsked,
      answerFramework: r.answerFramework,
      sampleAnswer: r.sampleAnswer ?? "",
      keyPoints: Array.isArray(r.keyPoints) ? (r.keyPoints as string[]) : [],
      pitfalls: Array.isArray(r.pitfalls) ? (r.pitfalls as string[]) : [],
    }));
  },
};
