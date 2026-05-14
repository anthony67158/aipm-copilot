import { buildDiagnosis, buildOptimization } from "@/lib/analysis-engine";
import {
  buildRewriteFactGuard,
  buildRewriteFactWhitelistSummary,
  extractDateRanges,
  validateRewriteConsistency,
} from "@/lib/rewrite-guard";
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

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ChatJSONOptions = {
  timeoutMs?: number;
  retries?: number;
  temperature?: number;
  model?: string;
  maxTokens?: number;
  traceId?: string;
  operation?: string;
  salvage?: (raw: string) => unknown;
};

function getLLMConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const fastModel = process.env.OPENAI_FAST_MODEL || model;
  const qualityModel = process.env.OPENAI_QUALITY_MODEL || process.env.OPENAI_REASONING_MODEL || model;
  return {
    apiKey,
    baseUrl,
    model,
    fastModel,
    qualityModel,
    enabled: Boolean(apiKey),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableLLMError(error: unknown) {
  const message = getErrorMessage(error);
  return (
    error instanceof SyntaxError ||
    message.includes("aborted") ||
    message.includes("timed out") ||
    message.includes("LLM request failed: 408") ||
    message.includes("LLM request failed: 409") ||
    message.includes("LLM request failed: 429") ||
    message.includes("LLM request failed: 5")
  );
}

async function reportDebugEvent(event: {
  runId: string;
  hypothesisId: string;
  location: string;
  msg: string;
  data?: Record<string, unknown>;
  traceId?: string;
}) {
  try {
    const debugUrl = process.env.DEBUG_SERVER_URL;
    const debugSessionId = process.env.DEBUG_SESSION_ID;
    if (!debugUrl || !debugSessionId) return;

    await fetch(debugUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: debugSessionId,
        runId: event.runId,
        hypothesisId: event.hypothesisId,
        location: event.location,
        msg: event.msg,
        data: event.data ?? {},
        traceId: event.traceId,
        ts: Date.now(),
      }),
    });
  } catch {
    // ignore debug reporting failures
  }
}

async function callChatJSON<T>(messages: ChatMessage[], options: ChatJSONOptions = {}): Promise<T> {
  const config = getLLMConfig();
  if (!config.enabled || !config.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const timeoutMs = options.timeoutMs ?? Number(process.env.OPENAI_TIMEOUT_MS || 90000);
  const retries = options.retries ?? Number(process.env.OPENAI_RETRIES || 1);
  const model = options.model ?? config.model;
  const maxTokens = options.maxTokens ?? Number(process.env.OPENAI_MAX_TOKENS || 1800);
  let lastError: unknown;
  const traceId = options.traceId ?? `llm_${Math.random().toString(36).slice(2, 10)}`;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      // #region debug-point A:llm-request-start
      void reportDebugEvent({
        runId: "pre-fix",
        hypothesisId: "A",
        location: "lib/llm.ts:callChatJSON:start",
        msg: "[DEBUG] llm request started",
        data: {
          operation: options.operation ?? "unknown",
          attempt,
          timeoutMs,
          retries,
          model,
          maxTokens,
          baseUrl: config.baseUrl,
          messageCount: messages.length,
          promptChars: messages.map((message) => message.content.length).reduce((sum, len) => sum + len, 0),
        },
        traceId,
      });
      // #endregion
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: options.temperature ?? 0.2,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          messages,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`LLM request failed: ${response.status} ${text}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("LLM returned empty content");
      }

      // #region debug-point B:llm-request-success
      void reportDebugEvent({
        runId: "pre-fix",
        hypothesisId: "B",
        location: "lib/llm.ts:callChatJSON:success",
        msg: "[DEBUG] llm request succeeded",
        data: {
          operation: options.operation ?? "unknown",
          attempt,
          durationMs: Date.now() - startedAt,
          contentChars: content.length,
        },
        traceId,
      });
      // #endregion
      try {
        return JSON.parse(extractJSON(content)) as T;
      } catch (parseErr) {
        if (options.salvage) {
          const salvaged = options.salvage(content);
          if (salvaged !== null && salvaged !== undefined) {
            return salvaged as T;
          }
        }
        throw parseErr;
      }
    } catch (error) {
      lastError = error;
      // #region debug-point A:llm-request-failed
      void reportDebugEvent({
        runId: "pre-fix",
        hypothesisId: isRetryableLLMError(error) ? "A" : "B",
        location: "lib/llm.ts:callChatJSON:error",
        msg: "[DEBUG] llm request failed",
        data: {
          operation: options.operation ?? "unknown",
          attempt,
          durationMs: Date.now() - startedAt,
          retryable: isRetryableLLMError(error),
          errorMessage: getErrorMessage(error),
        },
        traceId,
      });
      // #endregion
      if (attempt >= retries || !isRetryableLLMError(error)) break;
      await sleep(700 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("LLM request failed");
}

function extractJSON(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/, "").trim();
  }
  return trimmed;
}

function normalizeModuleKey(key: string): ResumeModuleKey {
  const allowed: ResumeModuleKey[] = [
    "profile",
    "summary",
    "education",
    "project",
    "internship",
    "campusExperience",
    "skills",
    "awards",
    "certifications",
  ];
  return allowed.includes(key as ResumeModuleKey) ? (key as ResumeModuleKey) : "summary";
}

export async function generateDiagnosis(input: {
  sessionId: string;
  resumeText: string;
  jobDescriptionText: string;
  jobTitle?: string | null;
}): Promise<DiagnosisResult> {
  const fallback = buildDiagnosis({
    sessionId: input.sessionId,
    jobDescriptionText: input.jobDescriptionText,
  });
  const generationContext = buildGenerationContext(input);

  try {
    const result = await callChatJSON<{
      matchScore: number;
      summary: string;
      matchedKeywords: string[];
      missingKeywords: string[];
      risks: Array<{ type: string; message: string }>;
      recommendations: string[];
    }>([
      {
        role: "system",
        content:
          "你是招聘视角的中文简历诊断助手。你必须严格输出 JSON，不要输出 markdown，不要虚构用户经历。",
      },
      {
        role: "user",
        content: [
          `目标岗位：${input.jobTitle ?? "未提供"}`,
          `JD 摘要输入:\n${clipInput(generationContext.jdBrief, 2500)}`,
          `简历摘要输入:\n${clipInput(generationContext.resumeBrief, 3500)}`,
          "请输出 JSON，字段必须包含：matchScore(0-100数字)、summary、matchedKeywords(string[])、missingKeywords(string[])、risks([{type,message}])、recommendations(string[])。",
          "要求：只做快速初筛诊断，summary 控制在 60 字以内，matchedKeywords/missingKeywords 各最多 6 个，recommendations 最多 4 条。",
          "risk.type 只能使用：BULLET_TOO_GENERIC、MISSING_KEYWORDS、WEAK_QUANTIFICATION、STRUCTURE_ISSUE、LOW_RELEVANCE、UNCLEAR_ROLE_SCOPE。",
        ].join("\n\n"),
      },
    ], {
      timeoutMs: 12000,
      retries: 0,
      temperature: 0.1,
      model: getLLMConfig().fastModel,
      maxTokens: 900,
      operation: "quick-diagnosis",
    });

    return {
      id: createId<DiagnosisResultId>("dr"),
      sessionId: input.sessionId as DiagnosisResult["sessionId"],
      matchScore: Math.max(0, Math.min(100, Number(result.matchScore) || fallback.matchScore)),
      summary: result.summary || fallback.summary,
      matchedKeywords: Array.isArray(result.matchedKeywords) ? result.matchedKeywords.slice(0, 8) : fallback.matchedKeywords,
      missingKeywords: Array.isArray(result.missingKeywords) ? result.missingKeywords.slice(0, 8) : fallback.missingKeywords,
      risks: Array.isArray(result.risks) ? result.risks.map((item) => ({
        type: item.type as DiagnosisResult["risks"][number]["type"],
        message: item.message,
      })) : fallback.risks,
      recommendations: Array.isArray(result.recommendations) ? result.recommendations.slice(0, 6) : fallback.recommendations,
      modelVersion: `llm:${getLLMConfig().fastModel}`,
      createdAt: now(),
      updatedAt: now(),
    };
  } catch {
    return {
      ...fallback,
      id: createId<DiagnosisResultId>("dr"),
      modelVersion: "heuristic-fallback",
      createdAt: now(),
      updatedAt: now(),
    };
  }
}

export async function generateOptimization(input: {
  sessionId: string;
  resumeText: string;
  jobDescriptionText: string;
  jobTitle?: string | null;
  beforeScore: number;
  rewriteMode: RewriteMode;
  selectedModules: ResumeModuleKey[];
}): Promise<OptimizationResult> {
  const fallback = buildOptimization({
    sessionId: input.sessionId,
    beforeScore: input.beforeScore,
    rewriteMode: input.rewriteMode,
    selectedModules: input.selectedModules,
  });

  try {
    const result = await callChatJSON<{
      beforeScore?: number;
      afterScore: number;
      optimizedSections: Array<{
        sectionKey: string;
        sectionLabel: string;
        originalText: string;
        optimizedText: string;
        explanation: string;
      }>;
      fullOptimizedResumeText: string;
    }>([
      {
        role: "system",
        content:
          "你是中文简历改写助手。你必须只基于用户给出的事实改写，不允许虚构经历或捏造数字。输出必须是 JSON，不要输出 markdown。",
      },
      {
        role: "user",
        content: [
          `目标岗位：${input.jobTitle ?? "未提供"}`,
          `JD:\n${clipInput(input.jobDescriptionText, 2200)}`,
          `简历:\n${clipInput(input.resumeText, 3600)}`,
          `rewriteMode：${input.rewriteMode}`,
          `selectedModules：${input.selectedModules.join(", ") || "summary, project, skills"}`,
          "请输出 JSON，字段必须包含：beforeScore、afterScore、optimizedSections、fullOptimizedResumeText。",
          "optimizedSections 每项必须包含：sectionKey、sectionLabel、originalText、optimizedText、explanation。",
          "sectionKey 只能使用：profile、summary、education、project、internship、campusExperience、skills、awards、certifications。",
        ].join("\n\n"),
      },
    ], {
      timeoutMs: 25000,
      retries: 0,
      temperature: 0.18,
      model: getLLMConfig().fastModel,
      maxTokens: 1800,
      operation: "optimize-resume",
    });

    const sections: OptimizedSection[] = Array.isArray(result.optimizedSections)
      ? result.optimizedSections.map((item) => ({
          sectionKey: normalizeModuleKey(item.sectionKey),
          sectionLabel: item.sectionLabel,
          originalText: item.originalText,
          optimizedText: item.optimizedText,
          explanation: item.explanation,
        }))
      : fallback.optimizedSections;

    return {
      id: createId<OptimizationResultId>("or"),
      sessionId: input.sessionId as OptimizationResult["sessionId"],
      beforeScore: input.beforeScore,
      afterScore: Math.max(input.beforeScore, Math.min(100, Number(result.afterScore) || fallback.afterScore || input.beforeScore)),
      rewriteMode: input.rewriteMode,
      selectedModules: input.selectedModules.length ? input.selectedModules : fallback.selectedModules,
      optimizedSections: sections,
      fullOptimizedResumeText: result.fullOptimizedResumeText || fallback.fullOptimizedResumeText,
      modelVersion: `llm:${getLLMConfig().fastModel}`,
      createdAt: now(),
      updatedAt: now(),
    };
  } catch {
    return {
      ...fallback,
      id: createId<OptimizationResultId>("or"),
      modelVersion: "heuristic-fallback",
      createdAt: now(),
      updatedAt: now(),
    };
  }
}

export async function polishResumeText(input: {
  resumeText: string;
}): Promise<{ polishedText: string; modelVersion: string; mode: "llm" | "fallback" }> {
  type StructuredResumeSection = {
    heading: string;
    items: string[];
  };

  const buildStructureMessages = () => [
    {
      role: "system" as const,
      content:
        "你是资深中文简历结构整理顾问。你的任务不是润色文案，而是把解析混乱、粘连、缺少层级的原始简历整理成清晰、可读、可继续分析的简历正文。你必须主动识别模块、规范标题、合并碎片、拆分经历要点、整理项目符号和空行。绝对不能编造信息，也不能修改原文里的数值、百分比、金额、时间、公司名、学校名、项目名、产品名、技术栈、奖项、排名、证书、职责归属。若某处不确定，必须保留原文。输出必须是 JSON。",
    },
    {
      role: "user" as const,
      content: [
        "请对下面这份解析后的简历做结构整理。",
        "## 必须做到",
        "1. 主动识别并规范模块标题，优先使用：个人信息、求职意向、教育背景、实习/工作经历、项目经历、校园经历、技能与工具、获奖经历、证书认证、其他经历。",
        "2. 每个模块标题单独一行，格式必须是：## 模块名称。",
        "3. 经历类模块必须拆成清晰项目符号，每条使用 '- ' 开头；不要把多段经历挤成一整段。",
        "4. 如果一段经历里同时有时间/组织/角色/动作/结果，要尽量分行呈现，但不新增任何缺失字段。",
        "5. 合并 OCR/PDF 解析造成的碎片行，例如把被错误拆开的短句合并回同一条 bullet。",
        "6. 删除明显重复的空行和无意义符号，但保留原始事实内容。",
        "7. 可以调整模块顺序，让简历更符合阅读习惯：个人信息/求职意向 → 教育 → 经历/项目 → 技能/奖项/证书。",
        "8. 只做结构整理，不做岗位定制改写，不把普通表达改成夸张营销话术。",
        "## 绝对禁止",
        "1. 不新增任何经历、项目、指标、工具、数据。",
        "2. 不修改任何已有数值、时间、学校、公司、项目名、产品名、奖项、证书、职责归属。",
        "3. 不删除任何可能有用的经历内容；如果不确定归属，放到“其他经历”。",
        "4. 不输出说明、不输出分析过程，只输出 JSON。",
        "## 输出格式",
        '字段仅包含：{ "sections": [{ "heading": string, "items": string[] }] }。',
        "heading 必须是规范模块名，不要带 ##。",
        "items 必须是该模块下的多条内容，每条是一行可读文本，不要带 '-'，不要把整个模块塞进一个 item。",
        "如果某个模块只有个人信息或教育背景，也要拆成 2-6 条 items。",
        "最终换行和项目符号由系统生成，你只负责判断模块和拆分内容。",
        `简历原文:\n${input.resumeText}`,
      ].join("\n\n"),
    },
  ];

  const assemblePolishedText = (sections: StructuredResumeSection[]) => {
    return sections
      .map((section) => {
        const heading = section.heading.replace(/^#+\s*/, "").replace(/[:：]$/, "").trim();
        const items = Array.isArray(section.items)
          ? section.items
              .map((item) => item.replace(/^[-•·●]\s*/, "").replace(/\s+/g, " ").trim())
              .filter(Boolean)
          : [];
        if (!heading || items.length === 0) return "";
        return [`## ${heading}`, ...items.map((item) => `- ${item}`)].join("\n");
      })
      .filter(Boolean)
      .join("\n\n")
      .trim();
  };

  const validatePolishedText = (polishedText: string) => {
    if (!polishedText) {
      throw new Error("empty polished text");
    }
    if (!/^##\s+/m.test(polishedText) || !/^- /m.test(polishedText)) {
      throw new Error("polished text is not structured with headings and bullets");
    }
    const sourceLength = input.resumeText.replace(/\s+/g, "").length;
    const polishedLength = polishedText.replace(/\s+/g, "").length;
    if (sourceLength > 120 && polishedLength < sourceLength * 0.65) {
      throw new Error("polished text lost too much content");
    }
  };

  const runStructureModel = async (model: string, operation: string, timeoutMs: number) => {
    const result = await callChatJSON<{
      sections?: StructuredResumeSection[];
      polishedText?: string;
    }>(buildStructureMessages(), {
      timeoutMs,
      retries: 0,
      temperature: 0.08,
      model,
      maxTokens: 4200,
      operation,
    });

    const polishedText = Array.isArray(result.sections) && result.sections.length > 0
      ? assemblePolishedText(result.sections)
      : (result.polishedText || "").trim();
    validatePolishedText(polishedText);
    return polishedText;
  };

  try {
    const polishedText = await runStructureModel(getLLMConfig().fastModel, "resume-structure-fast", 30000);

    return {
      polishedText,
      modelVersion: `llm:${getLLMConfig().fastModel}`,
      mode: "llm",
    };
  } catch (fastError) {
    console.error("resume structure fast model failed", fastError);
    const polishedText = await runStructureModel(getLLMConfig().qualityModel, "resume-structure-quality-backup", 90000);
    return {
      polishedText,
      modelVersion: `llm:${getLLMConfig().qualityModel}`,
      mode: "llm",
    };
  }
}

// ---------------------------------------------------------------------------
// AIPM Copilot: 投递决策报告
// ---------------------------------------------------------------------------

import { AIPM_DIMENSIONS, buildAIPMSystemPrompt } from "@/lib/aipm-model";
import type {
  AIPMDimensionId,
  DecisionReport,
  DimensionAnalysis,
  DimensionGap,
  InterviewQuestionCategory,
  InterviewQuestionItem,
  InterviewRoundPrediction,
  GenerationProgressEvent,
  PlanAction,
  RecommendationLevel,
  RewriteResult,
  RewriteSection,
  TwoWeekPlan,
  AIPMTerm,
} from "@/types/api";

export type GenerationProgressCallback = (
  event: Omit<GenerationProgressEvent, "type" | "operation">
) => void | Promise<void>;

