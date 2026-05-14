import type {
  AnalysisSession,
  AnalysisSessionId,
  DiagnosisResult,
  DiagnosisResultId,
  ResumeModuleKey,
} from "@/types/api";

const createId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const now = () => new Date().toISOString();

const sessions = new Map<string, AnalysisSession>();
const diagnoses = new Map<string, DiagnosisResult>();

const inferJobCategory = (jobTitle?: string, jobDescriptionText?: string) => {
  const source = `${jobTitle ?? ""} ${jobDescriptionText ?? ""}`.toLowerCase();
  if (source.includes("产品")) return "product";
  if (source.includes("运营")) return "operation";
  if (source.includes("数据")) return "data";
  if (source.includes("前端") || source.includes("开发")) return "engineering";
  return "general";
};

const inferKeywords = (jobDescriptionText: string) => {
  const keywordPool = [
    "数据分析",
    "用户研究",
    "需求拆解",
    "跨团队协作",
    "项目推进",
    "A/B 测试",
    "产品思维",
    "增长",
    "SQL",
    "校园活动",
  ];

  return keywordPool.filter((keyword) =>
    jobDescriptionText.toLowerCase().includes(keyword.toLowerCase())
  );
};

const buildDiagnosis = (session: AnalysisSession): DiagnosisResult => {
  const id = createId("dr") as DiagnosisResultId;
  const matchedKeywords = inferKeywords(session.jobDescriptionText).slice(0, 3);
  const missingCandidates = ["数据分析", "需求拆解", "项目复盘", "结果量化", "跨部门协作"];
  const missingKeywords = missingCandidates.filter(
    (keyword) => !matchedKeywords.includes(keyword)
  ).slice(0, 4);

  const score = Math.max(58, Math.min(89, 66 + matchedKeywords.length * 5 - missingKeywords.length));

  return {
    id,
    sessionId: session.id,
    matchScore: score,
    summary:
      matchedKeywords.length > 1
        ? "简历已经具备部分岗位相关性，但项目成果和关键词表达仍偏弱。"
        : "简历基础信息完整，但与目标岗位的关键词和成果表达连接较弱。",
    matchedKeywords,
    missingKeywords,
    risks: [
      {
        type: "BULLET_TOO_GENERIC",
        message: "项目描述更像职责列表，缺少具体动作和结果。",
      },
      {
        type: "WEAK_QUANTIFICATION",
        message: "经历中缺少数字、范围或结果指标，难以体现影响力。",
      },
    ],
    recommendations: [
      "先优化项目经历，把动作、结果和影响写完整。",
      "补充与 JD 直接相关的关键词，优先放入项目和技能模块。",
      "把校园活动或实习经历改写成招聘方更容易识别的成果表达。",
    ],
    modelVersion: "mock-v1",
    createdAt: now(),
    updatedAt: now(),
  };
};

export const mockStore = {
  createSession(input: {
    resumeText: string;
    jobDescriptionText: string;
    jobTitle?: string;
    jobCategory?: string;
    applicationType?: AnalysisSession["applicationType"];
    focusModules?: ResumeModuleKey[];
  }) {
    const id = createId("as") as AnalysisSessionId;
    const session: AnalysisSession = {
      id,
      userId: null,
      status: "ANALYZED",
      resumeText: input.resumeText,
      resumeFileUrl: null,
      jobDescriptionText: input.jobDescriptionText,
      jobTitle: input.jobTitle ?? null,
      jobCategory: input.jobCategory ?? inferJobCategory(input.jobTitle, input.jobDescriptionText),
      applicationType: input.applicationType ?? null,
      focusModules: input.focusModules ?? [],
      failureReason: null,
      createdAt: now(),
      updatedAt: now(),
    };

    sessions.set(id, session);
    diagnoses.set(id, buildDiagnosis(session));
    return session;
  },

  getSession(sessionId: string) {
    return sessions.get(sessionId) ?? null;
  },

  getDiagnosis(sessionId: string) {
    return diagnoses.get(sessionId) ?? null;
  },

};
