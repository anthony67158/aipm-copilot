import type {
  DiagnosisResult,
  DiagnosisResultId,
  OptimizationResult,
  OptimizationResultId,
  OptimizedSection,
  ResumeModuleKey,
  RewriteMode,
} from "@/types/api";

const createId = <T extends string>(prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}` as T;

const now = () => new Date().toISOString();

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

export const inferJobCategory = (jobTitle?: string | null, jobDescriptionText?: string | null) => {
  const source = `${jobTitle ?? ""} ${jobDescriptionText ?? ""}`.toLowerCase();
  if (source.includes("产品")) return "product";
  if (source.includes("运营")) return "operation";
  if (source.includes("数据")) return "data";
  if (source.includes("前端") || source.includes("开发")) return "engineering";
  return "general";
};

export function buildDiagnosis(input: { sessionId: string; jobDescriptionText: string }): DiagnosisResult {
  const matchedKeywords = inferKeywords(input.jobDescriptionText).slice(0, 3);
  const missingCandidates = ["数据分析", "需求拆解", "项目复盘", "结果量化", "跨部门协作"];
  const missingKeywords = missingCandidates.filter(
    (keyword) => !matchedKeywords.includes(keyword)
  ).slice(0, 4);

  const score = Math.max(58, Math.min(89, 66 + matchedKeywords.length * 5 - missingKeywords.length));

  return {
    id: createId<DiagnosisResultId>("dr"),
    sessionId: input.sessionId as DiagnosisResult["sessionId"],
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
    modelVersion: "heuristic-v1",
    createdAt: now(),
    updatedAt: now(),
  };
}

export function buildOptimization(input: {
  sessionId: string;
  beforeScore: number;
  rewriteMode: RewriteMode;
  selectedModules: ResumeModuleKey[];
}): OptimizationResult {
  const modules: ResumeModuleKey[] =
    input.selectedModules.length > 0 ? input.selectedModules : ["summary", "project", "skills"];

  const optimizedSections: OptimizedSection[] = modules.map((module) => ({
    sectionKey: module,
    sectionLabel:
      module === "summary"
        ? "个人简介"
        : module === "project"
          ? "项目经历"
          : module === "skills"
            ? "技能"
            : module,
    originalText:
      module === "summary"
        ? "有较强的学习能力和执行力，希望加入优秀团队。"
        : module === "project"
          ? "负责校园活动推广，协助完成项目执行。"
          : "熟悉 Office、会使用数据分析工具。",
    optimizedText:
      module === "summary"
        ? "具备用户洞察与项目推进意识，曾在校园项目中完成需求调研、活动策划与复盘输出，适合从产品与运营岗位切入。"
        : module === "project"
          ? "主导校园活动推广项目，围绕目标人群完成调研、方案拆解与执行推进，覆盖 2000+ 名学生用户，活动报名转化率提升 26%，并输出复盘结论支持下一轮迭代。"
          : "技能关键词覆盖 Office、问卷设计、基础 SQL、数据整理与可视化，能支持用户研究、活动分析和基础业务复盘。",
    explanation:
      module === "summary"
        ? "强化了岗位相关性，避免空泛自我评价。"
        : module === "project"
          ? "补充了动作、规模、结果和复盘，符合招聘方对项目经历的阅读习惯。"
          : "把通用技能转成更贴近岗位语境的可识别表达。",
  }));

  return {
    id: createId<OptimizationResultId>("or"),
    sessionId: input.sessionId as OptimizationResult["sessionId"],
    beforeScore: input.beforeScore,
    afterScore: Math.min(96, input.beforeScore + 13),
    rewriteMode: input.rewriteMode,
    selectedModules: modules,
    optimizedSections,
    fullOptimizedResumeText: [
      "个人简介",
      optimizedSections.find((item) => item.sectionKey === "summary")?.optimizedText,
      "",
      "项目经历",
      optimizedSections.find((item) => item.sectionKey === "project")?.optimizedText,
      "",
      "技能",
      optimizedSections.find((item) => item.sectionKey === "skills")?.optimizedText,
    ]
      .filter(Boolean)
      .join("\n"),
    modelVersion: "heuristic-v1",
    createdAt: now(),
    updatedAt: now(),
  };
}