function clipInput(value: string, maxLength: number) {
  const text = value.trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n\n[内容过长，已截断用于生成]` : text;
}

function rankImportantLines(text: string, limit: number) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/^[•·\-\d.\s、]+/, "").trim())
    .filter((line) => line.length >= 10 && line.length <= 120)
    .map((line) => ({
      line,
      score:
        (/(负责|主导|推动|设计|搭建|优化|协调|推进|分析|调研|迭代|上线|交付)/.test(line) ? 3 : 0) +
        (/(提升|增长|降低|完成|落地|转化|效率|结果|复盘|指标|数据)/.test(line) ? 3 : 0) +
        (/(用户|需求|产品|项目|业务|模型|策略|流程|AI|智能|算法)/i.test(line) ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score || b.line.length - a.line.length)
    .slice(0, limit)
    .map((item) => item.line);
}

function buildGenerationContext(input: {
  resumeText: string;
  jobDescriptionText: string;
}) {
  const resumeEvidenceLines = rankImportantLines(input.resumeText, 14);
  const jdEvidenceLines = rankImportantLines(input.jobDescriptionText, 10);

  return {
    resumeBrief: clipInput(
      [
        ...resumeEvidenceLines,
        "",
        input.resumeText,
      ].join("\n"),
      5200
    ),
    jdBrief: clipInput(
      [
        ...jdEvidenceLines,
        "",
        input.jobDescriptionText,
      ].join("\n"),
      3600
    ),
    resumeEvidenceLines,
    jdEvidenceLines,
  };
}

type ResumeRewriteBlock = {
  sectionKey: ResumeModuleKey;
  sectionLabel: string;
  content: string;
};

const RESUME_HEADING_RULES: Array<{
  pattern: RegExp;
  sectionKey: ResumeModuleKey;
  sectionLabel: string;
}> = [
  { pattern: /(个人信息|基本信息|个人资料|联系方式|求职意向)/, sectionKey: "profile", sectionLabel: "个人信息" },
  { pattern: /(个人简介|个人优势|自我评价|个人总结|职业总结|核心优势)/, sectionKey: "summary", sectionLabel: "个人总结" },
  { pattern: /(教育背景|教育经历|学历背景|学习经历)/, sectionKey: "education", sectionLabel: "教育背景" },
  { pattern: /(实习经历|工作经历|任职经历|职业经历)/, sectionKey: "internship", sectionLabel: "实习/工作经历" },
  { pattern: /(项目经历|项目经验|重点项目|项目实践)/, sectionKey: "project", sectionLabel: "项目经历" },
  { pattern: /(校园经历|社团经历|学生工作|校内经历|竞赛经历)/, sectionKey: "campusExperience", sectionLabel: "校园经历" },
  { pattern: /(技能证书|专业技能|技能特长|技能清单|技术栈)/, sectionKey: "skills", sectionLabel: "技能与工具" },
  { pattern: /(获奖情况|获奖经历|荣誉奖项|荣誉奖励)/, sectionKey: "awards", sectionLabel: "获奖经历" },
  { pattern: /(证书|资格证|认证)/, sectionKey: "certifications", sectionLabel: "证书认证" },
];

function normalizeResumeHeading(line: string) {
  return line
    .replace(/^[#*•·\-\s\d一二三四五六七八九十百千（）()【】\[\]、.．]+/, "")
    .replace(/[：:]+$/, "")
    .trim();
}

function resolveResumeSectionMeta(heading: string) {
  const normalized = normalizeResumeHeading(heading);
  return RESUME_HEADING_RULES.find((rule) => rule.pattern.test(normalized)) ?? null;
}

function isLikelyResumeHeading(line: string) {
  const normalized = normalizeResumeHeading(line);
  if (!normalized || normalized.length > 16) return false;
  if (/[，,。；;！？!?]/.test(normalized)) return false;
  return Boolean(resolveResumeSectionMeta(normalized));
}

function inferResumeSectionMeta(content: string, index: number): Pick<ResumeRewriteBlock, "sectionKey" | "sectionLabel"> {
  const compact = content.replace(/\s+/g, "");
  if (/大学|学院|专业|本科|硕士|博士|GPA|绩点/.test(compact)) {
    return { sectionKey: "education", sectionLabel: "教育背景" };
  }
  if (/实习|任职|负责|汇报|跨部门/.test(compact)) {
    return { sectionKey: "internship", sectionLabel: "实习/工作经历" };
  }
  if (/项目|上线|迭代|需求|PRD|原型|用户调研|增长|转化/.test(compact)) {
    return { sectionKey: "project", sectionLabel: "项目经历" };
  }
  if (/社团|学生会|校园|比赛|竞赛/.test(compact)) {
    return { sectionKey: "campusExperience", sectionLabel: "校园经历" };
  }
  if (/技能|工具|Axure|SQL|Python|Figma|Excel|Tableau/.test(compact)) {
    return { sectionKey: "skills", sectionLabel: "技能与工具" };
  }
  if (/证书|认证/.test(compact)) {
    return { sectionKey: "certifications", sectionLabel: "证书认证" };
  }
  if (/获奖|奖学金|荣誉/.test(compact)) {
    return { sectionKey: "awards", sectionLabel: "获奖经历" };
  }
  if (index === 0 && compact.length <= 180) {
    return { sectionKey: "summary", sectionLabel: "个人总结" };
  }
  return { sectionKey: "project", sectionLabel: `重点经历 ${index + 1}` };
}

function mergeResumeBlocks(blocks: ResumeRewriteBlock[], maxBlocks = 8) {
  const merged: ResumeRewriteBlock[] = [];

  for (const block of blocks) {
    const previous = merged[merged.length - 1];
    const lineCount = block.content.split("\n").filter(Boolean).length;
    const hasOwnHeading = /\d{4}\s*[./\-年]|公司|学校|学院|项目|实习/.test(block.content.split("\n")[0] ?? "");
    const isSmallBlock = block.content.length < 60 && lineCount <= 1 && !hasOwnHeading;
    const canMergeWithPrevious = Boolean(
      previous &&
      isSmallBlock &&
      previous.sectionKey === block.sectionKey
    );

    if (canMergeWithPrevious && previous) {
      const nextChunk = previous.sectionLabel === block.sectionLabel
        ? block.content
        : `${block.sectionLabel}\n${block.content}`;
      previous.content = `${previous.content}\n\n${nextChunk}`.trim();
      continue;
    }

    merged.push({ ...block });
  }

  while (merged.length > maxBlocks) {
    const tail = merged.pop();
    const previous = merged[merged.length - 1];
    if (!tail || !previous) break;
    previous.content = `${previous.content}\n\n${tail.sectionLabel}\n${tail.content}`.trim();
  }

  return merged;
}

function splitResumeSections(resumeText: string): ResumeRewriteBlock[] {
  const lines = resumeText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const blocks: ResumeRewriteBlock[] = [];
  let activeHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!content) {
      buffer = [];
      return;
    }

    const fromHeading = activeHeading ? resolveResumeSectionMeta(activeHeading) : null;
    const inferred = fromHeading ?? inferResumeSectionMeta(content, blocks.length);
    blocks.push({
      sectionKey: inferred.sectionKey,
      sectionLabel: fromHeading ? normalizeResumeHeading(activeHeading!) : inferred.sectionLabel,
      content,
    });

    buffer = [];
    activeHeading = null;
  };

  for (const line of lines) {
    if (isLikelyResumeHeading(line)) {
      flush();
      activeHeading = normalizeResumeHeading(line);
      continue;
    }

    buffer.push(line);
  }

  flush();

  if (!blocks.length) {
    const content = resumeText.trim();
    return content
      ? [{ ...inferResumeSectionMeta(content, 0), content }]
      : [];
  }

  return mergeResumeBlocks(blocks, 8);
}

function collectSummaryEvidenceLines(resumeText: string) {
  return resumeText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/^[•·\-\d.\s、]+/, "").trim())
    .filter((line) => line.length >= 12 && line.length <= 90)
    .map((line) => ({
      line,
      score:
        (/(负责|主导|推动|设计|搭建|优化|协调|推进|分析|调研|迭代|上线)/.test(line) ? 3 : 0) +
        (/(提升|增长|降低|完成|落地|转化|效率|结果|复盘|交付)/.test(line) ? 3 : 0) +
        (/(用户|需求|产品|项目|业务|数据|模型|策略|流程)/.test(line) ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score || b.line.length - a.line.length)
    .slice(0, 6)
    .map((item) => item.line);
}

function buildSummaryFallback(input: {
  resumeText: string;
  jobTitle?: string | null;
}) {
  const evidenceLines = collectSummaryEvidenceLines(input.resumeText);
  const lines = evidenceLines.slice(0, 3).map((line) => {
    const normalized = line.replace(/[。；;]+$/g, "").trim();
    return normalized.startsWith("- ") ? normalized : `- ${normalized}`;
  });

  const summaryLines = lines.length > 0
    ? lines
    : [
        `- 围绕${input.jobTitle ?? "AI 产品经理"}方向梳理过往经历，优先突出职责边界、关键动作与实际产出。`,
        "- 能把复杂信息拆成可执行任务，兼顾用户需求、协作推进与结果复盘。",
        "- 当前版本为保守兜底摘要，仅基于原简历已有信息整理，不补充新事实。",
      ];

  return {
    sectionKey: "summary" as ResumeModuleKey,
    sectionLabel: "AI 产品经理岗位摘要",
    originalText: evidenceLines.slice(0, 4).join("\n"),
    rewrittenText: summaryLines.slice(0, 4).join("\n"),
    explanation: "基于原简历中最能体现职责、动作、结果和迁移能力的内容进行摘要提炼。",
    targetDimensions: ["product_design", "project_execution", "business_sense", "communication"] as AIPMDimensionId[],
  };
}

function stripDuplicateSectionHeading(text: string, sectionLabel: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  const normalizedLabel = sectionLabel.replace(/\s+/g, "");
  const firstLine = lines[0].replace(/^#+\s*/, "").replace(/[:：]$/, "").replace(/\s+/g, "");
  return (firstLine === normalizedLabel ? lines.slice(1) : lines).join("\n");
}

const RESUME_ACTION_VERB_PATTERN = /(?:主导|负责|推动|搭建|设计|拆解|定义|协调|拉通|输出|落地|迭代|验证|优化|复盘|分析|制定|梳理|沉淀|对齐|跟进|参与)/;

function splitLongResumeLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length <= 120 || looksLikeHeadingLine(trimmed)) return [trimmed].filter(Boolean);

  const headingSplit = (() => {
    const verbMatch = trimmed.match(RESUME_ACTION_VERB_PATTERN);
    if (!verbMatch || typeof verbMatch.index !== "number") return null;
    const prefix = trimmed.slice(0, verbMatch.index).trim();
    const suffix = trimmed.slice(verbMatch.index).trim();
    const prefixLooksLikeHeading = prefix.length >= 12
      && prefix.length <= 120
      && (/\d{4}\s*(?:[./\-年]|至)/.test(prefix) || /公司|学校|项目|团队|部门|岗位|实习|产品|运营/.test(prefix));
    return prefixLooksLikeHeading && suffix.length >= 24 ? [prefix, suffix] : null;
  })();

  const linesToSplit = headingSplit ?? [trimmed];
  const result: string[] = [];

  for (const item of linesToSplit) {
    if (item.length <= 120 || looksLikeHeadingLine(item)) {
      result.push(item);
      continue;
    }

    const sentences = item
      .replace(/([。；;])\s*/g, "$1\n")
      .replace(/\s+(?=(?:主导|负责|推动|搭建|设计|拆解|定义|协调|拉通|输出|落地|迭代|验证|优化|复盘|分析|制定|梳理|沉淀|对齐|跟进|参与))/g, "\n")
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (sentences.length <= 1) {
      result.push(item);
      continue;
    }

    let buffer = "";
    for (const sentence of sentences) {
      if (buffer && `${buffer}${sentence}`.length > 96) {
        result.push(buffer);
        buffer = sentence;
      } else {
        buffer = `${buffer}${sentence}`;
      }
    }
    if (buffer) result.push(buffer);
  }

  return result;
}

function splitResumeLines(text: string) {
  const normalized = text
    .replace(/\r/g, "")
    .replace(/(\S)\s*[•●]\s+/g, "$1\n- ")
    .replace(/(\n)\s*[•·●]\s*/g, "$1- ")
    .replace(/([。；;])\s*(?=[^-#\n])/g, "$1\n")
    .replace(/\s+(?=(?:[-*]\s+|[•·●]\s+|\d+[.、]\s*))/g, "\n");

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => splitLongResumeLine(line));

  if (lines.length > 1) return lines;

  const [onlyLine] = lines;
  if (!onlyLine || onlyLine.length <= 150) return lines;

  const sentences = onlyLine
    .split(/(?<=[。；;])\s*/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (sentences.length <= 1) return lines;

  const chunks: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    if (buffer && `${buffer}${sentence}`.length > 90) {
      chunks.push(buffer);
      buffer = sentence;
    } else {
      buffer = `${buffer}${sentence}`;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

function looksLikeHeadingLine(line: string) {
  if (!line) return false;
  if (/^[-•·●]\s*/.test(line)) return false;
  const hasSeparator = /[·•｜|]|\s·\s|\s\|\s/.test(line) || /[-/]\s*(?:至今|present|Present|\d{4})/.test(line);
  const hasDate = /\d{4}\s*(?:[./\-年]|至)/.test(line);
  return hasSeparator && hasDate && line.length <= 120;
}

function isCompactListSection(sectionKey: string, sectionLabel: string) {
  return ["skills", "awards", "certifications"].includes(sectionKey)
    || /(技能|工具|技术栈|证书|认证|奖项|荣誉|语言|英语|四六级|CET)/i.test(sectionLabel);
}

function isExperienceLikeRewriteSection(sectionKey: string, sectionLabel: string) {
  return ["experience", "project", "projects", "work", "internship", "campusExperience"].includes(sectionKey)
    || /(经历|项目|实习|工作|任职|实践|校园|社团)/.test(sectionLabel);
}

function normalizeResumeBulletLine(line: string, shouldBullet: boolean) {
  const normalized = line
    .replace(/^[•·●]\s*/, "- ")
    .replace(/^[-*]\s*/, "- ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  if (!shouldBullet) return normalized;
  if (looksLikeHeadingLine(normalized)) return normalized.replace(/^-\s*/, "");
  return normalized.startsWith("- ") ? normalized : `- ${normalized}`;
}

function sanitizeRewriteText(raw: string, options: { allowSectionHeading?: boolean } = {}) {
  if (!raw) return "";
  let text = raw.replace(/\r/g, "");
  text = text.replace(/\\r\\n|\\r|\\n/g, "\n");
  text = text.replace(/(?<!\\)\\n/g, "\n");
  text = text.replace(/\\\\/g, "");
  if (!options.allowSectionHeading) {
    text = text.replace(/^\s*#{1,6}\s+/gm, "");
    text = text.replace(/(^|[^\\])(#{1,6})\s+/g, "$1");
  } else {
    text = text.replace(/^\s*#{3,6}\s+/gm, "");
  }
  text = text.replace(/\*{2,3}([^*\n]+)\*{2,3}/g, "$1");
  text = text.replace(/(?<!^)\*([^*\n]+)\*/gm, "$1");
  text = text.replace(/^\s*[-*_]{3,}\s*$/gm, "");
  text = text.replace(/\|/g, "·");
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, "");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function formatRewrittenSectionText(sectionKey: string, sectionLabel: string, text: string) {
  const cleaned = sanitizeRewriteText(text);
  const shouldBullet = isExperienceLikeRewriteSection(sectionKey, sectionLabel) && !isCompactListSection(sectionKey, sectionLabel);
  const withoutHeading = stripDuplicateSectionHeading(cleaned, sectionLabel);
  const rawLines = splitResumeLines(withoutHeading)
    .map((line) => normalizeResumeBulletLine(line, shouldBullet))
    .filter(Boolean);

  return rawLines.length ? rawLines.join("\n") : cleaned.trim();
}

function buildSafeFallbackRewriteText(block: { sectionKey: ResumeModuleKey; sectionLabel: string; content: string }) {
  const formatted = formatRewrittenSectionText(block.sectionKey, block.sectionLabel, block.content) || block.content;
  const lines = formatted.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const experienceLikeSection = isExperienceLikeRewriteSection(block.sectionKey, block.sectionLabel)
    && !isCompactListSection(block.sectionKey, block.sectionLabel);

  return lines.map((line) => {
    const isBullet = /^[-•·●]\s*/.test(line);
    const content = line.replace(/^[-•·●]\s*/, "").trim();
    if (!experienceLikeSection || looksLikeHeadingLine(content)) {
      return line;
    }
    if (/(负责|主导|参与|推动|输出|完成|设计|分析|优化|落地|协同|跟进|整理|梳理)/.test(content)) {
      return isBullet ? `- ${content}` : line;
    }
    return `- 参与${content}，沉淀为可迁移的产品分析、协同推进和结果复盘经验。`;
  }).join("\n");
}

function formatFullRewrittenResume(sections: RewriteSection[]) {
  return sections
    .map((section) => {
      const body = formatRewrittenSectionText(section.sectionKey, section.sectionLabel, section.rewrittenText);
      return body ? `## ${section.sectionLabel}\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function normalizeFullRewrittenResumeText(text: string) {
  return sanitizeRewriteText(text)
    .replace(/```(?:json|markdown|md)?/gi, "")
    .replace(/```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeResumeSectionHeading(line: string) {
  const normalized = normalizeResumeHeading(line);
  if (!normalized || normalized.length > 22) return false;
  if (/^[-•·●]/.test(line.trim())) return false;
  if (/[，,。；;！？!?]/.test(normalized)) return false;
  return Boolean(resolveResumeSectionMeta(normalized))
    || /(摘要|优势|信息|背景|经历|经验|项目|实践|技能|工具|证书|认证|奖项|荣誉|作品|其他)$/.test(normalized);
}

function sectionKeyFromLabelAndContent(label: string, content: string, index: number) {
  const resolved = resolveResumeSectionMeta(label);
  if (resolved) return resolved.sectionKey;
  return inferResumeSectionMeta(`${label}\n${content}`, index).sectionKey;
}

function buildRewriteSectionsFromFullText(fullText: string, originalBlocks: ResumeRewriteBlock[], originalResumeText: string): RewriteSection[] {
  const groups: Array<{ label: string; content: string[] }> = [];
  let current: { label: string; content: string[] } | null = null;

  for (const rawLine of fullText.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (looksLikeResumeSectionHeading(line)) {
      if (current?.content.length) groups.push(current);
      current = { label: normalizeResumeHeading(line), content: [] };
      continue;
    }
    if (!current) current = { label: "岗位定制简历", content: [] };
    current.content.push(line);
  }
  if (current?.content.length) groups.push(current);

  const sourceGroups = groups.length ? groups : [{ label: "岗位定制简历", content: [fullText] }];
  return sourceGroups.map((group, index) => {
    const rewrittenText = group.content.join("\n");
    const sectionKey = sectionKeyFromLabelAndContent(group.label, rewrittenText, index);
    const originalText = originalBlocks.find((block) => block.sectionKey === sectionKey)?.content
      ?? originalBlocks[index]?.content
      ?? originalResumeText;
    return {
      sectionKey,
      sectionLabel: group.label,
      originalText,
      rewrittenText,
      explanation: "由全文改写链路统一生成，系统按标题轻量拆分用于展示和导出。",
      targetDimensions: [],
    };
  });
}

function getFullRewriteFormatIssue(fullText: string) {
  const normalized = normalizeFullRewrittenResumeText(fullText);
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!normalized || normalized.replace(/\s+/g, "").length < 80) {
    return "全文改写内容过短";
  }
  if (/\\n|\\r|(?:^|[^\\])\\\\(?!\\)/.test(fullText)) {
    return "全文改写包含字面换行符或反斜杠";
  }
  if (lines.filter(looksLikeResumeSectionHeading).length < 2) {
    return "全文改写缺少清晰的简历模块标题";
  }
  for (const line of lines) {
    if (looksLikeResumeSectionHeading(line)) continue;
    const content = line.replace(/^-\s*/, "").trim();
    if (content.length > 220) {
      return `全文改写存在过长单行：${content.slice(0, 48)}`;
    }
    const incompleteIssue = getIncompleteResumeLineIssue(content);
    if (incompleteIssue) return incompleteIssue;
  }
  return null;
}

function getIncompleteResumeLineIssue(line: string) {
  const text = line.replace(/^-\s*/, "").trim();
  if (!text) return "存在空行或空 bullet";
  if (/[，,、；;：:]$/.test(text)) return `语句结尾不完整：${text.slice(0, 48)}`;
  if (/(通过|基于|围绕|包括|以及|并|和|及|或|与|为|将|对)$/.test(text)) return `语句疑似截断：${text.slice(0, 48)}`;
  if (/^(并|和|及|以及|同时|其中|从而|因此|此外)[，,、\s]*/.test(text)) return `语句缺少主动作：${text.slice(0, 48)}`;

  const pairs: Array<[string, string]> = [["（", "）"], ["(", ")"], ["“", "”"], ["《", "》"], ["【", "】"]];
  for (const [open, close] of pairs) {
    if (text.split(open).length !== text.split(close).length) {
      return `括号或引号未闭合：${text.slice(0, 48)}`;
    }
  }

  return null;
}

function getSectionReadabilityIssue(section: RewriteSection) {
  const formatted = formatRewrittenSectionText(section.sectionKey, section.sectionLabel, section.rewrittenText);
  const lines = formatted.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => line.startsWith("- "));
  const originalLength = section.originalText.replace(/\s+/g, "").length;
  const compactListSection = isCompactListSection(section.sectionKey, section.sectionLabel);
  const experienceLikeSection = isExperienceLikeRewriteSection(section.sectionKey, section.sectionLabel)
    && !compactListSection;
  const shouldHaveBullets = experienceLikeSection && originalLength > 120;

  if (shouldHaveBullets && bulletLines.length < 1 && lines.length < 3) {
    return "经历类模块缺少基本换行或 bullet 结构";
  }

  for (const line of lines) {
    const maxLineLength = compactListSection ? 190 : 150;
    if (line.length > maxLineLength && !looksLikeHeadingLine(line)) {
      return `存在过长单行，影响简历可读性：${line.slice(0, 48)}`;
    }
    const incompleteIssue = getIncompleteResumeLineIssue(line);
    if (incompleteIssue) return incompleteIssue;
  }

  for (const line of bulletLines) {
    const text = line.replace(/^-\s*/, "").trim();
    if (!compactListSection && text.length < 12) {
      return `bullet 信息量不足：${text}`;
    }
  }

  return null;
}

function getRewriteQualityIssue(section: RewriteSection) {
  const originalLength = section.originalText.replace(/\s+/g, "").length;
  const rewrittenLength = section.rewrittenText.replace(/\s+/g, "").length;
  const shouldBullet = !["profile", "education", "skills", "awards", "certifications"].includes(section.sectionKey);
  const bulletCount = (section.rewrittenText.match(/^\s*[-•·*]\s+/gm) ?? []).length;
  const newlineCount = (section.rewrittenText.match(/\n/g) ?? []).length;

  if (shouldBullet && originalLength > 140 && bulletCount < 1 && newlineCount < 2) {
    return "经历类模块没有形成清晰项目符号或换行结构";
  }

  if (originalLength > 80 && rewrittenLength > originalLength * 2.8) {
    return "改写结果明显过长，像是在简单扩写原文";
  }

  if (/[^\n]{260,}/.test(section.rewrittenText)) {
    return "改写结果存在过长单行，可读性不符合简历格式";
  }

  const markdownNoise = /(^|\n)\s{0,3}#{1,6}\s+|(\*\*|^\s*\*\s|---{2,})/m;
  if (markdownNoise.test(section.rewrittenText)) {
    return "改写结果包含未清理的 Markdown 标题/强调符号（##/**/---）";
  }

  if (/\\n|\\r|(?:^|[^\\])\\\\(?!\\)/.test(section.rewrittenText)) {
    return "改写结果包含字面换行符或反斜杠，格式不合格";
  }

  const readabilityIssue = getSectionReadabilityIssue(section);
  if (readabilityIssue) {
    return readabilityIssue;
  }

  const originalDates = extractDateRanges(section.originalText);
  if (originalDates.length) {
    const normalizeDate = (s: string) => s.replace(/[年./\-月日\s]/g, "");
    const rewrittenNormalized = normalizeDate(section.rewrittenText);
    const rewrittenSansSpace = section.rewrittenText.replace(/\s+/g, "");
    const missingDates = originalDates.filter((date) => {
      const compact = date.replace(/\s+/g, "");
      if (rewrittenSansSpace.includes(compact) || section.rewrittenText.includes(date)) {
        return false;
      }
      const normalizedDigits = normalizeDate(date);
      if (normalizedDigits.length >= 4 && rewrittenNormalized.includes(normalizedDigits)) {
        return false;
      }
      return true;
    });
    if (missingDates.length) {
      return `改写丢失了原文时间/日期：${missingDates.slice(0, 3).join("、")}`;
    }
  }

  return null;
}

function salvageInterviewQuestionsJSON(raw: string): { questions: unknown[] } | null {
  if (!raw) return null;
  const text = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "");
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  let arrayBlock = "";
  if (arrStart !== -1 && arrEnd > arrStart) {
    arrayBlock = text.slice(arrStart, arrEnd + 1);
  } else if (arrStart !== -1) {
    arrayBlock = text.slice(arrStart);
  } else {
    return null;
  }

  const questions: unknown[] = [];
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < arrayBlock.length; i += 1) {
    const ch = arrayBlock[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") {
      if (depth === 0) objectStart = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        const objStr = arrayBlock.slice(objectStart, i + 1);
        try {
          const parsed = JSON.parse(objStr) as Record<string, unknown>;
          if (parsed && typeof parsed === "object" && typeof parsed.question === "string") {
            questions.push(parsed);
          }
        } catch {
          // ignore individual malformed object
        }
        objectStart = -1;
      }
    }
  }

  if (questions.length === 0) return null;
  return { questions };
}

function buildFallbackInterviewQuestions(input: {
  questionCount?: number;
  jobTitle?: string | null;
  roleSpecialty?: string | null;
  userIdentity: string;
  resumeText: string;
  jobDescriptionText: string;
  includeCategories?: InterviewQuestionCategory[];
}): InterviewQuestionItem[] {
  const count = Math.max(6, Math.min(input.questionCount || 10, 12));
  const context = buildGenerationContext(input);
  const resumeEvidence = context.resumeEvidenceLines.length
    ? context.resumeEvidenceLines
    : ["简历中未抽取到足够具体的项目证据"];
  const jdEvidence = context.jdEvidenceLines.length
    ? context.jdEvidenceLines
    : [input.jobTitle ?? "目标岗位要求"];
  const pick = (items: string[], index: number, max = 52) => items[index % items.length].replace(/\s+/g, " ").slice(0, max);
  const emptyDetail = {
    answerFramework: "",
    sampleAnswer: "",
    keyPoints: [],
    pitfalls: [],
  };
  const baseQuestions: Array<Omit<InterviewQuestionItem, "id">> = [
    {
      category: "experience_probe",
      question: `你简历里写到“${pick(resumeEvidence, 0)}”，这件事里你本人做的关键判断是什么，而不是团队自然推进的结果？`,
      whyAsked: `面试官会用这题验证经历真实性和个人贡献，防止“${pick(resumeEvidence, 0, 34)}”只是参与描述，无法支撑 JD 里的“${pick(jdEvidence, 0, 34)}”。`,
      ...emptyDetail,
    },
    {
      category: "aipm_professional",
      question: `JD 里强调“${pick(jdEvidence, 1)}”，如果把你“${pick(resumeEvidence, 1)}”迁移过去，你会先验证用户问题、模型边界还是业务指标？为什么？`,
      whyAsked: "这题会筛掉只会背 AI 产品概念的人，重点看你能否把简历里的真实经历迁移到目标岗位，并说清取舍顺序。",
      ...emptyDetail,
    },
    {
      category: "scenario_design",
      question: `如果面试官把“${pick(jdEvidence, 2)}”设计成现场 case，你会如何用“${pick(resumeEvidence, 2)}”里的方法拆成目标、约束、方案和验收？`,
      whyAsked: "这题看现场结构化能力，不是问标准答案；面试官会观察你能否把经历里的方法论抽出来，而不是复述简历。",
      ...emptyDetail,
    },
    {
      category: "behavioral",
      question: `围绕“${pick(resumeEvidence, 3)}”，如果资源只够保留一个目标，你会砍掉什么、保留什么？当时你怎么说服相关方？`,
      whyAsked: "面试官会借这题判断项目推进中的优先级、冲突处理和沟通质量，防止候选人只讲执行、不讲判断。",
      ...emptyDetail,
    },
    {
      category: "aipm_professional",
      question: `你如何把“${pick(jdEvidence, 3)}”拆成可验收指标？请不要只说点击率，要说明业务、体验、模型质量和风险兜底各看什么。`,
      whyAsked: "这题会验证你是否具备 AI 产品经理的指标分层能力，而不是把普通产品指标硬套到 AI 场景。",
      ...emptyDetail,
    },
    {
      category: input.userIdentity === "career_changer" ? "career_switch_motivation" : "experience_probe",
      question: input.userIdentity === "career_changer"
        ? `你从${input.roleSpecialty ?? "当前方向"}转向 ${input.jobTitle ?? "AI 产品经理"}，简历里哪一条证据能证明这不是临时追热点？`
        : `如果只能选“${pick(resumeEvidence, 4)}”作为主打经历，你会怎样证明它比其他经历更贴近“${pick(jdEvidence, 4)}”？`,
      whyAsked: "面试官会验证动机稳定性和证据选择能力，重点看候选人能否主动承认缺口并给出可信补齐路径。",
      ...emptyDetail,
    },
  ];

  const pool = input.includeCategories?.length
    ? baseQuestions.filter((question) => input.includeCategories?.includes(question.category))
    : baseQuestions;
  const safePool = pool.length > 0 ? pool : baseQuestions;

  return Array.from({ length: count }, (_, index) => {
    const item = safePool[index % safePool.length];
    return {
      ...item,
      id: `iq_${String(index + 1).padStart(3, "0")}`,
    };
  });
}

const AIPM_DIMENSION_META: Array<{
  dimensionId: AIPMDimensionId;
  dimensionLabel: string;
  keywords: RegExp;
  remedy: string;
}> = [
  {
    dimensionId: "ai_understanding",
    dimensionLabel: "AI 技术理解力",
    keywords: /AI|大模型|模型|算法|机器学习|深度学习|RAG|Prompt|智能|识别|推荐/i,
    remedy: "用一个 AI 产品案例补充模型能力边界、输入输出和效果评估说明",
  },
  {
    dimensionId: "product_design",
    dimensionLabel: "产品设计力",
    keywords: /产品|需求|原型|PRD|用户|体验|功能|流程|交互|调研/,
    remedy: "整理一个需求拆解案例，补充用户问题、方案设计和取舍依据",
  },
  {
    dimensionId: "data_driven",
    dimensionLabel: "数据驱动力",
    keywords: /数据|指标|转化|增长|留存|点击|漏斗|分析|SQL|看板/i,
    remedy: "补充一段用数据定位问题或验证效果的项目复盘",
  },
  {
    dimensionId: "project_execution",
    dimensionLabel: "项目推进力",
    keywords: /推进|协调|跨部门|排期|上线|交付|落地|迭代|复盘|负责/,
    remedy: "准备一个跨角色推进项目的案例，说明目标、阻塞和推动动作",
  },
  {
    dimensionId: "business_sense",
    dimensionLabel: "商业感知力",
    keywords: /业务|商业|收入|成本|效率|客户|市场|转化|增长|ROI/i,
    remedy: "补充项目与业务目标的关系，说明为什么值得做以及怎么衡量",
  },
  {
    dimensionId: "ai_application",
    dimensionLabel: "AI 应用落地力",
    keywords: /应用|智能体|Agent|RAG|知识库|工作流|自动化|生成|识别|推荐/i,
    remedy: "做一个小型 AI 应用 Demo，并记录场景、数据、效果和风险兜底",
  },
  {
    dimensionId: "communication",
    dimensionLabel: "沟通表达力",
    keywords: /沟通|汇报|协作|访谈|培训|文档|表达|对齐|复盘|宣讲/,
    remedy: "把一段协作经历整理成 STAR 案例，突出沟通对象和达成结果",
  },
];

const AIPM_DIMENSION_META_MAP = new Map(
  AIPM_DIMENSION_META.map((dimension) => [dimension.dimensionId, dimension])
);

function inferDecisionGap(requiredLevel: DimensionAnalysis["requiredLevel"], currentLevel: DimensionAnalysis["currentLevel"]): DimensionGap {
  if (currentLevel >= requiredLevel) return "met";
  if (currentLevel + 1 >= requiredLevel) return "close";
  return "insufficient";
}

function isMissingEvidenceText(text: string) {
  return /未找到|没有证据|暂无证据|证据不足|未体现|未提供/.test(text);
}

function normalizeDecisionDimension(
  dimension: Partial<DimensionAnalysis> | undefined,
  fallback: DimensionAnalysis,
): DimensionAnalysis {
  const dimensionId = (dimension?.dimensionId && AIPM_DIMENSION_META_MAP.has(dimension.dimensionId))
    ? dimension.dimensionId
    : fallback.dimensionId;
  const meta = AIPM_DIMENSION_META_MAP.get(dimensionId) ?? AIPM_DIMENSION_META_MAP.get(fallback.dimensionId);
  const toLevel = (value: unknown, fallbackLevel: DimensionAnalysis["requiredLevel"]) => {
    const numeric = Number(value);
    return (Number.isFinite(numeric) ? Math.max(0, Math.min(3, numeric)) : fallbackLevel) as DimensionAnalysis["requiredLevel"];
  };
  const requiredLevel = toLevel(dimension?.requiredLevel, fallback.requiredLevel);
  const currentLevel = toLevel(dimension?.currentLevel, fallback.currentLevel);
  const levelsLookEmpty = requiredLevel === 0 && currentLevel === 0 && fallback.requiredLevel > 0;
  const rawGap = ["met", "close", "insufficient"].includes(dimension?.gap ?? "")
    ? (dimension?.gap as DimensionGap)
    : fallback.gap;
  const remedyActions = Array.isArray(dimension?.remedyActions)
    ? dimension.remedyActions.filter((action): action is string => typeof action === "string" && action.trim().length > 8).slice(0, 3)
    : [];
  const evidence = typeof dimension?.evidence === "string" && dimension.evidence.trim().length >= 20
    ? dimension.evidence.trim()
    : fallback.evidence;
  const normalizedRequiredLevel = levelsLookEmpty ? fallback.requiredLevel : requiredLevel;
  const normalizedCurrentLevel = isMissingEvidenceText(evidence)
    ? 0
    : levelsLookEmpty
      ? fallback.currentLevel
      : currentLevel;
  const normalizedGap = isMissingEvidenceText(evidence)
    ? "insufficient"
    : rawGap === inferDecisionGap(normalizedRequiredLevel, normalizedCurrentLevel)
      ? rawGap
      : inferDecisionGap(normalizedRequiredLevel, normalizedCurrentLevel);

  return {
    dimensionId,
    dimensionLabel: dimension?.dimensionLabel || meta?.dimensionLabel || fallback.dimensionLabel,
    requiredLevel: normalizedRequiredLevel,
    currentLevel: normalizedCurrentLevel,
    gap: normalizedGap,
    evidence,
    remedyActions: remedyActions.length > 0
      ? remedyActions
      : normalizedGap === "met"
        ? []
        : fallback.remedyActions.length
          ? fallback.remedyActions
          : [meta?.remedy || "补充一个可量化、可复盘、可在面试中展开说明的项目案例"],
  };
}

function normalizeDecisionDimensions(dimensions: unknown, fallbackReport: DecisionReport): DimensionAnalysis[] {
  const rawDimensions = Array.isArray(dimensions) ? dimensions as Array<Partial<DimensionAnalysis>> : [];
  return AIPM_DIMENSION_META.map((meta) => {
    const fallback = fallbackReport.dimensions.find((dimension) => dimension.dimensionId === meta.dimensionId)!;
    const modelDimension = rawDimensions.find((dimension) => dimension.dimensionId === meta.dimensionId);
    return normalizeDecisionDimension(modelDimension, fallback);
  });
}

function hasConcreteReportValue(text: string) {
  const normalized = text.trim();
  if (normalized.length < 40) return false;
  const vaguePhrases = ["提升能力", "加强理解", "完善表达", "持续学习", "深入了解", "积累经验", "多做准备"];
  const actionSignals = ["输出物", "验收标准", "素材卡", "STAR", "bullet", "对照表", "复盘", "指标", "取舍", "本人动作", "证据"];
  return actionSignals.some((signal) => normalized.includes(signal))
    && vaguePhrases.filter((phrase) => normalized.includes(phrase)).length <= 1;
}

function tokenizeChineseEvidence(text: string) {
  const compact = text.replace(/\s+/g, "");
  const tokens = new Set<string>();
  const explicitTokens = compact.match(/[A-Za-z][A-Za-z0-9+#._-]{1,}|[0-9]+(?:\.[0-9]+)?%?|[\u4e00-\u9fa5]{2,8}/g) ?? [];
  for (const token of explicitTokens) {
    if (/^(负责|参与|协助|项目|经历|岗位|要求|能力|产品|用户|业务|数据|模型|简历|面试|公司|团队|相关|当前)$/.test(token)) continue;
    tokens.add(token);
  }
  return tokens;
}

function hasSourceAnchoredContent(text: string, sourceText: string, minimumHits = 2) {
  const sourceTokens = tokenizeChineseEvidence(sourceText);
  if (!sourceTokens.size) return false;
  let hits = 0;
  const normalized = text.replace(/\s+/g, "");
  for (const token of sourceTokens) {
    if (token.length >= 2 && normalized.includes(token)) {
      hits += 1;
      if (hits >= minimumHits) return true;
    }
  }
  return false;
}

function hasSourceAnchoredRiskValue(text: string, sourceText: string) {
  return hasStructuredRiskValue(text)
    && hasSourceAnchoredContent(text, sourceText, 2)
    && !/职责列表|最薄弱的是|如果负责一个 AI 功能|你理解的 AI 产品经理和普通产品经理/.test(text);
}

function hasStructuredRiskValue(text: string) {
  const requiredBlocks = ["卡点原因", "证据缺口", "可能追问", "补救方向"];
  return requiredBlocks.every((block) => text.includes(`${block}：`) || text.includes(`${block}:`))
    && hasConcreteReportValue(text)
    && !/可能追问[:：][^｜\n]*(、|；|;).*(\?|？)/.test(text);
}

function isDecisionReportComplete(report: DecisionReport) {
  const dimensionsComplete = report.dimensions.length === AIPM_DIMENSION_META.length
    && report.dimensions.every((dimension) =>
      Boolean(dimension.dimensionLabel)
      && typeof dimension.evidence === "string"
      && dimension.evidence.trim().length >= 45
      && hasConcreteReportValue(dimension.evidence)
      && (dimension.gap !== "met" || !isMissingEvidenceText(dimension.evidence))
      && (dimension.gap === "met" || (
        dimension.remedyActions.length >= 2
        && dimension.remedyActions.every((action) => action.trim().length >= 30 && hasConcreteReportValue(action))
      ))
      && !(dimension.requiredLevel === 0 && dimension.currentLevel === 0)
    );
  const risksComplete = Boolean(
    hasStructuredRiskValue(report.interviewRoundPrediction?.resumeScreening?.risk ?? "")
    && hasStructuredRiskValue(report.interviewRoundPrediction?.firstRound?.weakness ?? "")
    && hasStructuredRiskValue(report.interviewRoundPrediction?.secondRound?.weakness ?? "")
    && hasStructuredRiskValue(report.interviewRoundPrediction?.hrRound?.risk ?? "")
    && (report.interviewRoundPrediction?.firstRound?.likelyQuestions?.length ?? 0) >= 2
    && (report.interviewRoundPrediction?.secondRound?.likelyQuestions?.length ?? 0) >= 2
  );
  const planComplete = (report.twoWeekPlan?.week1?.length ?? 0) >= 3
    && (report.twoWeekPlan?.week2?.length ?? 0) >= 3
    && [...(report.twoWeekPlan?.week1 ?? []), ...(report.twoWeekPlan?.week2 ?? [])].every((action) =>
      typeof action.title === "string"
      && action.title.trim().length >= 4
      && typeof action.reasonHook === "string"
      && action.reasonHook.trim().length >= 20
      && Array.isArray(action.steps)
      && action.steps.length >= 3
      && action.steps.every((step) => typeof step === "string" && step.trim().length >= 12)
      && typeof action.deliverable === "string"
      && action.deliverable.trim().length >= 6
      && typeof action.acceptance === "string"
      && action.acceptance.trim().length >= 10
      && AIPM_DIMENSION_META_MAP.has(action.targetDimension)
    );

  return dimensionsComplete
    && risksComplete
    && planComplete
    && typeof report.oneLiner === "string"
    && report.oneLiner.trim().length >= 40
    && Number.isFinite(report.overallMatchScore);
}

type DecisionReportArtifactsInput = {
  sessionId: string;
  resumeText: string;
  jobDescriptionText: string;
  jobTitle?: string | null;
  userIdentity: string;
  currentRole?: string | null;
};

function getRecommendationFromScore(overallMatchScore: number): RecommendationLevel {
  return overallMatchScore >= 72
    ? "recommended"
    : overallMatchScore >= 52
      ? "cautious"
      : "not_recommended";
}

function getRecommendationLabel(recommendation: RecommendationLevel) {
  return recommendation === "recommended"
    ? "建议投递"
    : recommendation === "cautious"
      ? "谨慎投递"
      : "暂不建议";
}

function normalizeForKeywordMatch(text: string) {
  return text.replace(/\s+/g, "").toLowerCase();
}

function countDimensionKeywordHits(text: string, dimensionId: AIPMDimensionId) {
  const normalized = normalizeForKeywordMatch(text);
  const dimension = AIPM_DIMENSIONS.find((item) => item.id === dimensionId);
  if (!dimension || !normalized) return 0;
  return dimension.jdKeywords.filter((keyword) => normalized.includes(keyword.replace(/\s+/g, "").toLowerCase())).length;
}

function calculateDecisionOverallScore(dimensions: DimensionAnalysis[], input?: Pick<DecisionReportArtifactsInput, "resumeText" | "jobDescriptionText">) {
  if (!dimensions.length) return 52;

  const metCount = dimensions.filter((dimension) => dimension.gap === "met").length;
  const closeCount = dimensions.filter((dimension) => dimension.gap === "close").length;
  const insufficientCount = dimensions.filter((dimension) => dimension.gap === "insufficient").length;
  let totalWeight = 0;
  let weightedScore = 0;

  for (const dimension of dimensions) {
    const jdHits = input ? countDimensionKeywordHits(input.jobDescriptionText, dimension.dimensionId) : 0;
    const resumeHits = input ? countDimensionKeywordHits(input.resumeText, dimension.dimensionId) : 0;
    const jdDemandWeight = jdHits >= 4 ? 1.35 : jdHits >= 2 ? 1.18 : 1;
    const requiredLevel = Math.max(dimension.requiredLevel, jdHits >= 4 ? 3 : jdHits >= 2 ? 2 : 1);
    const currentLevel = Math.max(0, Math.min(3, dimension.currentLevel));
    const levelRatio = Math.max(0, Math.min(1.08, currentLevel / requiredLevel));
    const levelScore = 34 + levelRatio * 52;
    const gapScore = dimension.gap === "met"
      ? 86
      : dimension.gap === "close"
        ? 68
        : 38;
    const keywordCoverage = input
      ? Math.max(0, Math.min(1, resumeHits / Math.max(jdHits, 1)))
      : 0.5;
    const keywordAdjustment = input
      ? Math.round((keywordCoverage - 0.45) * 16) - (jdHits >= 3 && resumeHits === 0 ? 8 : 0)
      : 0;
    const evidenceAdjustment = isMissingEvidenceText(dimension.evidence)
      ? -7
      : hasConcreteReportValue(dimension.evidence)
        ? 4
        : -2;
    const dimensionScore = Math.max(
      20,
      Math.min(96, Math.round(levelScore * 0.46 + gapScore * 0.42 + keywordCoverage * 12 + keywordAdjustment + evidenceAdjustment)),
    );
    weightedScore += dimensionScore * jdDemandWeight;
    totalWeight += jdDemandWeight;
  }

  const averageScore = weightedScore / Math.max(totalWeight, 1);
  const score = Math.round(
    averageScore
    + metCount * 1.8
    + closeCount * 0.7
    - insufficientCount * 3.2
    + (metCount >= 4 ? 2 : 0)
    - (insufficientCount >= 4 ? 4 : 0),
  );

  return Math.max(28, Math.min(94, score));
}

function buildDecisionReportFromDimensions(
  input: DecisionReportArtifactsInput,
  dimensions: DimensionAnalysis[],
  overrides?: Partial<Pick<DecisionReport, "recommendation" | "recommendationLabel" | "oneLiner" | "overallMatchScore">>,
): DecisionReport {
  const context = buildGenerationContext(input);
  const evidencePool = context.resumeEvidenceLines.length ? context.resumeEvidenceLines : ["未找到相关经历"];
  const jdEvidencePool = context.jdEvidenceLines.length ? context.jdEvidenceLines : [clipInput(input.jobDescriptionText.replace(/\s+/g, " "), 90) || "未提供明确 JD 要求"];
  const selectEvidenceLine = (dimension: DimensionAnalysis, lines: string[], index: number, fallback: string) => {
    const meta = AIPM_DIMENSION_META_MAP.get(dimension.dimensionId);
    return lines.find((line) => meta?.keywords.test(line.replace(/\s+/g, ""))) ?? lines[index % lines.length] ?? fallback;
  };
  const summarizeLine = (line: string, maxLength = 96) => line.replace(/\s+/g, " ").trim().slice(0, maxLength);

  const overallMatchScore = overrides?.overallMatchScore ?? calculateDecisionOverallScore(dimensions, input);
  const recommendation = overrides?.recommendation ?? getRecommendationFromScore(overallMatchScore);
  const recommendationLabel = overrides?.recommendationLabel ?? getRecommendationLabel(recommendation);
  const weakDimensions = dimensions.filter((dimension) => dimension.gap !== "met").slice(0, 3);
  const primaryWeak = weakDimensions[0] ?? dimensions.find((dimension) => dimension.gap !== "met") ?? dimensions[0];
  const secondaryWeak = weakDimensions[1] ?? weakDimensions[0] ?? dimensions[1] ?? dimensions[0];
  const buildDeepRisk = (dimension: DimensionAnalysis, round: string, index: number) => {
    const resumeEvidence = summarizeLine(selectEvidenceLine(dimension, context.resumeEvidenceLines, index, dimension.evidence), 110);
    const jdEvidence = summarizeLine(selectEvidenceLine(dimension, jdEvidencePool, index, input.jobTitle ?? "目标岗位"), 100);
    return [
      `卡点原因：${round}会围绕 JD 里的“${jdEvidence}”验证${dimension.dimensionLabel}，但你当前最可用的简历证据只落在“${resumeEvidence}”，还不足以直接证明胜任。`,
      `证据缺口：已有证据能说明你接触过相关场景，但缺少本人职责边界、关键取舍、结果指标或模型/数据边界，面试官容易判断为参与度不清。`,
      `可能追问：围绕“${resumeEvidence.slice(0, 42)}”，你本人做过哪个关键判断，为什么这样取舍，最后用什么指标证明有效？`,
      `补救方向：把这段经历整理成 1 页 STAR 素材卡，必须补齐本人动作、取舍依据、结果指标和复盘结论，验收标准是 3 分钟内讲清。`,
    ].join("｜");
  };
  const buildPlanAction = (params: {
    dayRange: string;
    dimension: DimensionAnalysis;
    title: string;
    reasonHook: string;
    steps: string[];
    deliverable: string;
    acceptance: string;
    resources?: string[];
    templateSnippet?: string;
  }) => ({
    dayRange: params.dayRange,
    title: params.title,
    reasonHook: params.reasonHook,
    steps: params.steps,
    deliverable: params.deliverable,
    acceptance: params.acceptance,
    resources: params.resources,
    templateSnippet: params.templateSnippet,
    targetDimension: params.dimension.dimensionId,
    action: `${params.dayRange}｜任务：${params.title}｜输出物：${params.deliverable}｜验收标准：${params.acceptance}`,
  });

  return {
    sessionId: input.sessionId as DecisionReport["sessionId"],
    recommendation,
    recommendationLabel,
    oneLiner: overrides?.oneLiner || `${input.jobTitle ?? "AI 产品经理"}匹配度约 ${overallMatchScore} 分，优势集中在${dimensions.filter((d) => d.gap === "met").map((d) => d.dimensionLabel).slice(0, 2).join("、") || "已有经历"}，需重点补齐${weakDimensions.map((d) => d.dimensionLabel).join("、") || "岗位证据"}。`,
    overallMatchScore,
    dimensions,
    interviewRoundPrediction: {
      resumeScreening: {
        passRate: recommendation === "recommended" ? "high" : recommendation === "cautious" ? "medium" : "low",
        risk: weakDimensions.length
          ? [
              `卡点原因：筛选人会先用 JD 里的“${summarizeLine(jdEvidencePool[0], 96)}”匹配简历，风险集中在${weakDimensions.map((d) => d.dimensionLabel).join("、")}。`,
              `证据缺口：简历里最可引用的是“${summarizeLine(evidencePool[0], 110)}”，但这条还没有同时写清场景、本人动作、结果指标和岗位关键词，容易被判断为相关性不足。`,
              `可能追问：如果只给你 30 秒，你会如何用“${summarizeLine(evidencePool[0], 42)}”证明自己匹配“${summarizeLine(jdEvidencePool[0], 34)}”？`,
              "补救方向：把最相关的 1-2 个项目改写成岗位关键词可检索 bullet，并补一份 1 页项目素材卡，验收标准是每条都有动作和结果。",
            ].join("｜")
          : [
              `卡点原因：整体经历和岗位方向有匹配，但筛选人会优先核对“${summarizeLine(jdEvidencePool[0], 96)}”，如果卖点不前置仍会被弱化。`,
              `证据缺口：简历中可用证据是“${summarizeLine(evidencePool[0], 110)}”，还需要把用户问题、本人动作、产品/数据/AI 方法和最终产出压缩到前半屏。`,
              `可能追问：你会如何用“${summarizeLine(evidencePool[0], 42)}”对应 JD 里的“${summarizeLine(jdEvidencePool[0], 34)}”？`,
              "补救方向：重排简历核心经历，把最强证据前置，并为每段经历补 1 条结果或可复盘结论，验收标准是 30 秒内可读到。",
            ].join("｜"),
      },
      firstRound: {
        likelyQuestions: [
          `围绕“${summarizeLine(evidencePool[0], 48)}”，你在里面具体负责什么，哪个判断最能体现${primaryWeak.dimensionLabel}？`,
          `JD 提到“${summarizeLine(jdEvidencePool[0], 48)}”，你会如何用现有经历证明自己能定义用户问题、产品边界和验收指标？`,
        ],
        weakness: buildDeepRisk(primaryWeak, "一面", 0),
      },
      secondRound: {
        likelyQuestions: [
          `如果基于“${summarizeLine(evidencePool[1] ?? evidencePool[0], 48)}”继续投入资源，你会用哪些业务指标判断值得做？`,
          `目标岗位要求“${summarizeLine(jdEvidencePool[1] ?? jdEvidencePool[0], 48)}”，你会怎样用过往经历证明${secondaryWeak.dimensionLabel}可以迁移？`,
        ],
        weakness: buildDeepRisk(secondaryWeak, "二面", 1),
      },
      hrRound: {
        risk: input.userIdentity === "career_changer"
          ? [
              `卡点原因：HR 会把你的当前岗位“${input.currentRole ?? "未提供"}”和目标“${input.jobTitle ?? "AI 产品经理"}”连起来看，判断转向是不是临时追热点。`,
              `证据缺口：简历里最能支撑迁移的是“${summarizeLine(evidencePool[0], 110)}”，但还缺少转向原因、已做验证和未来 3 个月计划。`,
              `可能追问：你为什么从“${input.currentRole ?? "当前方向"}”转向“${input.jobTitle ?? "AI 产品经理"}”，这段经历如何证明不是从零开始？`,
              "补救方向：准备 60 秒转型动机口径，按过去积累、转向原因、已做验证、下一步计划组织，验收标准是录音不超过 90 秒。",
            ].join("｜")
          : [
              `卡点原因：HR 会核对你是否理解“${input.jobTitle ?? "AI 产品经理"}”的真实工作，而不是只会复述 JD 里的“${summarizeLine(jdEvidencePool[0], 70)}”。`,
              `证据缺口：简历里最可用的是“${summarizeLine(evidencePool[0], 110)}”，但需要补出用户问题、模型能力边界、数据指标、上线风险和协作推进。`,
              `可能追问：你会如何用“${summarizeLine(evidencePool[0], 42)}”证明自己理解目标岗位的真实工作？`,
              "补救方向：准备 60 秒职业定位口径，用 1 个项目说明你如何处理产品不确定性，验收标准是包含 1 个指标和 1 个复盘。",
            ].join("｜"),
      },
    },
    twoWeekPlan: {
      week1: [
        buildPlanAction({
          dayRange: "Day 1-2",
          dimension: primaryWeak,
          title: `拆解 JD，定位${primaryWeak.dimensionLabel}缺口`,
          reasonHook: `你在“${primaryWeak.dimensionLabel}”上被判定为${primaryWeak.gap === "insufficient" ? "证据缺失" : "边缘达标"}，招聘官最可能卡这个点。`,
          steps: [
            `把 ${input.jobTitle ?? "目标岗位"} JD 全文按“职责/要求/加分项”三栏贴到文档中，用不同颜色标出和${primaryWeak.dimensionLabel}相关的关键词。`,
            "针对每条关键词，写一行“我在简历哪段有证据 / 证据强度 1-3 分 / 是否可追问”。",
            "把 1 分和 0 分的关键词单独挑出来，列成“必须补齐清单”，并标记每条对应哪类素材（项目、数据、工具、复盘）。",
          ],
          deliverable: "一张《JD 要求 × 简历证据 × 缺口》三栏对照表（Excel 或 Notion），含至少 8 行关键词。",
          acceptance: "能一眼看出：哪 3 条关键词必须补素材、哪 3 条只需改表达、哪 2 条可直接当卖点引用。",
          resources: ["Notion / 飞书多维表", "招聘官视角看简历教程（B 站任意一篇）", "岗位关键词抓取工具（WordClouds / jieba）"],
          templateSnippet: `| JD 关键词 | 所属能力 | 我的证据 | 强度(1-3) | 缺口类型 |\n| --- | --- | --- | --- | --- |\n| 用户体验改进 | 产品设计 | XX 项目优化注册流程，转化率+8% | 2 | 需要补齐用户访谈证据 |`,
        }),
        buildPlanAction({
          dayRange: "Day 3-4",
          dimension: primaryWeak,
          title: `补一个可追问的${primaryWeak.dimensionLabel} STAR 素材`,
          reasonHook: `面试官在${primaryWeak.dimensionLabel}上最常追问“你本人到底做了什么”，你现在的经历是“${primaryWeak.evidence.slice(0, 60)}…”，细节不够抗追问。`,
          steps: [
            "挑选最能体现该能力的 1 个项目，先用 5 行写清：业务背景、用户问题、你负责的范围、关键动作、最终结果。",
            "针对关键动作写 3 条“为什么这样做、有没有考虑过另一个方案、怎么验证决定对了”，每条 40-60 字。",
            "补 1 段复盘：“现在回看，如果重做我会改哪 1 步，为什么”，这是面试官最爱追的最后一问。",
          ],
          deliverable: "一页 A4 的《STAR 素材卡》，正面 150 字主线叙述，背面 5 条可追问细节 + 1 段复盘。",
          acceptance: "拿给非同行朋友读 2 分钟后，对方能复述你做了什么、结果是什么、以及你本人的判断。",
          resources: ["STAR-L 模型模板", "自己以前的周报/OKR", "ChatGPT 充当面试官追问"],
          templateSnippet: `【场景】2024 Q2，XX 业务新用户 7 日留存连续 3 周下滑 5%。\n【本人动作】我主导拆解了注册-首访路径，发现第 2 步表单放弃率 38%，推动 A/B 测试两版简化方案。\n【结果】方案 B 上线 2 周，放弃率降至 21%，7 日留存回升到基线 +1.5pct。\n【关键判断】选 B 而非 A，是因为 A 虽放弃率更低但引入了 3 个数据字段缺失，会影响下游推荐。\n【复盘】如果重做，我会在 A/B 之前先做 5 个用户访谈，避免后端同学返工 2 次。`,
        }),
        buildPlanAction({
          dayRange: "Day 5-7",
          dimension: secondaryWeak,
          title: `把${secondaryWeak.dimensionLabel}改写成可检索简历 bullet`,
          reasonHook: `${secondaryWeak.dimensionLabel}目前缺乏被招聘官 ATS/人眼扫描到的关键词，证据被埋在长句里。`,
          steps: [
            "打开目前简历中和该能力相关的 3-5 条经历，用红笔把“职责型动词（负责、参与、协助）”全部划掉。",
            `每条重写为“动词 + 对象 + 方法/工具 + 结果/指标”四段式，动词替换为${secondaryWeak.dimensionLabel}领域的专业动词。`,
            "写完后把 bullet 读出来录 60-90 秒口播稿，检查是否每句 15 秒内能讲清。",
          ],
          deliverable: "3 条岗位定制 bullet（每条 ≤42 字）+ 1 份 90 秒自我经历口述稿。",
          acceptance: "每条 bullet 都含：1 个可量化结果 + 1 个工具/方法关键词 + 1 个业务对象，朗读不超过 15 秒。",
          resources: ["岗位定制简历改写模块", "Jobscan / 5sec 简历扫描工具", "ATS 友好词库"],
          templateSnippet: `× 原：负责AI功能的产品设计，配合研发完成上线。\n√ 新：主导 B 端智能推荐功能 0→1 设计，输出 12 页 PRD + 5 张用户旅程图，联动算法团队完成 A/B 测试，点击率提升 22%。`,
        }),
      ],
      week2: [
        buildPlanAction({
          dayRange: "Day 8-10",
          dimension: secondaryWeak,
          title: "做一次轻量 AI 产品拆解，补齐岗位匹配 Demo 证据",
          reasonHook: `目标岗位要求对 AI 产品有判断力，但你目前缺少“从真实产品看出模型边界和商业闭环”的可展示证据。`,
          steps: [
            "挑一个你每天使用的 AI 产品（如豆包、Kimi、Notion AI、Perplexity 等），限时 3 小时完成拆解。",
            "输出 6 个固定小节：用户问题、核心场景、模型能力边界、关键数据指标、兜底/异常策略、如果我是 PM 会优化哪 1 点。",
            "把拆解稿压缩成一页可展示 PPT 或 1 分钟口播稿，面试时可以直接拿出来讲。",
          ],
          deliverable: "一页《AI 产品拆解稿》（PDF / 飞书文档）+ 1 分钟口播稿 + 1 条可优化假设。",
          acceptance: "讲给朋友听 1 分钟后，对方能复述“这个产品解决了什么问题、它的模型边界在哪、你会怎么改”。",
          resources: ["《AI 产品经理的第一本书》", "产品沉思录 / Lenny's Newsletter", "Figma / Keynote 一页模板"],
          templateSnippet: `# Kimi 长文本助手拆解\n1. 用户问题：研究生/职场人需要快速读完 300 页报告\n2. 核心场景：PDF 上传 → 结构化摘要 → 追问对话\n3. 模型边界：超长上下文能稳定召回，但对表格数字推理仍会幻觉\n4. 关键指标：首屏摘要时长、追问满意度、单次会话 token 成本\n5. 兜底：对数字类问题主动给出“建议核对原文页码”\n6. 我会优化：在摘要下方自动插入高亮页码跳转，解决信任问题`,
        }),
        buildPlanAction({
          dayRange: "Day 11-12",
          dimension: primaryWeak,
          title: "把 Week1 素材合并进岗位定制简历，重排证据密度",
          reasonHook: "招聘官 30 秒决定是否进下一轮，当前简历“最强证据”被排在第 2 段以后，很容易被略过。",
          steps: [
            "把 Week1 产出的 STAR 素材卡和 3 条 bullet，全部搬进简历对应模块，旧的职责型表达直接删除。",
            "调整经历顺序：目标岗位最相关的 1 段经历放到每个模块第一行，次要经历压缩到 1 行。",
            `在简历顶部 summary 里加一句“${input.userIdentity === "career_changer" ? "从 X 岗位转向 AI 产品经理" : "AI 产品方向应届/实习候选人"}，最强证据是 XXX”，限 60 字。`,
          ],
          deliverable: "一版可投递的《岗位定制简历 v2》（DOCX + PDF 各一份）。",
          acceptance: "让朋友 30 秒速读后，他能准确说出你最想强调的 1 个卖点和 1 个量化结果。",
          resources: ["本产品的岗位定制简历模块", "DOCX 导出功能", "招聘官视角简历自查清单"],
          templateSnippet: `# 个人简介\nAI 产品方向候选人｜2 年 B 端产品经验，主导 3 个智能化功能从 0 到 1，最强证据：XX 推荐功能点击率 +22%、节省运营人力 30%。`,
        }),
        buildPlanAction({
          dayRange: "Day 13-14",
          dimension: secondaryWeak,
          title: "针对 2 个最薄弱追问，做短答 + 展开答双版本演练",
          reasonHook: `面试预测显示一面最可能追问${primaryWeak.dimensionLabel}，二面追问${secondaryWeak.dimensionLabel}，现在如果被问到容易卡 10 秒以上。`,
          steps: [
            "从本产品的面试预测模块挑出 2 个最可能被问、且你最没底的问题。",
            "每个问题写两版：30 秒短答（先亮结论 + 1 个数据证据）和 3 分钟展开答（4 段式：场景-动作-结果-反思）。",
            "找 1 个朋友或录音自测 3 轮，每轮听完标注“哪句多余、哪句可以再加数字”，精简到 90 秒内讲完。",
          ],
          deliverable: "2 个问题 × 2 版回答（共 4 段文字稿）+ 2 段自录音频，总时长 ≤12 分钟。",
          acceptance: "录音听回放不出现“嗯/啊/那个”超过 3 次，且每版回答都含至少 1 个数字或产出物。",
          resources: ["本产品的高频追问模块", "手机录音 + 飞书妙记自动转文字", "STAR-L 回答模板"],
          templateSnippet: `【Q】如果让你负责一个 AI 功能，你会怎么定义成功？\n【30 秒】我会先定义用户问题（减少 X 任务耗时 Y%），再定义模型能力指标（召回率 ≥X）和业务指标（转化率/留存），最后补异常兜底（超出能力边界主动降级）。我上一个项目就是按这个思路，把 XX 点击率从 Y 提升到 Z。\n【3 分钟】场景：… 动作：我拆解为 3 层指标 … 结果：… 反思：如果重做我会提前加 2 个埋点 …`,
        }),
      ],
    },
  };
}

function buildDecisionReportFallback(input: DecisionReportArtifactsInput): DecisionReport {
  const resumeCompact = input.resumeText.replace(/\s+/g, "");
  const jdCompact = input.jobDescriptionText.replace(/\s+/g, "");
  const dimensions: DimensionAnalysis[] = AIPM_DIMENSION_META.map((meta, index) => {
    const resumeHit = meta.keywords.test(resumeCompact);
    const jdHit = meta.keywords.test(jdCompact);
    const currentLevel = (resumeHit ? (jdHit ? 2 : 1) : 0) as 0 | 1 | 2 | 3;
    const requiredLevel = (jdHit ? 2 : 1) as 0 | 1 | 2 | 3;
    const gap: DimensionGap = currentLevel >= requiredLevel
      ? "met"
      : currentLevel + 1 >= requiredLevel
        ? "close"
        : "insufficient";

    return {
      dimensionId: meta.dimensionId,
      dimensionLabel: meta.dimensionLabel,
      requiredLevel,
      currentLevel,
      gap,
      evidence: resumeHit
        ? `简历中可引用的相关证据覆盖到${meta.dimensionLabel}，但仍需要在投递材料里补足目标、动作、结果和岗位关键词。`
        : `未找到能直接支撑${meta.dimensionLabel}的明确简历证据。筛选阶段会被判断为岗位要求和个人经历之间存在证据断层，需要先补出可验证案例。`,
      remedyActions: gap === "met" ? [] : [
        `${meta.remedy}，并整理成 120-180 字的 STAR 素材，必须包含场景、本人动作、结果和复盘结论。`,
        `对照 JD 中和${meta.dimensionLabel}相关的要求，补一段可放进简历的项目描述，验收标准是能回答“你具体做了什么、为什么这样做、结果如何”。`,
      ],
    };
  });

  return buildDecisionReportFromDimensions(input, dimensions);
}

export async function generateDecisionReport(input: {
  sessionId: string;
  resumeText: string;
  jobDescriptionText: string;
  jobTitle?: string | null;
  userIdentity: string;
  currentRole?: string | null;
  roleSpecialty?: string | null;
  yearsOfExperience?: number | null;
  targetCompany?: string | null;
  onProgress?: GenerationProgressCallback;
}): Promise<DecisionReport> {
  const systemPrompt = buildAIPMSystemPrompt(input.userIdentity);
  const generationContext = buildGenerationContext(input);
  const fallbackReport = buildDecisionReportFallback(input);
  const reportProgress = input.onProgress;
  const commonContext = [
    `## 目标岗位：${input.jobTitle ?? "AI 产品经理"}`,
    input.targetCompany ? `## 目标公司：${input.targetCompany}` : "",
    `## JD 摘要输入\n${clipInput(generationContext.jdBrief, 2600)}`,
    `## 求职者简历摘要输入\n${clipInput(generationContext.resumeBrief, 4200)}`,
    `## 优先参考的简历证据行\n${generationContext.resumeEvidenceLines.slice(0, 12).map((line) => `- ${line}`).join("\n") || "- 未抽取到高置信证据行"}`,
    `## 求职者背景\n- 身份：${input.userIdentity === "career_changer" ? "转岗者" : "应届生/实习生"}\n- 当前岗位：${input.currentRole ?? "未提供"}${input.roleSpecialty ? `（${input.roleSpecialty}）` : ""}\n- 工作年限：${input.yearsOfExperience ?? "未提供"}`,
  ].filter(Boolean).join("\n\n");
  const paidReportQualityRules = [
    "## 付费交付质量红线：像顾问报告，不像 AI 建议",
    "1. 每个结论必须写成“判断 + 证据 + 影响 + 下一步”，不能只写现象或态度。",
    "2. 禁止空话：不要写“提升能力、加强理解、完善表达、持续学习、积累经验、多做准备”。",
    "3. 如果简历没有证据，必须明确写“未找到证据 + 这会导致筛选/面试官怎么判断 + 用户需要补哪个素材”。",
    "4. 风险卡必须按“卡点原因｜证据缺口｜可能追问｜补救方向”展开；每块只写 1 个核心点，不能堆多个追问。",
    "5. 补救动作必须产出具体材料：JD-证据对照表、STAR 素材卡、简历 bullet、项目复盘页、90 秒回答稿、3 分钟展开稿。",
    "6. 不要编造项目、数据、公司、工具和经历；没有事实就要求用户补素材或重写表达。",
  ].join("\n");

  await reportProgress?.({
    stage: "decision_input",
    message: "正在压缩简历和岗位信息，准备投递判断",
    current: 1,
    total: 4,
    progress: 16,
  });

  const generateDimensionDiagnosis = async () => {
    await reportProgress?.({
      stage: "decision_dimensions",
      message: "正在生成 7 维能力诊断和投递结论",
      current: 2,
      total: 4,
      progress: 44,
    });

    const result = await callChatJSON<{
      recommendation: string;
      recommendationLabel: string;
      oneLiner: string;
      overallMatchScore: number;
      dimensions: Array<{
        dimensionId: string;
        dimensionLabel: string;
        requiredLevel: number;
        currentLevel: number;
        gap: string;
        evidence: string;
        remedyActions: string[];
      }>;
    }>([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          commonContext,
          "## 任务一：只生成 7 维能力诊断和投递结论",
          paidReportQualityRules,
          "输出 JSON 字段：recommendation、recommendationLabel、oneLiner、overallMatchScore、dimensions。",
          "overallMatchScore 只作为模型参考值，系统会基于 7 维等级、JD 关键词要求和简历证据命中重新计算最终分。",
          "dimensions 必须严格 7 项，dimensionId 只能是 ai_understanding、product_design、data_driven、project_execution、business_sense、ai_application、communication。",
          "每项 evidence 写 80-140 字，结构必须是：可用证据/未找到证据 + 对 JD 的支撑度 + 对筛选或面试的影响。",
          "每项 remedyActions 给 2 条可执行动作，每条 50-90 字，必须包含动作、输出物、验收标准，禁止泛泛建议。",
          "oneLiner 写 80-130 字，必须给出明确投递判断、最大可用卖点、最大风险、投递前必须补的 1 件事。",
          "只输出 JSON，除字段名和枚举值外全部使用中文。",
        ].join("\n\n"),
      },
    ], {
      timeoutMs: 90000,
      retries: 1,
      temperature: 0.22,
      model: getLLMConfig().qualityModel,
      maxTokens: 2600,
      operation: "decision-dimensions",
    });
    const dimensions = normalizeDecisionDimensions(result.dimensions, fallbackReport);
    const derivedSummary = buildDecisionReportFromDimensions(input, dimensions);

    return {
      recommendation: derivedSummary.recommendation,
      recommendationLabel: derivedSummary.recommendationLabel,
      oneLiner: result.oneLiner || derivedSummary.oneLiner,
      overallMatchScore: derivedSummary.overallMatchScore,
      dimensions,
    };
  };

  const generateRiskPrediction = async (dimensions: DimensionAnalysis[]): Promise<InterviewRoundPrediction> => {
    await reportProgress?.({
      stage: "decision_risks",
      message: "正在整理风险提示和已达标能力",
      current: 3,
      total: 4,
      progress: 76,
    });
    return buildDecisionReportFromDimensions(input, dimensions).interviewRoundPrediction;
  };

  const generateTwoWeekPlan = async (dimensions: DimensionAnalysis[], risks: InterviewRoundPrediction): Promise<TwoWeekPlan> => {
    await reportProgress?.({
      stage: "decision_plan",
      message: "正在整理下一步行动建议",
      current: 3,
      total: 4,
      progress: 84,
    });
    const score = calculateDecisionOverallScore(dimensions, input);
    const recommendation = getRecommendationFromScore(score);
    return buildDecisionReportFromDimensions(input, dimensions, {
      recommendation,
      recommendationLabel: getRecommendationLabel(recommendation),
      overallMatchScore: score,
      oneLiner: buildDecisionReportFromDimensions(input, dimensions).oneLiner,
    }).twoWeekPlan;
  };

  try {
    let diagnosis: Awaited<ReturnType<typeof generateDimensionDiagnosis>>;
    try {
      diagnosis = await generateDimensionDiagnosis();
    } catch (error) {
      console.error("decision dimensions fell back", error);
      diagnosis = {
        recommendation: fallbackReport.recommendation,
        recommendationLabel: fallbackReport.recommendationLabel,
        oneLiner: fallbackReport.oneLiner,
        overallMatchScore: fallbackReport.overallMatchScore,
        dimensions: fallbackReport.dimensions,
      };
    }

    let interviewRoundPrediction: InterviewRoundPrediction;
    try {
      interviewRoundPrediction = await generateRiskPrediction(diagnosis.dimensions);
    } catch (error) {
      console.error("decision risks fell back", error);
      interviewRoundPrediction = fallbackReport.interviewRoundPrediction;
    }

    let twoWeekPlan: TwoWeekPlan;
    try {
      twoWeekPlan = await generateTwoWeekPlan(diagnosis.dimensions, interviewRoundPrediction);
    } catch (error) {
      console.error("decision plan fell back", error);
      twoWeekPlan = fallbackReport.twoWeekPlan;
    }

    await reportProgress?.({
      stage: "decision_normalizing",
      message: "正在合并投递判断和行动建议",
      current: 4,
      total: 4,
      progress: 92,
    });

    const report: DecisionReport = {
      sessionId: input.sessionId as DecisionReport["sessionId"],
      recommendation: diagnosis.recommendation,
      recommendationLabel: diagnosis.recommendationLabel,
      oneLiner: diagnosis.oneLiner,
      overallMatchScore: diagnosis.overallMatchScore,
      dimensions: diagnosis.dimensions,
      interviewRoundPrediction,
      twoWeekPlan,
    };
    const completedReport = isDecisionReportComplete(report) ? report : fallbackReport;

    await reportProgress?.({
      stage: "decision_done",
      message: completedReport === report ? "已分段完成投递决策报告" : "模型返回内容不完整，已切换为完整兜底报告",
      current: 4,
      total: 4,
      progress: 100,
    });

    return completedReport;
  } catch {
    await reportProgress?.({
      stage: "decision_fallback",
      message: "高质量模型未完整返回，已用专家规则完成兜底报告",
      current: 4,
      total: 4,
      progress: 100,
    });
    return fallbackReport;
  }
}

// ---------------------------------------------------------------------------
// AIPM Copilot: 简历改写（AIPM 语言体系）
// ---------------------------------------------------------------------------

interface DecisionRewriteGuidance {
  fullPrompt: string;
  sectionPromptFor: (sectionKey: string) => string;
}

function buildDecisionRewriteGuidance(
  report: DecisionReport | undefined,
  focusDimensions?: AIPMDimensionId[],
): DecisionRewriteGuidance {
  if (!report) {
    return { fullPrompt: "", sectionPromptFor: () => "" };
  }

  const dimensions = Array.isArray(report.dimensions) ? report.dimensions : [];
  const focusSet = new Set<AIPMDimensionId>(focusDimensions ?? []);
  const gapPriority: Record<string, number> = { large: 0, medium: 1, small: 2, none: 3 };
  const prioritizedDims = [...dimensions].sort((a, b) => {
    const focusDelta = (focusSet.has(b.dimensionId) ? 1 : 0) - (focusSet.has(a.dimensionId) ? 1 : 0);
    if (focusDelta !== 0) return focusDelta;
    return (gapPriority[a.gap] ?? 9) - (gapPriority[b.gap] ?? 9);
  });
  const topDims = prioritizedDims.slice(0, 5);

  const dimensionLines = topDims.map((dim) => {
    const remedies = (dim.remedyActions ?? []).filter(Boolean).slice(0, 3);
    const remedyText = remedies.length ? remedies.map((item) => `「${item}」`).join("；") : "无";
    const evidence = dim.evidence?.replace(/\s+/g, " ").slice(0, 120) || "未提供";
    return `- ${dim.dimensionLabel}（差距：${dim.gap}；当前：${dim.currentLevel}/要求：${dim.requiredLevel}）\n  · 评估证据：${evidence}\n  · 报告建议补强动作：${remedyText}`;
  });

  const interview = report.interviewRoundPrediction;
  const interviewLines: string[] = [];
  if (interview) {
    if (interview.resumeScreening?.risk) {
      interviewLines.push(`- 简历筛查风险：${interview.resumeScreening.risk.replace(/\s+/g, " ").slice(0, 140)}`);
    }
    const firstWeak = interview.firstRound?.weakness?.replace(/\s+/g, " ").slice(0, 120);
    if (firstWeak) interviewLines.push(`- 一面易暴露的弱点：${firstWeak}`);
    const secondWeak = interview.secondRound?.weakness?.replace(/\s+/g, " ").slice(0, 120);
    if (secondWeak) interviewLines.push(`- 二面易暴露的弱点：${secondWeak}`);
    const firstQs = (interview.firstRound?.likelyQuestions ?? []).slice(0, 3).filter(Boolean);
    if (firstQs.length) interviewLines.push(`- 一面高频追问：${firstQs.map((q) => `「${q}」`).join("；")}`);
  }

  const planActions = [
    ...((report.twoWeekPlan?.week1 ?? []) as DecisionReport["twoWeekPlan"]["week1"]),
    ...((report.twoWeekPlan?.week2 ?? []) as DecisionReport["twoWeekPlan"]["week2"]),
  ];
  const planLines = planActions
    .slice(0, 4)
    .map((action) => {
      const title = action.title ?? action.action ?? "";
      if (!title) return "";
      return `- ${title}（针对维度：${action.targetDimension}）`;
    })
    .filter(Boolean);

  const oneLiner = report.oneLiner?.replace(/\s+/g, " ").trim();
  const recommendation = report.recommendationLabel?.trim();

  const fullPromptLines: string[] = ["## 投递决策报告对本次改写的指导（必须遵循）"];
  if (recommendation || oneLiner) {
    fullPromptLines.push(
      `- 当前推荐：${recommendation || "未给出"}${oneLiner ? `；总体判断：${oneLiner}` : ""}`,
    );
  }
  if (dimensionLines.length) {
    fullPromptLines.push("### 重点维度差距与补强建议（请把这些建议体现在改写表达里）");
    fullPromptLines.push(...dimensionLines);
  }
  if (interviewLines.length) {
    fullPromptLines.push("### 面试预判暴露的弱点（改写时要主动用原文事实补强这些方向，但不允许编造）");
    fullPromptLines.push(...interviewLines);
  }
  if (planLines.length) {
    fullPromptLines.push("### 两周补齐方案中的关键动作（如果原文已有相关事实，改写时优先把它们说清楚）");
    fullPromptLines.push(...planLines);
  }
  fullPromptLines.push(
    "### 使用规则",
    "1. 上述建议是改写的目标方向；只能用原简历已有事实去靠近这些方向，绝不能新增事实。",
    "2. 如果原文确实没有支撑，可以在 explanation 中显式标注「报告建议方向，原文暂无证据，本次未补足」，避免硬编。",
    "3. 改写后的句子应该让招聘官能直接看出针对这些差距做了表达升级。",
  );

  const fullPrompt = fullPromptLines.join("\n");

  const sectionRelevantDims = (sectionKey: string): typeof topDims => {
    const key = sectionKey || "";
    if (["profile", "education", "skills", "awards", "certifications"].includes(key)) {
      return topDims.filter((dim) => focusSet.has(dim.dimensionId));
    }
    return topDims;
  };

  const sectionPromptFor = (sectionKey: string) => {
    const dims = sectionRelevantDims(sectionKey);
    if (!dims.length && !interviewLines.length) return "";
    const lines: string[] = ["## 来自投递决策报告的本段改写要求（事实安全前提下尽量贴近）"];
    if (dims.length) {
      lines.push("### 优先补强的能力维度");
      lines.push(
        ...dims.slice(0, 3).map((dim) => {
          const remedies = (dim.remedyActions ?? []).filter(Boolean).slice(0, 2);
          const remedyText = remedies.length ? remedies.map((item) => `「${item}」`).join("；") : "无";
          return `- ${dim.dimensionLabel}（差距：${dim.gap}）：${remedyText}`;
        }),
      );
    }
    if (interviewLines.length) {
      lines.push("### 面试预判提到的薄弱方向（如果本段原文有相关事实，请用更专业的句式重述）");
      lines.push(...interviewLines.slice(0, 3));
    }
    lines.push(
      "### 使用方式",
      "- 只能在原文事实支撑下做表达升级；如果本段事实和上述方向无关，保持本段忠于原意，不要硬塞。",
      "- 改写完成后，请在 explanation 中具体说明：本段对应哪些建议、是如何升级表达的；如果未能补强，写明原因。",
    );
    return lines.join("\n");
  };

  return { fullPrompt, sectionPromptFor };
}

export async function generateAIPMRewrite(input: {
  sessionId: string;
  resumeText: string;
  jobDescriptionText: string;
  jobTitle?: string | null;
  userIdentity: string;
  currentRole?: string | null;
  roleSpecialty?: string | null;
  targetCompany?: string | null;
  rewriteMode?: string;
  focusDimensions?: AIPMDimensionId[];
  decisionReport?: DecisionReport;
  onProgress?: GenerationProgressCallback;
}): Promise<{
  beforeScore: number;
  afterScore: number;
  rewriteStrategy: string;
  sections: RewriteSection[];
  fullRewrittenText: string;
  aipmTermsHighlighted: AIPMTerm[];
  factGuard: RewriteResult["factGuard"];
}> {
  const systemPrompt = buildAIPMSystemPrompt(input.userIdentity);
  const rewriteMode = input.rewriteMode === "conservative" ? "aggressive_fact_bound" : (input.rewriteMode || "aggressive_fact_bound");
  const factWhitelistSummary = buildRewriteFactWhitelistSummary(input.resumeText);
  const jdForPrompt = clipInput(input.jobDescriptionText, 3500);
  const resumeBlocks = splitResumeSections(input.resumeText).slice(0, 8);
  const reportProgress = input.onProgress;
  const focusHint = input.focusDimensions?.length
    ? `请重点关注以下能力维度的表达翻译：${input.focusDimensions.join("、")}`
    : "";

  const decisionGuidance = buildDecisionRewriteGuidance(input.decisionReport, input.focusDimensions);
  const decisionGuidancePrompt = decisionGuidance.fullPrompt;
  const sectionGuidancePromptFor = (sectionKey: string) =>
    decisionGuidance.sectionPromptFor(sectionKey);

  await reportProgress?.({
    stage: "rewrite_planning",
    message: input.decisionReport
      ? "已读取投递决策报告，准备生成完整岗位定制简历"
      : "已读取原简历与 JD，准备生成完整岗位定制简历",
    current: 0,
    total: 4,
    progress: 5,
  });

  const buildFullRewritePrompt = (extraInstructions?: string) => [
    `## 目标岗位：${input.jobTitle ?? "AI 产品经理"}`,
    input.targetCompany ? `## 目标公司：${input.targetCompany}` : "",
    `## JD\n${jdForPrompt}`,
    `## 求职者背景\n- 身份：${input.userIdentity === "career_changer" ? "转岗者" : "应届生/实习生"}\n- 当前岗位：${input.currentRole ?? "未提供"}${input.roleSpecialty ? `（${input.roleSpecialty}）` : ""}`,
    factWhitelistSummary,
    focusHint,
    decisionGuidancePrompt,
    `## 原始简历全文\n${clipInput(input.resumeText, 7800)}`,
    "## 全文改写任务",
    "请直接生成一份完整的岗位定制简历正文，不要逐模块分别返回，不要解释过程。",
    "目标是让整份简历形成统一叙事：先保留真实背景，再突出与 JD 相关的职责、动作、项目产出和可迁移能力。",
    "必须明显改写表达，不能只是整理换行或替换标点；但绝对不能新增原简历没有的经历、项目、公司、学校、证书、工具、数字、时间或成果。",
    "可以重排模块顺序，建议结构为：个人信息/求职意向、岗位摘要、教育背景、实习/工作经历、项目经历、校园/其他经历、技能与工具、获奖/证书。",
    "经历和项目只保留与岗位相关的重点，不要每条都套用同一种模板；短技能、语言、证书可以保持短，不要强行扩写。",
    "如果原文没有量化结果，不要编造数字；可以把动作、协作、分析、交付过程说清楚。",
    "模块标题直接写中文标题，不要使用 Markdown 的 ##、###、**、表格或代码块。",
    "正文使用真实换行。经历/项目可使用 - bullet；教育、技能、证书可以用短行。",
    extraInstructions ?? "",
    "",
    "## 输出 JSON 格式",
    `{ "fullRewrittenText": string, "rewriteStrategy": string, "targetDimensions": string[] }`,
    "",
    "重要：只输出 JSON。fullRewrittenText 必须是完整简历正文，不要输出分析说明；除 JSON 字段名外，所有输出文字必须使用中文。",
  ]
    .filter(Boolean)
    .join("\n\n");

  const generateFullResumeRewrite = async () => {
    await reportProgress?.({
      stage: "rewrite_full_generating",
      message: "正在基于完整上下文生成岗位定制简历",
      current: 1,
      total: 4,
      progress: 18,
    });

    const result = await callChatJSON<{
      fullRewrittenText?: string;
      rewriteStrategy?: string;
      targetDimensions?: string[];
    }>(
      [
        {
          role: "system",
          content:
            systemPrompt +
            "\n\n你的任务是一次性生成完整岗位定制简历。必须事实安全、表达统一、克制专业，不能逐段机械扩写。输出必须是 JSON。",
        },
        { role: "user", content: buildFullRewritePrompt() },
      ],
      {
        timeoutMs: 90000,
        retries: 1,
        temperature: 0.28,
        model: getLLMConfig().qualityModel,
        maxTokens: 3600,
        operation: "rewrite-full-resume",
      },
    );

    await reportProgress?.({
      stage: "rewrite_full_validating",
      message: "正在校验全文改写的事实边界和简历格式",
      current: 2,
      total: 4,
      progress: 72,
    });

    let fullRewrittenText = normalizeFullRewrittenResumeText(result.fullRewrittenText ?? "");
    let formatIssue = getFullRewriteFormatIssue(fullRewrittenText);
    if (formatIssue) {
      const repaired = await callChatJSON<{
        fullRewrittenText?: string;
        rewriteStrategy?: string;
        targetDimensions?: string[];
      }>(
        [
          {
            role: "system",
            content:
              systemPrompt +
              "\n\n你的任务是修复完整简历的格式问题。只允许重排、断行、压缩和删除冗余表达，不能新增事实。输出必须是 JSON。",
          },
          {
            role: "user",
            content: buildFullRewritePrompt(
              [
                "## 上一版格式问题",
                `- ${formatIssue}`,
                "请重新输出完整简历正文：模块标题清晰，短技能/证书保持短，经历/项目用简洁 bullet，不要长段堆叠。",
              ].join("\n"),
            ),
          },
        ],
        {
          timeoutMs: 70000,
          retries: 1,
          temperature: 0.14,
          model: getLLMConfig().qualityModel,
          maxTokens: 3200,
          operation: "rewrite-full-resume-format-repair",
        },
      );
      fullRewrittenText = normalizeFullRewrittenResumeText(repaired.fullRewrittenText ?? "");
      formatIssue = getFullRewriteFormatIssue(fullRewrittenText);
    }
    if (formatIssue) {
      throw new Error(`全文改写格式不合格：${formatIssue}`);
    }

    const sections = buildRewriteSectionsFromFullText(fullRewrittenText, resumeBlocks, input.resumeText).map((section) => ({
      ...section,
      targetDimensions: Array.isArray(result.targetDimensions)
        ? (result.targetDimensions as AIPMDimensionId[])
        : [],
    }));
    const validation = validateRewriteConsistency({
      resumeText: input.resumeText,
      sections,
      fullRewrittenText,
      aipmTermsHighlighted: [],
    });

    if (!validation.isValid) {
      const repaired = await callChatJSON<{
        fullRewrittenText?: string;
        rewriteStrategy?: string;
        targetDimensions?: string[];
      }>(
        [
          {
            role: "system",
            content:
              systemPrompt +
              "\n\n你的任务是修复完整简历中的事实风险。必须删除所有原文不支持的信息，同时保持完整简历结构。输出必须是 JSON。",
          },
          {
            role: "user",
            content: buildFullRewritePrompt(
              [
                "## 上一版事实风险",
                ...validation.issues.map((issue) => `- ${issue.message}：${issue.examples.join("、")}`),
                "请重新输出事实安全的完整简历，不要退回原文，不要新增任何无法被原文支撑的信息。",
              ].join("\n"),
            ),
          },
        ],
        {
          timeoutMs: 70000,
          retries: 1,
          temperature: 0.1,
          model: getLLMConfig().qualityModel,
          maxTokens: 3200,
          operation: "rewrite-full-resume-fact-repair",
        },
      );
      const repairedText = normalizeFullRewrittenResumeText(repaired.fullRewrittenText ?? "");
      const repairedFormatIssue = getFullRewriteFormatIssue(repairedText);
      if (repairedFormatIssue) {
        throw new Error(`全文事实修复后格式不合格：${repairedFormatIssue}`);
      }
      const repairedSections = buildRewriteSectionsFromFullText(repairedText, resumeBlocks, input.resumeText);
      const repairedValidation = validateRewriteConsistency({
        resumeText: input.resumeText,
        sections: repairedSections,
        fullRewrittenText: repairedText,
        aipmTermsHighlighted: [],
      });
      if (!repairedValidation.isValid) {
        throw new Error(`全文改写事实风险未修复：${repairedValidation.issues.map((issue) => issue.message).join("；")}`);
      }

      await reportProgress?.({
        stage: "rewrite_done",
        message: "已完成全文改写，并通过事实安全修复",
        current: 4,
        total: 4,
        progress: 100,
      });

      return {
        beforeScore: 58,
        afterScore: 76,
        rewriteStrategy: repaired.rewriteStrategy?.trim()
          || "已使用全文生成链路完成岗位定制简历：先统一重写完整简历，再进行事实护栏修复和系统级格式整理。",
        sections: repairedSections,
        fullRewrittenText: repairedText,
        aipmTermsHighlighted: [],
        factGuard: buildRewriteFactGuard("repaired", validation.issues),
      };
    }

    await reportProgress?.({
      stage: "rewrite_done",
      message: "已完成全文岗位定制简历生成",
      current: 4,
      total: 4,
      progress: 100,
    });

    return {
      beforeScore: 58,
      afterScore: 78,
      rewriteStrategy: result.rewriteStrategy?.trim()
        || "已使用全文生成链路完成岗位定制简历：基于完整原简历、JD 和投递判断统一重写，避免逐模块生成造成的割裂和冗余。",
      sections,
      fullRewrittenText,
      aipmTermsHighlighted: [],
      factGuard: buildRewriteFactGuard("passed", []),
    };
  };

  try {
    return await generateFullResumeRewrite();
  } catch (fullRewriteError) {
    console.error("AIPM full resume rewrite fell back to section rewrite", fullRewriteError);
    await reportProgress?.({
      stage: "rewrite_section_fallback",
      message: "全文生成不稳定，正在切换为分段兜底改写",
      current: 0,
      total: Math.max(resumeBlocks.length, 1),
      progress: 8,
    });
  }

  const buildSummaryPrompt = (extraInstructions?: string) => [
    `## 目标岗位：${input.jobTitle ?? "AI 产品经理"}`,
    input.targetCompany ? `## 目标公司：${input.targetCompany}` : "",
    `## JD\n${jdForPrompt}`,
    `## 求职者完整简历\n${clipInput(input.resumeText, 6000)}`,
    `## 求职者背景\n- 身份：${input.userIdentity === "career_changer" ? "转岗者" : "应届生/实习生"}\n- 当前岗位：${input.currentRole ?? "未提供"}${input.roleSpecialty ? `（${input.roleSpecialty}）` : ""}`,
    factWhitelistSummary,
    focusHint,
    decisionGuidancePrompt,
    "## 摘要任务",
    "请单独生成一个能放在简历最前面的 AI 产品经理岗位摘要，必须像付费简历顾问交付的成品。",
    "摘要必须严格输出 3 到 4 行，每一行都要有信息量。",
    "必须围绕：职责、动作、结果、可迁移能力。",
    "不要复读原文，不要逐句改写原句，不要写空话，不要写自我激励或学习态度。",
    "不要出现“熟悉”“了解”“热爱”“具备良好沟通能力”等空泛表述，除非后面紧跟具体事实支撑。",
    "只能基于原简历已有事实提炼，不能新增任何经历、指标、项目、工具、角色或成果；但必须大胆重组语言，不要只是复述。",
    "每一行尽量像面向招聘官的成品表达，而不是分析说明。",
    extraInstructions ?? "",
    "",
    "## 输出 JSON 格式",
    `{ "sectionKey": "summary", "sectionLabel": "AI 产品经理岗位摘要", "originalText": string, "rewrittenText": string, "explanation": string, "targetDimensions": string[] }`,
    "",
    "重要：rewrittenText 必须是 3 到 4 行文本，使用换行分隔；除 JSON 字段名外，所有输出文字必须使用中文。",
  ]
    .filter(Boolean)
    .join("\n\n");

  const generateSummarySection = async (): Promise<{ section: RewriteSection; issues: RewriteResult["factGuard"]["issues"] }> => {
    const fallback = buildSummaryFallback(input);

    try {
      await reportProgress?.({
        stage: "rewrite_summary",
        message: "正在生成 AI 产品经理岗位摘要",
        current: 0,
        total: Math.max(resumeBlocks.length, 1),
        progress: 9,
      });

      const result = await callChatJSON<{
        sectionKey?: string;
        sectionLabel?: string;
        originalText?: string;
        rewrittenText?: string;
        explanation?: string;
        targetDimensions?: string[];
      }>(
        [
          {
            role: "system",
            content:
              systemPrompt +
              "\n\n你的任务是生成简历最前面的岗位摘要。摘要必须短、硬、具体，有明显付费价值，突出职责、动作、结果和可迁移能力，但绝对不能编造事实。输出必须是 JSON。",
          },
          { role: "user", content: buildSummaryPrompt() },
        ],
        {
          timeoutMs: 60000,
          retries: 1,
          temperature: 0.32,
          model: getLLMConfig().qualityModel,
          maxTokens: 1200,
          operation: "rewrite-summary",
        }
      );

      const rewrittenText = result.rewrittenText?.trim();
      const lineCount = rewrittenText ? rewrittenText.split("\n").map((line) => line.trim()).filter(Boolean).length : 0;
      if (!rewrittenText || lineCount < 3 || lineCount > 4) {
        throw new Error("摘要行数不符合要求");
      }

      const summarySection: RewriteSection = {
        sectionKey: "summary",
        sectionLabel: "AI 产品经理岗位摘要",
        originalText: fallback.originalText,
        rewrittenText,
        explanation: result.explanation?.trim() || fallback.explanation,
        targetDimensions: Array.isArray(result.targetDimensions)
          ? (result.targetDimensions as AIPMDimensionId[])
          : fallback.targetDimensions,
      };

      const validation = validateRewriteConsistency({
        resumeText: input.resumeText,
        sections: [summarySection],
        fullRewrittenText: summarySection.rewrittenText,
        aipmTermsHighlighted: [],
      });

      if (validation.isValid) {
        return { section: summarySection, issues: [] };
      }

      const repaired = await callChatJSON<{
        rewrittenText?: string;
        explanation?: string;
        targetDimensions?: string[];
      }>(
        [
          {
            role: "system",
            content:
              systemPrompt +
              "\n\n你的任务是修复岗位摘要中的新增事实风险。你必须删除所有超出原简历的信息，只保留可被原文直接支撑的表达。输出必须是 JSON。",
          },
          {
            role: "user",
            content: buildSummaryPrompt(
              [
                "## 上一版违反的事实边界",
                ...validation.issues.map((issue) => `- ${issue.message}：${issue.examples.join("、")}`),
                "请重新输出更保守但仍有信息密度的 3 到 4 行岗位摘要。",
              ].join("\n")
            ),
          },
        ],
        {
          timeoutMs: 60000,
          retries: 1,
          temperature: 0.12,
          model: getLLMConfig().qualityModel,
          maxTokens: 700,
          operation: "rewrite-summary-repair",
        }
      );

      const repairedText = repaired.rewrittenText?.trim();
      const repairedLineCount = repairedText ? repairedText.split("\n").map((line) => line.trim()).filter(Boolean).length : 0;
      if (!repairedText || repairedLineCount < 3 || repairedLineCount > 4) {
        return { section: fallback, issues: validation.issues };
      }

      const repairedSection: RewriteSection = {
        sectionKey: "summary",
        sectionLabel: "AI 产品经理岗位摘要",
        originalText: fallback.originalText,
        rewrittenText: repairedText,
        explanation: repaired.explanation?.trim() || fallback.explanation,
        targetDimensions: Array.isArray(repaired.targetDimensions)
          ? (repaired.targetDimensions as AIPMDimensionId[])
          : fallback.targetDimensions,
      };

      const repairedValidation = validateRewriteConsistency({
        resumeText: input.resumeText,
        sections: [repairedSection],
        fullRewrittenText: repairedSection.rewrittenText,
        aipmTermsHighlighted: [],
      });

      return repairedValidation.isValid
        ? { section: repairedSection, issues: validation.issues }
        : { section: fallback, issues: [...validation.issues, ...repairedValidation.issues] };
    } catch (error) {
      console.error("AIPM rewrite summary fell back", error);
      return { section: fallback, issues: [] };
    }
  };

  const normalizeGeneratedSection = (
    result: {
      sectionKey?: string;
      sectionLabel?: string;
      originalText?: string;
      rewrittenText?: string;
      explanation?: string;
      targetDimensions?: string[];
    },
    block: ResumeRewriteBlock,
  ): RewriteSection => {
    const rewrittenText = result.rewrittenText?.trim();
    if (!rewrittenText) {
      throw new Error("分段改写为空");
    }

    return {
      sectionKey: normalizeModuleKey(result.sectionKey || block.sectionKey),
      sectionLabel: result.sectionLabel?.trim() || block.sectionLabel,
      originalText: block.content,
      rewrittenText: formatRewrittenSectionText(result.sectionKey || block.sectionKey, result.sectionLabel?.trim() || block.sectionLabel, rewrittenText),
      explanation: result.explanation || "基于原文事实进行岗位相关表达优化。",
      targetDimensions: Array.isArray(result.targetDimensions) ? (result.targetDimensions as AIPMDimensionId[]) : [],
    };
  };

  const generateSection = async (block: ResumeRewriteBlock, index: number): Promise<{ section: RewriteSection; issues: RewriteResult["factGuard"]["issues"] }> => {
    const blockDateRanges = extractDateRanges(block.content);
    const buildSectionPrompt = (extraInstructions?: string) => [
    `## 目标岗位：${input.jobTitle ?? "AI 产品经理"}`,
    input.targetCompany ? `## 目标公司：${input.targetCompany}` : "",
    `## JD\n${jdForPrompt}`,
      `## 当前模块标签\n${block.sectionLabel}`,
      `## 当前待改写简历片段（原文）\n${clipInput(block.content, 2600)}`,
      blockDateRanges.length
        ? `## 本段必须保留的时间/日期/任职区间（一个都不能丢，必须原样写入 rewrittenText）\n${blockDateRanges.map((item) => `- ${item}`).join("\n")}`
        : "",
    `## 求职者背景\n- 身份：${input.userIdentity === "career_changer" ? "转岗者" : "应届生/实习生"}\n- 当前岗位：${input.currentRole ?? "未提供"}${input.roleSpecialty ? `（${input.roleSpecialty}）` : ""}`,
    factWhitelistSummary,
    focusHint,
    sectionGuidancePromptFor(block.sectionKey),
    `## 顶级简历结构与表达规范（必须严格遵守）`,
    `A. 模块通用规则：`,
    `  A1. 个人信息(profile)：姓名 / 求职意向 / 手机 / 邮箱 / 学校 / 专业 / 学历 / 籍贯或城市，按「字段：值」一行一项呈现；不使用项目符号。`,
    `  A2. 个人总结(summary)：3-4 行，每行一个独立卖点，结构为「身份 + 能力 + 证据 + 可迁移价值」，不堆砌形容词，不写学习态度类空话。`,
    `  A3. 教育背景(education)：每条必含「学校 · 学院 · 专业 · 学历 · 起止年月（YYYY.MM-YYYY.MM 或 YYYY.MM-至今）」，可附 GPA / 排名 / 核心课程；严禁丢任何一项。`,
    `  A4. 实习/工作经历(internship)：每段按「公司全称 · 部门/团队 · 岗位 · 起止年月 · 工作地点(若原文有)」的抬头行开头（用一整行呈现，不拆成多行，不用 bullet），随后 3-5 条 "- " 项目符号，每条为一句完整 STAR/PAR 结构的成果句，不少于 24 字，不超过 70 字，必须含「动词起首 + 动作对象 + 方法/判断 + 可观测结果或可迁移能力」。`,
    `  A5. 项目经历(project)：每段抬头行「项目名 · 角色 · 起止年月 · 所在团队/公司(若原文有)」，随后 3-5 条 "- " 项目符号，覆盖「背景与目标 / 你的关键动作 / 用到的方法或工具 / 产出与指标」。`,
    `  A6. 校园经历(campusExperience)：抬头行「组织/活动 · 角色 · 起止年月」，随后 2-4 条 bullet，突出组织协调、跨部门沟通、项目落地。`,
    `  A7. 技能与工具(skills)：按分类聚合，每行一类，例如「产品工具：Axure / Figma / 墨刀」「数据分析：SQL / Python / Tableau」；不写"熟练掌握"等虚词。`,
    `  A8. 获奖/证书(awards/certifications)：按"奖项/证书名 · 颁发机构 · 时间"一行一项。`,
    `B. 句式规范：`,
    `  B1. 动词起首：主导 / 负责 / 推动 / 搭建 / 设计 / 复盘 / 拉通 / 协调 / 输出 / 落地 / 迭代 / 验证 / 定义 / 拆解 / 驱动 / 优化。`,
    `  B2. 禁止形容词堆叠和空话："具备良好沟通能力 / 熟悉互联网行业 / 乐于学习 / 团队合作精神强 / 认真负责 / 抗压能力强"。`,
    `  B3. 指标表达只能来自原文；原文没有数字，就写"动作 + 可验证结果"，不要编造百分比。`,
    `  B4. 每条 bullet 内不允许包含换行、## 符号、字面反斜杠、HTML 标签、Markdown 标题；不允许出现"我"、"我们"、"你"等口语主语。`,
    `C. 岗位匹配：`,
    `  C1. 有意识选取与 JD 强关联的动词和名词（需求分析 / 场景拆解 / 产品方案 / 指标验证 / 用户反馈 / 模型边界 / 数据闭环 / 跨端协同 / AB 实验），但必须有原文事实支撑。`,
    `  C2. 不做到位也不能编造；可以弱化处理或在 explanation 指出缺口。`,
    `## 改写任务`,
    `改写模式：${rewriteMode}`,
    `你的任务是对【当前待改写简历片段】做面向"${input.jobTitle ?? "AI 产品经理"}"岗位的重写，使之符合上方"顶级简历结构与表达规范"。`,
    `强制事实保留：`,
    `1. 时间/日期/任职区间必须完整保留（若原文写了 2023.06-2024.03，rewrittenText 也必须包含"2023.06-2024.03"或等价写法）。`,
    `2. 公司/机构/项目名必须完整保留，不得改名、缩写为首字母、合并或删除。`,
    `3. 岗位/角色称谓必须保留，除非原文明确没有。`,
    `4. 地点、学校、学院、专业、学历、GPA、排名、奖项等只要原文出现就必须保留。`,
    `5. 不允许为了"看上去更好"而删掉抬头行。抬头行必须出现在该段首行。`,
    `你可以做的重写：`,
    `a. 重组句子、切分长句、删除啰嗦和口语；`,
    `b. 把弱表达换成专业动词；`,
    `c. 补充"可迁移能力"结尾（但能力描述必须由原文事实可推出）；`,
    `d. 将隐含职责显化为"动作 + 产出"结构；`,
    `e. 按上方 A 规则重新排版为抬头行 + bullet 的结构。`,
    `你绝对不可以做的：`,
    `1. 新增任何经历、项目、职责、成果、数字、工具、技术栈、机构、奖项、证书；`,
    `2. 把隐含能力写成明确做过的事实；`,
    `3. 把团队成果完全说成个人成果；`,
    `4. 改变原经历的行业或岗位属性；`,
    `5. 丢失任何一个时间/日期/公司/角色/学校/专业/学历/地点。`,
    `## 输出格式硬约束（违反任一条都视为不合格）`,
    `O1. rewrittenText 使用真实换行符 \\n 分隔每行，禁止输出字面"\\\\n"或"\\n"字符串，禁止输出空白占位的"\\\\"。`,
    `O2. rewrittenText 不允许包含任何"##"、"###"、"**"、"*"、"|"、"---"等 Markdown 标题/强调/表格符号；模块标题由系统渲染，不要写在正文。`,
    `O3. 经历/项目/实习类模块优先使用 "- " bullet；如果原文信息较短，可用 1 条完整 bullet 或清晰换行，不要为了凑数量编造内容。profile、education 使用无 bullet 的 "字段：值" 或一行成段。`,
    `O4. 每条 bullet 必须单独一行，必须是完整句：不能以逗号、顿号、分号、冒号、"通过/基于/围绕/以及/并/和/与"结尾，不能出现半句话或截断句；单行长度建议 18-130 个中英文混合字符。`,
    `O5. 抬头行（公司·部门·岗位·时间）与 bullet 之间用一个换行分隔；段与段之间可用空行分隔，但不要超过两个连续换行。`,
    `O6. sectionLabel 不允许写成"核心摘要""经历模块 1""模块 2"这类空泛标题，必须准确命名，例如"项目经历""实习经历""教育背景""技能与工具"。`,
    `O7. 每条 explanation 必须说明：改了什么 / 为什么这样改 / 对应 AI 产品经理哪类能力；不得写"结合 JD 补充""提升表达"这种空话。`,
    extraInstructions ?? "",
    ``,
    `## 输出 JSON 格式`,
      `{ "sectionKey": string, "sectionLabel": string, "originalText": string, "rewrittenText": string, "explanation": string, "targetDimensions": string[] }`,
    ``,
      `重要：只输出当前片段的改写 JSON，不要输出整份简历。除 JSON 字段名外，所有输出文字必须使用中文。`,
  ]
    .filter(Boolean)
    .join("\n\n");

    const emitSectionArtifact = async (section: RewriteSection, stage: string, message: string) => {
      await reportProgress?.({
        stage,
        message,
        current: index + 1,
        total: resumeBlocks.length,
        progress: Math.round(15 + ((index + 1) / Math.max(resumeBlocks.length, 1)) * 70),
        data: {
          artifactType: "rewrite_section",
          sectionLabel: section.sectionLabel,
          originalText: section.originalText,
          rewrittenText: section.rewrittenText,
          explanation: section.explanation,
          targetDimensions: section.targetDimensions,
        },
      });
    };

    const requestModelSectionRewrite = async (extraInstructions: string, operation: string, model = getLLMConfig().qualityModel) => {
      const result = await callChatJSON<{
        sectionKey?: string;
        sectionLabel?: string;
        originalText?: string;
        rewrittenText?: string;
        explanation?: string;
        targetDimensions?: string[];
      }>(
        [
          {
            role: "system",
            content:
              systemPrompt +
              "\n\n你的任务是重新改写单个简历片段。必须由大模型完成表达重写，不允许只做格式整理；必须事实安全、明显改写、可直接放入简历。输出必须是 JSON。",
          },
          { role: "user", content: buildSectionPrompt(extraInstructions) },
        ],
        {
          timeoutMs: 90000,
          retries: 1,
          temperature: 0.24,
          model,
          maxTokens: 1800,
          operation,
        }
      );

      const section = normalizeGeneratedSection(result, block);
      const validation = validateRewriteConsistency({
        resumeText: input.resumeText,
        sections: [section],
        fullRewrittenText: section.rewrittenText,
        aipmTermsHighlighted: [],
      });

      if (!validation.isValid) {
        throw new Error(`模型重写仍存在事实风险：${validation.issues.map((issue) => issue.message).join("；")}`);
      }
      const qualityIssue = getRewriteQualityIssue(section);
      if (qualityIssue) {
        console.warn(`AIPM rewrite quality warning section=${index} ${operation}: ${qualityIssue}`);
        throw new Error(`模型重写格式不合格：${qualityIssue}`);
      }

      await emitSectionArtifact(
        section,
        "rewrite_section_model_retry_done",
        `第 ${index + 1}/${resumeBlocks.length} 段已由模型重新改写：${section.rewrittenText.replace(/\s+/g, " ").slice(0, 96)}……`,
      );
      return { section, issues: [] };
    };

    try {
      await reportProgress?.({
        stage: "rewrite_section",
        message: `正在生成第 ${index + 1}/${resumeBlocks.length} 段岗位定制简历`,
        current: index + 1,
        total: resumeBlocks.length,
        progress: Math.round(8 + (index / Math.max(resumeBlocks.length, 1)) * 70),
      });
      const result = await callChatJSON<{
        sectionKey?: string;
        sectionLabel?: string;
        originalText?: string;
        rewrittenText?: string;
        explanation?: string;
        targetDimensions?: string[];
      }>(
      [
      {
        role: "system",
        content:
          systemPrompt +
            "\n\n你的任务是强改写单个简历片段，不是格式整理。你必须让表达明显更像 AI 产品经理简历，体现职责、动作、结果和可迁移能力；但绝对不能编造事实。JD 只指导表达，不能改写事实。输出必须是 JSON。",
      },
        { role: "user", content: buildSectionPrompt() },
      ],
        {
          timeoutMs: 75000,
          retries: 1,
          temperature: 0.38,
          model: getLLMConfig().qualityModel,
          maxTokens: 1800,
          operation: `rewrite-section-${index}`,
        }
    );

      const section = normalizeGeneratedSection(result, block);
      const validation = validateRewriteConsistency({
      resumeText: input.resumeText,
        sections: [section],
        fullRewrittenText: section.rewrittenText,
        aipmTermsHighlighted: [],
    });

      const qualityIssue = getRewriteQualityIssue(section);
      if (validation.isValid && !qualityIssue) {
        await emitSectionArtifact(section, "rewrite_section_validated", `第 ${index + 1}/${resumeBlocks.length} 段已改写：${section.rewrittenText.replace(/\s+/g, " ").slice(0, 96)}……`);
        return { section, issues: [] };
      }

      if (validation.isValid && qualityIssue) {
        await reportProgress?.({
          stage: "rewrite_quality_retry",
          message: `第 ${index + 1}/${resumeBlocks.length} 段改写结构不够好，正在重新生成`,
          current: index + 1,
          total: resumeBlocks.length,
          progress: Math.round(12 + ((index + 1) / Math.max(resumeBlocks.length, 1)) * 70),
        });
        return await requestModelSectionRewrite(
          [
            "## 上一版质量问题",
            `- ${qualityIssue}`,
            "请重新输出：不要简单扩写原文；压缩重复信息；用更清晰的简历 bullet 表达职责、动作、产出和可迁移能力。",
            "每条 bullet 必须比原句更像正式简历，不要写成长段散文。",
          ].join("\n"),
          `rewrite-section-quality-retry-${index}`,
        );
      }

      await reportProgress?.({
        stage: "rewrite_repair",
        message: `第 ${index + 1}/${resumeBlocks.length} 段触发事实护栏，正在保守修复`,
        current: index + 1,
        total: resumeBlocks.length,
        progress: Math.round(12 + ((index + 1) / Math.max(resumeBlocks.length, 1)) * 70),
      });
      const repaired = await callChatJSON<{
        sectionKey?: string;
        sectionLabel?: string;
        originalText?: string;
        rewrittenText?: string;
        explanation?: string;
        targetDimensions?: string[];
      }>(
      [
      {
        role: "system",
        content:
          systemPrompt +
            "\n\n你的任务是修复单个越过事实边界的简历片段。你必须删除所有新增事实，只保留原简历已有信息。输出必须是 JSON。",
      },
      {
        role: "user",
          content: buildSectionPrompt(
          [
            "## 上一版违反的事实边界",
              ...validation.issues.map(
              (issue) => `- ${issue.message}：${issue.examples.join("、")}`
            ),
              "请基于同一片段重新输出事实安全但仍有明显改写价值的版本，删除所有上述新增内容，不要退回成原文复述。",
          ].join("\n")
        ),
      },
      ],
        {
          timeoutMs: 60000,
          retries: 1,
          temperature: 0.16,
          model: getLLMConfig().qualityModel,
          maxTokens: 1200,
          operation: `rewrite-section-repair-${index}`,
        }
    );

      const repairedSection = normalizeGeneratedSection(repaired, block);
      const repairedValidation = validateRewriteConsistency({
      resumeText: input.resumeText,
        sections: [repairedSection],
        fullRewrittenText: repairedSection.rewrittenText,
        aipmTermsHighlighted: [],
    });

      const repairedQualityIssue = getRewriteQualityIssue(repairedSection);
      if (repairedValidation.isValid && !repairedQualityIssue) {
        await emitSectionArtifact(repairedSection, "rewrite_section_repaired", `第 ${index + 1}/${resumeBlocks.length} 段已完成事实安全改写：${repairedSection.rewrittenText.replace(/\s+/g, " ").slice(0, 96)}……`);
        return { section: repairedSection, issues: validation.issues };
      }
      if (repairedValidation.isValid && repairedQualityIssue) {
        await reportProgress?.({
          stage: "rewrite_quality_retry",
          message: `第 ${index + 1}/${resumeBlocks.length} 段修复后仍有断句或格式问题，正在重新生成`,
          current: index + 1,
          total: resumeBlocks.length,
          progress: Math.round(15 + ((index + 1) / Math.max(resumeBlocks.length, 1)) * 70),
        });
        return await requestModelSectionRewrite(
          [
            "## 上一版修复后的格式问题",
            `- ${repairedQualityIssue}`,
            "请重新输出，必须保证每一行都是完整句，不能以逗号/顿号/连接词结尾；经历类模块优先使用 bullet，但不要为了凑数量编造内容。",
          ].join("\n"),
          `rewrite-section-repair-quality-retry-${index}`,
        );
      }

      await reportProgress?.({
        stage: "rewrite_section_model_retry",
        message: `第 ${index + 1}/${resumeBlocks.length} 段修复仍不理想，正在让模型重新改写`,
        current: index + 1,
        total: resumeBlocks.length,
        progress: Math.round(15 + ((index + 1) / Math.max(resumeBlocks.length, 1)) * 70),
      });
      try {
        return await requestModelSectionRewrite(
          [
            "## 第三次模型重写要求",
            "上一版仍存在事实风险。请重新改写，不要退回原文，不要只做格式整理。",
            "必须删除所有无法被原文支撑的信息，同时保留明显的 AI 产品经理表达升级。",
            ...[...validation.issues, ...repairedValidation.issues].map((issue) => `- 风险：${issue.message}；示例：${issue.examples.join("、")}`),
          ].join("\n"),
          `rewrite-section-model-retry-${index}`,
        );
      } catch (retryError) {
        console.error(`AIPM rewrite model retry still risky: ${index}`, retryError);
        await emitSectionArtifact(
          repairedSection,
          "rewrite_section_risky_model_output",
          `第 ${index + 1}/${resumeBlocks.length} 段保留模型修复版，并标记事实风险供用户核查`,
        );
        return { section: repairedSection, issues: [...validation.issues, ...repairedValidation.issues] };
      }
    } catch (err) {
      console.error(`AIPM rewrite section model retry: ${index}`, err);
      await reportProgress?.({
        stage: "rewrite_section_model_retry",
        message: `第 ${index + 1}/${resumeBlocks.length} 段模型未完整返回，正在换模型重新改写`,
        current: index + 1,
        total: resumeBlocks.length,
        progress: Math.round(15 + ((index + 1) / Math.max(resumeBlocks.length, 1)) * 70),
      });
      try {
        return await requestModelSectionRewrite(
          [
            "## 模型补写要求",
            "上一轮模型未完整返回。请重新生成当前片段的岗位定制改写。",
            "必须明显改写表达，不能只整理标点、换行或项目符号；不能新增事实。",
          ].join("\n"),
          `rewrite-section-model-backup-${index}`,
          getLLMConfig().model,
        );
      } catch (backupError) {
        console.error(`AIPM rewrite backup model failed: ${index}`, backupError);
        const fallbackRewritten = buildSafeFallbackRewriteText(block);
        const fallbackSection: RewriteSection = {
          sectionKey: block.sectionKey,
          sectionLabel: block.sectionLabel,
          originalText: block.content,
          rewrittenText: fallbackRewritten || block.content,
          explanation: "模型多次改写失败，已使用不新增事实的安全轻改写版本，建议你重点核查措辞是否贴合真实经历。",
          targetDimensions: [],
        };
        await emitSectionArtifact(
          fallbackSection,
          "rewrite_section_soft_fallback",
          `第 ${index + 1}/${resumeBlocks.length} 段模型改写多次失败，已生成安全轻改写版`,
        );
        const fallbackIssue: RewriteResult["factGuard"]["issues"][number] = {
          code: "NEW_PROPER_NOUN",
          message: "该段未能获得稳定模型改写，已生成安全轻改写版，请核查措辞",
          examples: [block.sectionLabel],
          sectionLabel: block.sectionLabel,
        };
        return { section: fallbackSection, issues: [fallbackIssue] };
      }
    }
  };

  if (!resumeBlocks.length) {
    await reportProgress?.({
      stage: "rewrite_fallback",
      message: "简历内容为空或结构不清晰，无法进行大模型改写",
      current: 1,
      total: 1,
      progress: 80,
    });
    throw new Error("简历内容为空或结构不清晰，无法进行岗位定制改写");
  }

  const summaryResult = await generateSummarySection();
  const sectionResults: Array<{ section: RewriteSection; issues: RewriteResult["factGuard"]["issues"] }> = [];
  for (const [index, block] of resumeBlocks.entries()) {
    try {
      sectionResults.push(await generateSection(block, index));
    } catch (sectionErr) {
      console.error(`AIPM rewrite section ${index} unexpected failure, fallback to original`, sectionErr);
      const fallbackText = buildSafeFallbackRewriteText(block);
      sectionResults.push({
        section: {
          sectionKey: block.sectionKey,
          sectionLabel: block.sectionLabel,
          originalText: block.content,
          rewrittenText: fallbackText || block.content,
          explanation: "该段未能完成稳定模型改写，已使用不新增事实的安全轻改写版本，请手动核查。",
          targetDimensions: [],
        },
        issues: [
          {
            code: "NEW_PROPER_NOUN",
            message: "该段未能完成稳定模型改写，已生成安全轻改写版",
            examples: [block.sectionLabel],
            sectionLabel: block.sectionLabel,
          },
        ],
      });
    }
  }
  await reportProgress?.({
    stage: "rewrite_merging",
    message: "正在合并分段改写结果并生成完整简历",
    current: resumeBlocks.length,
    total: resumeBlocks.length,
    progress: 92,
  });
  const sections = [summaryResult.section, ...sectionResults.map((result) => result.section)];
  let guardIssues = [summaryResult, ...sectionResults].flatMap((result) => result.issues);
  const changedCount = sections.filter(
    (section) => section.rewrittenText.replace(/\s+/g, "") !== section.originalText.replace(/\s+/g, ""),
  ).length;

  await reportProgress?.({
    stage: "rewrite_final_assembly",
    message: "正在用稳定格式器整理完整简历结构",
    current: resumeBlocks.length,
    total: resumeBlocks.length,
    progress: 96,
  });

  const fullRewrittenText = formatFullRewrittenResume(sections);
  const fullValidation = validateRewriteConsistency({
    resumeText: input.resumeText,
    sections,
    fullRewrittenText,
    aipmTermsHighlighted: [],
  });
  if (!fullValidation.isValid) {
    guardIssues = [...guardIssues, ...fullValidation.issues];
  }
  const factGuard = guardIssues.length > 0
    ? buildRewriteFactGuard(changedCount > 0 ? "repaired" : "fallback", guardIssues)
    : buildRewriteFactGuard("passed", []);

  return {
    beforeScore: 58,
    afterScore: changedCount > 0 ? 72 : 60,
    rewriteStrategy: input.decisionReport
      ? "已读取本次投递决策报告，把维度差距、面试预判弱点和两周补齐方案的关键动作作为本次改写的目标方向；每段独立改写、独立事实校验，最终由系统按模块标题与项目符号稳定排版。"
      : "已按简历片段分阶段调用大模型强改写：每段独立生成、独立事实校验；最终简历由系统按模块标题和项目符号稳定排版，避免模型把内容压成一段。",
    sections,
    fullRewrittenText,
    aipmTermsHighlighted: [],
    factGuard,
  };
}

// ---------------------------------------------------------------------------
// AIPM Copilot: 面试题生成
// ---------------------------------------------------------------------------

export async function generateInterviewQuestions(input: {
  sessionId: string;
  resumeText: string;
  jobDescriptionText: string;
  jobTitle?: string | null;
  userIdentity: string;
  targetCompany?: string | null;
  roleSpecialty?: string | null;
  questionCount?: number;
  includeCategories?: InterviewQuestionCategory[];
  onProgress?: GenerationProgressCallback;
}): Promise<InterviewQuestionItem[]> {
  const systemPrompt = buildAIPMSystemPrompt(input.userIdentity);
  const count = input.questionCount || 15;
  const generationContext = buildGenerationContext(input);
  const resumeForPrompt = clipInput(generationContext.resumeBrief, 3200);
  const jdForPrompt = clipInput(generationContext.jdBrief, 2200);
  const validCategories: InterviewQuestionCategory[] = [
    "experience_probe",
    "aipm_professional",
    "scenario_design",
    "behavioral",
    "career_switch_motivation",
  ];
  const requestedCategories = input.includeCategories?.length
    ? input.includeCategories
    : validCategories.filter((category) => input.userIdentity === "career_changer" || category !== "career_switch_motivation");
  const batches: Array<{ categories: InterviewQuestionCategory[]; count: number }> = input.includeCategories?.length
    ? [{ categories: requestedCategories, count }]
    : [
        { categories: ["experience_probe"], count: 4 },
        { categories: ["aipm_professional", "scenario_design"], count: 6 },
        { categories: ["behavioral", ...(input.userIdentity === "career_changer" ? (["career_switch_motivation"] as InterviewQuestionCategory[]) : [])], count: 5 },
      ];
  const reportProgress = input.onProgress;
  const questionSourceText = `${input.resumeText}\n${input.jobDescriptionText}`;
  const isHighSignalQuestion = (question: InterviewQuestionItem) => {
    const combined = `${question.question}\n${question.whyAsked}`;
    const forbiddenGeneric = /请详细描述|请谈谈|你如何看待|为什么想做|介绍一下|AIPM 岗位会考察|这类问题能判断|面试官会关注|最能体现产品潜力/.test(combined);
    const hasInterviewerRisk = /怀疑|验证|判断|防御|担心|筛掉|追问|风险|真实性|个人贡献|取舍|边界|指标/.test(question.whyAsked);
    return question.question.trim().length >= 28
      && question.whyAsked.trim().length >= 45
      && !forbiddenGeneric
      && hasInterviewerRisk
      && hasSourceAnchoredContent(combined, questionSourceText, 2);
  };

  await reportProgress?.({
    stage: "questions_planning",
    message: `已拆分面试题生成任务，共 ${batches.length} 批`,
    current: 0,
    total: batches.length,
    progress: 5,
  });

  const normalizeQuestions = (
    questions: Array<{
      id?: string;
      category?: string;
      question?: string;
      whyAsked?: string;
      answerFramework?: string;
      sampleAnswer?: string;
      keyPoints?: string[];
      pitfalls?: string[];
    }>,
  ) =>
    questions
      .filter((q) => q.question && q.whyAsked)
      .map((q, i): InterviewQuestionItem => ({
        id: q.id || `iq_${String(i + 1).padStart(3, "0")}`,
        category: validCategories.includes(q.category as InterviewQuestionCategory)
          ? (q.category as InterviewQuestionCategory)
          : "aipm_professional",
        question: q.question ?? "",
        whyAsked: q.whyAsked ?? "",
        answerFramework: q.answerFramework ?? "",
        sampleAnswer: (q.sampleAnswer ?? "").trim(),
        keyPoints: Array.isArray(q.keyPoints) ? q.keyPoints.slice(0, 3) : [],
        pitfalls: Array.isArray(q.pitfalls) ? q.pitfalls.slice(0, 2) : [],
      }))
      .filter(isHighSignalQuestion);

  const generateBatch = async (batch: { categories: InterviewQuestionCategory[]; count: number }) => {
    const categoriesHint = `题目分类限制为：${batch.categories.join("、")}`;
    const userPrompt = [
    `## 目标岗位：${input.jobTitle ?? "AI 产品经理"}`,
    input.targetCompany ? `## 目标公司：${input.targetCompany}` : "",
    `## JD\n${jdForPrompt}`,
    `## 求职者简历\n${resumeForPrompt}`,
    `## 求职者身份：${input.userIdentity === "career_changer" ? "转岗者" : "应届生/实习生"}${input.roleSpecialty ? `（原岗位方向：${input.roleSpecialty}）` : ""}`,
    `## 快速题目列表质量红线（必须全部满足，否则视为不合格）`,
    `1. 每道题必须引用 1 个简历原文证据短句 + 1 个 JD 原文关键词/短句；没有证据就问“证据缺口”，不要假装有项目。`,
    `2. 题目必须像真实面试官的高压追问：问个人贡献、取舍依据、指标证明、模型边界、失败复盘或迁移动机；不允许泛泛问“请详细描述/请谈谈/你如何看待”。`,
    `3. whyAsked 必须写成“面试官怀疑什么 + 为什么这份简历/JD 会触发这个怀疑 + 这题要验证什么”，必须出现怀疑/验证/风险/边界/个人贡献/指标等判断词。`,
    `4. 这一步只生成题目列表，不生成回答框架、完整话术、话术要点或避坑点；answerFramework/sampleAnswer/keyPoints/pitfalls 不要输出或留空。`,
    `5. 严禁输出“提升能力、加强理解、完善表达、持续学习、积累经验”等空话。`,
    `6. 严禁编造简历里没有的项目、数据、公司、模型或角色；只能基于真实证据展开。`,
    ``,
    `## 生成要求`,
    `请生成 ${batch.count} 道面试题，${categoriesHint}`,
    `每道题必须和这份简历+JD 强相关，并且和同批其它题之间不能重复角度（一题查经历真实性，一题查产品判断，一题查 AI 边界，一题查指标/数据，一题查行为/动机等）。题目要尖锐，但不能编造用户没有的事实。`,
    ``,
    `## 输出 JSON`,
    `{ "questions": [{id, category, question, whyAsked}] }`,
    `- id: 格式为 "iq_001"、"iq_002"...`,
    `- question: 55-120 字，必须出现简历证据或 JD 关键词，必须是真实面试官会问出口的具体追问。`,
    `- whyAsked: 70-130 字，说明这道题在筛选什么、怀疑什么、和简历/JD 的哪一句关联。`,
    ``,
    `重要：除 JSON 字段名和 id/category 的枚举值外，所有输出文字（question、whyAsked）必须全部使用中文。`,
  ].join("\n\n");

    const result = await callChatJSON<{
      questions: Array<{
        id: string;
        category: string;
        question: string;
        whyAsked: string;
        answerFramework: string;
        sampleAnswer: string;
        keyPoints: string[];
        pitfalls: string[];
      }>;
    }>(
      [
      { role: "system", content: systemPrompt + "\n\n你是顶级 AI 产品经理面试官。你的任务是生成面试题，输出必须是 JSON。" },
      { role: "user", content: userPrompt },
      ],
      {
        timeoutMs: 90000,
        retries: 2,
        temperature: 0.28,
        model: getLLMConfig().fastModel,
        maxTokens: 1400,
        operation: `interview-questions:${batch.categories.join("+")}`,
        salvage: (raw) => salvageInterviewQuestionsJSON(raw),
      }
    );

    const normalized = normalizeQuestions(Array.isArray(result.questions) ? result.questions : []).slice(0, batch.count);
    if (normalized.length < Math.max(1, Math.ceil(batch.count * 0.6))) {
      throw new Error("模型生成的高信号面试题不足");
    }
    return normalized;
  };

  const collected: InterviewQuestionItem[] = [];
  for (const [batchIndex, batch] of batches.entries()) {
    try {
      await reportProgress?.({
        stage: "questions_batch",
        message: `正在生成面试预测题第 ${batchIndex + 1}/${batches.length} 批`,
        current: batchIndex + 1,
        total: batches.length,
        progress: Math.round(10 + (batchIndex / Math.max(batches.length, 1)) * 72),
      });
      const batchQuestions = await generateBatch(batch);
      collected.push(...batchQuestions);
      await reportProgress?.({
        stage: "questions_batch_done",
        message: `第 ${batchIndex + 1}/${batches.length} 批已生成 ${batchQuestions.length} 道题`,
        current: batchIndex + 1,
        total: batches.length,
        progress: Math.round(18 + ((batchIndex + 1) / Math.max(batches.length, 1)) * 70),
      });
    } catch (err) {
      console.error(`interview question batch fell back: ${batch.categories.join(",")}`, err);
      await reportProgress?.({
        stage: "questions_batch_fallback",
        message: `第 ${batchIndex + 1}/${batches.length} 批高质量模型未完整返回，正在用岗位模板补齐`,
        current: batchIndex + 1,
        total: batches.length,
        progress: Math.round(18 + ((batchIndex + 1) / Math.max(batches.length, 1)) * 70),
      });
      collected.push(
        ...buildFallbackInterviewQuestions({
          ...input,
          questionCount: batch.count,
          includeCategories: batch.categories,
        }),
      );
    }
  }

  await reportProgress?.({
    stage: "questions_merging",
    message: "正在去重、补齐并排序面试预测题",
    current: batches.length,
    total: batches.length,
    progress: 92,
  });
  const deduped = collected.filter((question, index, arr) => {
    const normalized = question.question.replace(/\s+/g, "");
    return normalized && arr.findIndex((item) => item.question.replace(/\s+/g, "") === normalized) === index;
  });
  const fallbackNeeded = Math.max(0, count - deduped.length);
  const completed = fallbackNeeded
    ? [
        ...deduped,
        ...buildFallbackInterviewQuestions({
          ...input,
          questionCount: fallbackNeeded,
          includeCategories: requestedCategories,
        }),
      ]
    : deduped;

  return completed.slice(0, count).map((question, index) => ({
    ...question,
    id: `iq_${String(index + 1).padStart(3, "0")}`,
  }));
}

export async function generateInterviewQuestionDetail(input: {
  resumeText: string;
  jobDescriptionText: string;
  jobTitle?: string | null;
  userIdentity: string;
  targetCompany?: string | null;
  roleSpecialty?: string | null;
  question: InterviewQuestionItem;
  onProgress?: GenerationProgressCallback;
}): Promise<Pick<InterviewQuestionItem, "answerFramework" | "sampleAnswer" | "keyPoints" | "pitfalls">> {
  const systemPrompt = buildAIPMSystemPrompt(input.userIdentity);
  const generationContext = buildGenerationContext(input);
  const resumeForPrompt = clipInput(generationContext.resumeBrief, 3000);
  const jdForPrompt = clipInput(generationContext.jdBrief, 2000);
  const answerSourceText = `${input.resumeText}\n${input.jobDescriptionText}\n${input.question.question}\n${input.question.whyAsked}`;
  const isHighSignalAnswer = (answer: {
    answerFramework?: string;
    sampleAnswer?: string;
    keyPoints?: string[];
    pitfalls?: string[];
  }) => {
    const framework = answer.answerFramework?.trim() ?? "";
    const sample = answer.sampleAnswer?.trim() ?? "";
    const combined = `${framework}\n${sample}\n${(answer.keyPoints ?? []).join("\n")}\n${(answer.pitfalls ?? []).join("\n")}`;
    const requiredFrameworkBlocks = ["先给结论", "证据锚点", "拆解逻辑", "风险兜底"];
    const genericPhrases = /提升能力|加强理解|持续学习|积累经验|多做准备|我会先定义清楚|这个问题我想从三层来回答|如果有机会进入团队|我希望先在/.test(combined);
    return requiredFrameworkBlocks.every((block) => framework.includes(block))
      && sample.length >= 220
      && sample.length <= 520
      && /我/.test(sample)
      && /面试官|追问|如果被问到|我会补充|边界|取舍|指标|复盘/.test(combined)
      && Array.isArray(answer.keyPoints)
      && answer.keyPoints.length >= 2
      && Array.isArray(answer.pitfalls)
      && answer.pitfalls.length >= 2
      && !genericPhrases
      && hasSourceAnchoredContent(combined, answerSourceText, 2);
  };

  await input.onProgress?.({
    stage: "question_detail",
    message: "正在生成本题回答框架和参考话术",
    progress: 30,
  });

  const buildDetailMessages = (extraInstructions?: string) => [
    {
      role: "system" as const,
      content: systemPrompt + "\n\n你是顶级 AI 产品经理面试官兼面试教练。你的任务不是写模板答案，而是基于候选人真实简历和 JD，生成一个能经得起追问的回答包。输出必须是 JSON。",
    },
    {
      role: "user" as const,
      content: [
        `## 目标岗位：${input.jobTitle ?? "AI 产品经理"}`,
        input.targetCompany ? `## 目标公司：${input.targetCompany}` : "",
        `## JD\n${jdForPrompt}`,
        `## 求职者简历\n${resumeForPrompt}`,
        `## 求职者身份：${input.userIdentity === "career_changer" ? "转岗者" : "应届生/实习生"}${input.roleSpecialty ? `（原岗位方向：${input.roleSpecialty}）` : ""}`,
        "",
        "## 需要补全的面试题",
        `分类：${input.question.category}`,
        `题目：${input.question.question}`,
        `为什么会问：${input.question.whyAsked}`,
        "",
        "## 回答包质量红线",
        "1. 必须只基于简历/JD/题目已有事实作答；没有数字、项目名、工具名就不要编造。",
        "2. answerFramework 必须严格包含 4 段标题：先给结论｜证据锚点｜拆解逻辑｜风险兜底，每段 1-2 句，能直接指导用户组织回答。",
        "3. sampleAnswer 必须 220-520 字，第一人称，可直接念出口；必须引用至少 1 个简历证据短句或 JD 关键词，并主动处理面试官的怀疑点。",
        "4. sampleAnswer 不能像模板：禁止“我会先定义清楚”“这个问题我想从三层回答”“如果有机会进入团队”等套话。",
        "5. 必须体现结构：先下判断，再用简历证据证明，再拆方法/取舍/指标，最后补一句如果被追问时如何防御。",
        "6. keyPoints 给 2-3 条可复用句子，每条 18-45 字；pitfalls 给 2 条具体坑，每条 16-36 字。",
        extraInstructions ?? "",
        "",
        "## 输出 JSON",
        "{ \"answerFramework\": string, \"sampleAnswer\": string, \"keyPoints\": string[], \"pitfalls\": string[] }",
      ].filter(Boolean).join("\n\n"),
    },
  ];

  const result = await callChatJSON<{
    answerFramework?: string;
    sampleAnswer?: string;
    keyPoints?: string[];
    pitfalls?: string[];
  }>(
    buildDetailMessages(),
    {
      timeoutMs: 120000,
      retries: 1,
      temperature: 0.24,
      model: getLLMConfig().qualityModel,
      maxTokens: 2200,
      operation: `interview-question-detail:${input.question.category}`,
    },
  );

  const repairedResult = isHighSignalAnswer(result)
    ? result
    : await callChatJSON<{
        answerFramework?: string;
        sampleAnswer?: string;
        keyPoints?: string[];
        pitfalls?: string[];
      }>(
        buildDetailMessages(
          [
            "## 上一版问题",
            "- 回答包不够具体或过于模板化，未通过质量校验。",
            "- 请重新生成：必须引用简历/JD证据，必须主动回应面试官怀疑点，必须按「先给结论｜证据锚点｜拆解逻辑｜风险兜底」组织。",
          ].join("\n")
        ),
        {
          timeoutMs: 120000,
          retries: 1,
          temperature: 0.16,
          model: getLLMConfig().qualityModel,
          maxTokens: 2200,
          operation: `interview-question-detail-repair:${input.question.category}`,
        },
      );
  const evidenceLine = (generationContext.resumeEvidenceLines[0] ?? "简历中这段经历").replace(/\s+/g, " ").slice(0, 80);
  const jdLine = (generationContext.jdEvidenceLines[0] ?? input.jobTitle ?? "目标岗位").replace(/\s+/g, " ").slice(0, 70);
  const safeFallbackDetail = {
    answerFramework: [
      `先给结论：这题不要泛泛讲能力，先说明“${evidenceLine}”能部分支撑“${jdLine}”，同时承认还需要补充边界。`,
      `证据锚点：只引用简历已有事实，围绕本人动作、协作对象、产出物或结果证据展开；没有数字就不要临时编指标。`,
      "拆解逻辑：按目标、约束、关键取舍、验证方式四步回答，让面试官看到判断过程，而不是只听到经历复述。",
      "风险兜底：如果被追问细节，主动说明哪部分是个人负责、哪部分是团队结果，以及下一次会如何补验证。",
    ].join("\n"),
    sampleAnswer: `我的判断是，这题核心不是让我复述经历，而是验证我能不能把“${evidenceLine}”和岗位里的“${jdLine}”建立真实连接。我会先讲清这段经历里的目标和我本人负责的部分，再说明我当时做过哪些拆解、推进或验证动作。如果原简历没有直接给出指标，我不会临时编数字，而会把可验证产出讲清楚，比如文档、方案、协作结果或复盘结论。然后我会补充一个取舍点：当时为什么优先做这一部分，放弃了什么，以及这个判断如何迁移到目标岗位。最后如果面试官继续追问，我会主动区分个人贡献和团队成果，并说明这段经历还缺少哪些更强证据，避免把答案讲成包装过度的模板。`,
    keyPoints: ["先承认题目在验证个人贡献，不要急着背经历", "只用简历已有事实，不临时编造指标或项目", "主动补一个取舍点和一个可追问边界"],
    pitfalls: ["把团队成果全说成个人贡献", "没有证据时硬编数字或工具"],
  };
  const finalResult = isHighSignalAnswer(repairedResult) ? repairedResult : safeFallbackDetail;

  await input.onProgress?.({
    stage: "question_detail_done",
    message: "本题回答包已生成",
    progress: 100,
  });

  return {
    answerFramework: finalResult.answerFramework?.trim() || "",
    sampleAnswer: finalResult.sampleAnswer?.trim() || "",
    keyPoints: Array.isArray(finalResult.keyPoints) ? finalResult.keyPoints.filter(Boolean).slice(0, 3) : [],
    pitfalls: Array.isArray(finalResult.pitfalls) ? finalResult.pitfalls.filter(Boolean).slice(0, 2) : [],
  };
}
