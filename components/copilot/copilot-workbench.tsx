"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { markSessionPaid, readPaidSessions, rememberLocalSession } from "@/lib/browser-storage";
import { FULL_REPORT_PRODUCT_CODE } from "@/lib/product-codes";
import { DIMENSION_MAP } from "@/lib/aipm-model";
import type {
  DecisionReport,
  DimensionAnalysis,
  RewriteResult,
  InterviewQuestionItem,
  InterviewQuestionCategory,
  UserIdentity,
  CurrentRole,
  UserProfile,
  UploadResumePdfResponse,
  PolishResumeTextResponse,
  GenerationProgressEvent,
} from "@/types/api";
import { AIPMTermHighlighter } from "./aipm-term-highlighter";
import { ProgressBar } from "./progress-bar";
import { PaywallModal } from "./paywall-modal";
import { GenerationActivity } from "@/components/generation-activity";
import { ProductIcon } from "@/components/ui/product-icons";

type Step = 1 | 2 | 3 | 4;
type DimensionSortMode = "gap" | "original" | "score";
type LiveProgressState = { message: string; progress?: number } | null;
type GenerationOperation = "analysis" | "rewrite" | "questions" | "structure" | "export" | "upload";
type RewriteArtifact = {
  artifactType: "rewrite_section";
  sectionLabel: string;
  originalText: string;
  rewrittenText: string;
  explanation?: string;
  targetDimensions?: string[];
};
type GenerationTraceItem = {
  id: string;
  operation: GenerationOperation;
  label: string;
  message: string;
  progress?: number;
  status: "running" | "done" | "error";
  timestamp: number;
  artifact?: RewriteArtifact;
};
type RegenerateConfirmState =
  | {
      action: "analysis" | "rewrite" | "question-detail";
      title: string;
      description: string;
      confirmLabel: string;
      questionId?: string;
    }
  | null;

const STEPS = [
  { id: 1, label: "简历预处理" },
  { id: 2, label: "目标岗位" },
  { id: 3, label: "投递决策" },
  { id: 4, label: "结果产出" },
] as const;

const IDENTITY_OPTIONS: { value: UserIdentity; label: string }[] = [
  { value: "career_changer", label: "我是转岗者" },
  { value: "fresh_graduate", label: "我是应届生/实习生" },
];

const ROLE_OPTIONS: { value: CurrentRole; label: string }[] = [
  { value: "product_manager", label: "产品经理" },
  { value: "operation", label: "运营" },
  { value: "developer", label: "研发/工程师" },
  { value: "data_analyst", label: "数据分析" },
  { value: "designer", label: "设计" },
  { value: "other", label: "其他" },
];

const ROLE_SPECIALTY_MAP: Record<string, { value: string; label: string }[]> = {
  product_manager: [
    { value: "b2b_pm", label: "B 端产品经理" },
    { value: "b2c_pm", label: "C 端产品经理" },
    { value: "platform_pm", label: "平台产品经理" },
    { value: "strategy_pm", label: "策略产品经理" },
    { value: "commercialize_pm", label: "商业化产品经理" },
    { value: "growth_pm", label: "增长产品经理" },
    { value: "hardware_pm", label: "硬件产品经理" },
    { value: "ai_pm", label: "AI 产品经理" },
    { value: "data_pm", label: "数据产品经理" },
    { value: "other_pm", label: "其他产品经理" },
  ],
  operation: [
    { value: "user_ops", label: "用户运营" },
    { value: "content_ops", label: "内容运营" },
    { value: "activity_ops", label: "活动运营" },
    { value: "community_ops", label: "社区运营" },
    { value: "channel_ops", label: "渠道运营" },
    { value: "product_ops", label: "产品运营" },
    { value: "commercialize_ops", label: "商业化运营" },
    { value: "other_ops", label: "其他运营" },
  ],
  developer: [
    { value: "frontend_dev", label: "前端工程师" },
    { value: "backend_dev", label: "后端工程师" },
    { value: "fullstack_dev", label: "全栈工程师" },
    { value: "mobile_dev", label: "移动端开发" },
    { value: "algorithm_dev", label: "算法工程师" },
    { value: "data_dev", label: "数据开发" },
    { value: "test_dev", label: "测试工程师" },
    { value: "other_dev", label: "其他研发" },
  ],
  data_analyst: [
    { value: "business_analyst", label: "业务数据分析" },
    { value: "bi_analyst", label: "BI 分析师" },
    { value: "user_research", label: "用户研究" },
    { value: "market_analyst", label: "市场分析" },
    { value: "other_analyst", label: "其他分析" },
  ],
  designer: [
    { value: "ui_designer", label: "UI 设计师" },
    { value: "ux_designer", label: "UX 设计师" },
    { value: "interaction_designer", label: "交互设计师" },
    { value: "visual_designer", label: "视觉设计师" },
    { value: "other_designer", label: "其他设计" },
  ],
  other: [
    { value: "marketing", label: "市场营销" },
    { value: "sales", label: "销售" },
    { value: "hr", label: "人力资源" },
    { value: "finance", label: "财务" },
    { value: "consulting", label: "咨询" },
    { value: "teacher", label: "教育/培训" },
    { value: "other_role", label: "其他" },
  ],
};

const CATEGORY_LABEL_MAP: Record<string, string> = {
  experience_probe: "经验追问",
  aipm_professional: "AIPM 专业",
  scenario_design: "场景设计",
  behavioral: "行为面试",
  career_switch_motivation: "转岗动机",
};

type InterviewBatchPlanItem = {
  id: string;
  label: string;
  hint: string;
  categories: InterviewQuestionCategory[];
  count: number;
};

function getInterviewBatchPlan(identity: UserIdentity): InterviewBatchPlanItem[] {
  const base: InterviewBatchPlanItem[] = [
    { id: "experience", label: "经验追问 4 题", hint: "面试官最先核验简历真实度", categories: ["experience_probe"], count: 4 },
    { id: "aipm", label: "AIPM 专业 3 题", hint: "AI 产品理解与边界判断", categories: ["aipm_professional"], count: 3 },
    { id: "scenario", label: "场景设计 3 题", hint: "结合 JD 的具体落地场景", categories: ["scenario_design"], count: 3 },
    { id: "behavioral", label: identity === "career_changer" ? "行为 + 动机 5 题" : "行为面试 5 题", hint: identity === "career_changer" ? "项目推进与转岗动机" : "项目推进与协作复盘", categories: identity === "career_changer" ? ["behavioral", "career_switch_motivation"] : ["behavioral"], count: 5 },
  ];
  return base;
}

function formatRewriteFactGuardStatus(status: RewriteResult["factGuard"]["status"]) {
  switch (status) {
    case "passed":
      return "通过";
    case "repaired":
      return "已修复";
    case "risky":
      return "有风险";
    case "fallback":
      return "已回退";
    default:
      return "未知";
  }
}

function getRecommendationTone(recommendation: DecisionReport["recommendation"]) {
  if (recommendation === "recommended") {
    return {
      card: "",
      badge: "border-[#bbf7d0] bg-[#ecfdf5] text-[#0f766e]",
      iconWrap: "bg-[#ecfdf5] text-[#0f766e]",
      progress: "bg-[#0f766e]",
    };
  }

  if (recommendation === "cautious") {
    return {
      card: "",
      badge: "border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]",
      iconWrap: "bg-[#f8fafc] text-[#64748b]",
      progress: "bg-[#64748b]",
    };
  }

  return {
    card: "",
    badge: "border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]",
    iconWrap: "bg-[#f8fafc] text-[#64748b]",
    progress: "bg-[#e11d48]",
  };
}

function getDimensionScore(currentLevel: number, requiredLevel: number) {
  if (requiredLevel <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((currentLevel / requiredLevel) * 100)));
}

function isRewriteArtifact(value: unknown): value is RewriteArtifact {
  if (!value || typeof value !== "object") return false;
  const artifact = value as Partial<RewriteArtifact>;
  return artifact.artifactType === "rewrite_section"
    && typeof artifact.sectionLabel === "string"
    && typeof artifact.originalText === "string"
    && typeof artifact.rewrittenText === "string";
}

function sortDimensions(dimensions: DimensionAnalysis[], mode: DimensionSortMode) {
  if (mode === "original") {
    return [...dimensions];
  }

  if (mode === "score") {
    return [...dimensions].sort((a, b) => {
      const scoreDiff = getDimensionScore(b.currentLevel, b.requiredLevel) - getDimensionScore(a.currentLevel, a.requiredLevel);
      if (scoreDiff !== 0) return scoreDiff;
      return a.dimensionLabel.localeCompare(b.dimensionLabel, "zh-CN");
    });
  }

  const gapPriority: Record<DimensionAnalysis["gap"], number> = {
    insufficient: 0,
    close: 1,
    met: 2,
  };

  return [...dimensions].sort((a, b) => {
    const gapDiff = gapPriority[a.gap] - gapPriority[b.gap];
    if (gapDiff !== 0) return gapDiff;

    const levelGapA = a.requiredLevel - a.currentLevel;
    const levelGapB = b.requiredLevel - b.currentLevel;
    if (levelGapB !== levelGapA) return levelGapB - levelGapA;

    return a.dimensionLabel.localeCompare(b.dimensionLabel, "zh-CN");
  });
}

function normalizeReportDimensions(dimensions: DecisionReport["dimensions"] | undefined): DimensionAnalysis[] {
  if (!Array.isArray(dimensions)) return [];
  return dimensions
    .filter((dimension) => dimension && DIMENSION_MAP.has(dimension.dimensionId))
    .map((dimension) => {
      const meta = DIMENSION_MAP.get(dimension.dimensionId);
      const requiredLevel = Math.max(0, Math.min(3, Number(dimension.requiredLevel) || 0)) as DimensionAnalysis["requiredLevel"];
      const currentLevel = Math.max(0, Math.min(3, Number(dimension.currentLevel) || 0)) as DimensionAnalysis["currentLevel"];
      const gap = ["met", "close", "insufficient"].includes(dimension.gap) ? dimension.gap : "insufficient";
      return {
        ...dimension,
        dimensionLabel: dimension.dimensionLabel || meta?.label || dimension.dimensionId,
        requiredLevel,
        currentLevel,
        gap: gap as DimensionAnalysis["gap"],
        evidence: dimension.evidence || "暂未找到可引用的简历证据。",
        remedyActions: Array.isArray(dimension.remedyActions) ? dimension.remedyActions : [],
      };
    });
}

function normalizeRewriteText(value: string) {
  return value.replace(/\s+/g, "");
}

function hasMeaningfulRewrite(result: RewriteResult, sourceResumeText: string) {
  const fullTextChanged = normalizeRewriteText(result.fullRewrittenText) !== normalizeRewriteText(sourceResumeText);
  const sectionChanged = result.sections.some(
    (section) =>
      normalizeRewriteText(section.rewrittenText) &&
      normalizeRewriteText(section.rewrittenText) !== normalizeRewriteText(section.originalText),
  );

  return fullTextChanged && sectionChanged;
}

function hasReadableResumeStructure(text: string) {
  const moduleCount = (text.match(/^##\s+/gm) ?? []).length;
  const bulletCount = (text.match(/^- /gm) ?? []).length;
  const hasLongParagraph = text
    .split(/\n+/)
    .some((line) => line.trim().length > 170 && !/^##\s+/.test(line.trim()));
  return moduleCount >= 2 && bulletCount >= 3 && !hasLongParagraph;
}

function formatRewriteResultForEditor(result: RewriteResult) {
  if (hasReadableResumeStructure(result.fullRewrittenText)) {
    return result.fullRewrittenText.trim();
  }

  return result.sections
    .map((section) => {
      const body = section.rewrittenText
        .replace(/\r/g, "")
        .replace(/\s+(?=- )/g, "\n")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.startsWith("## "));
      return [`## ${section.sectionLabel}`, ...body].join("\n");
    })
    .join("\n\n")
    .trim();
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 150000) {
  const controller = new AbortController();
  const externalSignal = init.signal;
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (!timedOut && externalSignal?.aborted) {
        throw new Error("已手动停止生成");
      }
      throw new Error("生成时间过长，请稍后重试。我们已经减少了失败概率，如果仍然超时，建议先缩短简历或 JD 后再生成。");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

async function readGenerationEventStream<T>(
  response: Response,
  onProgress: (progress: LiveProgressState) => void,
  onTrace?: (event: GenerationProgressEvent) => void,
): Promise<T> {
  if (!response.body) {
    const payload = await response.json();
    if (!payload.success) throw new Error(payload.error?.message ?? "生成失败，请重试");
    return payload.data as T;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneData: T | null = null;

  const handleChunk = (chunk: string) => {
    const dataLine = chunk
      .split("\n")
      .find((line) => line.startsWith("data:"));
    if (!dataLine) return;

    const event = JSON.parse(dataLine.replace(/^data:\s*/, "")) as GenerationProgressEvent;
    onTrace?.(event);
    if (event.type === "progress") {
      onProgress({ message: event.message, progress: event.progress });
    } else if (event.type === "done") {
      onProgress({ message: event.message, progress: 100 });
      const payload = event.data as { success?: boolean; data?: T; error?: { message?: string } } | undefined;
      if (!payload?.success) throw new Error(payload?.error?.message ?? "生成失败，请重试");
      doneData = payload.data as T;
    } else if (event.type === "error") {
      throw new Error(event.message || "生成失败，请重试");
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) handleChunk(chunk);
  }

  const remaining = buffer.trim();
  if (remaining) handleChunk(remaining);

  if (!doneData) throw new Error("生成结果为空，请重试");
  return doneData;
}

function isManualStopError(error: unknown) {
  return error instanceof Error && error.message === "已手动停止生成";
}

async function reportGenerationDebugEvent(event: {
  hypothesisId: string;
  location: string;
  msg: string;
  data?: Record<string, unknown>;
  traceId?: string;
}) {
  try {
    await fetch("http://127.0.0.1:7777/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "generation-timeout",
        runId: "pre-fix",
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

export function CopilotWorkbench() {
  const { user, openAuth } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [resumeText, setResumeText] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [identity, setIdentity] = useState<UserIdentity>("career_changer");
  const [currentRole, setCurrentRole] = useState<CurrentRole>("other");
  const [roleSpecialty, setRoleSpecialty] = useState("");
  const [yearsOfExperience, setYearsOfExperience] = useState<number>(0);

  const [uploading, setUploading] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [, setAnalysisProgress] = useState<LiveProgressState>(null);
  const [, setRewriteProgress] = useState<LiveProgressState>(null);
  const [, setQuestionsProgress] = useState<LiveProgressState>(null);
  const [generationTraces, setGenerationTraces] = useState<GenerationTraceItem[]>([]);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [decisionReport, setDecisionReport] = useState<DecisionReport | null>(null);
  const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(null);
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestionItem[]>([]);
  const [interviewBatchIndex, setInterviewBatchIndex] = useState(0);
  const [answeringQuestionId, setAnsweringQuestionId] = useState<string | null>(null);
  const [regenerateConfirm, setRegenerateConfirm] = useState<RegenerateConfirmState>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const [pdfFileId, setPdfFileId] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [editableRewriteText, setEditableRewriteText] = useState("");
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"compare" | "edit">("compare");
  const [compareSectionIndex, setCompareSectionIndex] = useState(0);

  const [isPaid, setIsPaid] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallAction, setPaywallAction] = useState<"rewrite" | "questions" | "export" | null>(null);
  const generationControllers = useRef<Partial<Record<GenerationOperation, AbortController>>>({});
  const debugTraceCounterRef = useRef(0);

  const nextDebugTraceId = useCallback((prefix: string) => {
    debugTraceCounterRef.current += 1;
    return `${prefix}_${debugTraceCounterRef.current.toString(36)}`;
  }, []);

  const pushGenerationTrace = useCallback((
    operation: GenerationOperation,
    label: string,
    message: string,
    progress?: number,
    status: GenerationTraceItem["status"] = "running",
    artifact?: RewriteArtifact,
  ) => {
    setGenerationTraces((prev) => [
      {
        id: `${operation}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        operation,
        label,
        message,
        progress,
        status,
        timestamp: Date.now(),
        artifact,
      },
      ...prev,
    ].slice(0, 12));
  }, []);

  const createStreamTraceHandler = useCallback((operation: GenerationOperation, label: string) => {
    return (event: GenerationProgressEvent) => {
      if (event.type === "progress" || event.type === "done" || event.type === "error") {
        const artifact = isRewriteArtifact(event.data) ? event.data : undefined;
        pushGenerationTrace(
          operation,
          label,
          event.message || (event.type === "done" ? "生成完成" : "生成失败"),
          event.progress,
          event.type === "done" ? "done" : event.type === "error" ? "error" : "running",
          artifact,
        );
      }
    };
  }, [pushGenerationTrace]);

  const createGenerationSignal = useCallback((operation: GenerationOperation) => {
    generationControllers.current[operation]?.abort();
    const controller = new AbortController();
    generationControllers.current[operation] = controller;
    return controller.signal;
  }, []);

  const clearGenerationSignal = useCallback((operation: GenerationOperation, signal: AbortSignal) => {
    if (generationControllers.current[operation]?.signal === signal) {
      delete generationControllers.current[operation];
    }
  }, []);

  const stopGeneration = useCallback((operation: GenerationOperation) => {
    const controller = generationControllers.current[operation];
    if (!controller) return;
    controller.abort();
    delete generationControllers.current[operation];

    const labels: Record<GenerationOperation, string> = {
      upload: "PDF 解析",
      structure: "简历结构整理",
      analysis: "投递决策报告",
      rewrite: "岗位定制简历",
      questions: "面试预测题",
      export: "Word 导出",
    };

    if (operation === "upload") setUploading(false);
    if (operation === "structure") setPolishing(false);
    if (operation === "analysis") {
      setAnalyzing(false);
      setAnalysisProgress(null);
    }
    if (operation === "rewrite") {
      setRewriting(false);
      setRewriteProgress(null);
    }
    if (operation === "questions") {
      setGeneratingQuestions(false);
      setQuestionsProgress(null);
    }
    if (operation === "export") setExporting(false);

    pushGenerationTrace(operation, labels[operation], "已手动停止生成", undefined, "error");
    setError(null);
  }, [pushGenerationTrace]);

  const refreshPaidStatus = useCallback(async (sid: string | null) => {
    if (!sid) {
      setIsPaid(false);
      return;
    }
    const localPaid = readPaidSessions().has(sid);
    if (!user) {
      setIsPaid(localPaid);
      return;
    }

    try {
      const res = await fetch(`/api/v1/analysis-sessions/${sid}/access`, { cache: "no-store" });
      const payload = await res.json();
      if (res.ok && payload.success) {
        setIsPaid(Boolean(payload.data?.paid));
        return;
      }
    } catch {
      // ignore and fall back to local cache
    }

    setIsPaid(localPaid);
  }, [user]);

  function requirePaid(action: "rewrite" | "questions" | "export"): boolean {
    if (!user) {
      setPaywallAction(action);
      openAuth("register");
      return false;
    }
    if (isPaid) return true;
    setPaywallAction(action);
    setPaywallOpen(true);
    return false;
  }

  async function handlePaywallUnlock() {
    if (!sessionId) {
      throw new Error("请先生成决策报告");
    }
    if (!user) {
      throw new Error("请先登录后再支付");
    }

    const response = await fetch("/api/v1/payments/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productCode: FULL_REPORT_PRODUCT_CODE, sessionId }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error?.message ?? "支付失败，请稍后重试");
    }

    markSessionPaid(sessionId);
    setIsPaid(true);
    setPaywallOpen(false);
    const action = paywallAction;
    setPaywallAction(null);
    setTimeout(() => {
      if (action === "rewrite") handleRewrite();
      else if (action === "questions") handleGenerateQuestions();
      else if (action === "export") handleExportDocx();
    }, 100);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshPaidStatus(sessionId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshPaidStatus, sessionId]);

  const UPLOAD_STAGES = [
    { label: "读取文件...", duration: 1000 },
    { label: "解析 PDF 结构...", duration: 3000 },
    { label: "提取文本内容...", duration: 4000 },
    { label: "OCR 识别中...", duration: 6000 },
  ];
  const EXPORT_STAGES = [
    { label: "整理简历结构...", duration: 1500 },
    { label: "生成 Word 排版...", duration: 2500 },
    { label: "准备下载文件...", duration: 1500 },
  ];

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const signal = createGenerationSignal("upload");
    setUploading(true);
    setError(null);
    pushGenerationTrace("upload", "PDF 解析", "正在上传并解析 PDF", 5, "running");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/v1/uploads/resume-pdf", { method: "POST", body: formData, signal });
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const responseText = (await res.text()).trim();
        throw new Error(
          responseText.includes("Server")
            ? "PDF 上传暂时失败，请改用粘贴简历内容，或上传可复制文本的 PDF。"
            : responseText || "PDF 上传暂时失败，请稍后重试。"
        );
      }

      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error?.message ?? "PDF 解析失败");
      const data = payload.data as UploadResumePdfResponse;
      setResumeText(data.extractedText);
      setUploadInfo(`${data.fileName} · ${data.pageCount} 页 · ${data.extractionMethod === "ocr" ? "OCR" : "文本"}`);
      if (data.savedFileId) setPdfFileId(data.savedFileId);
      pushGenerationTrace("upload", "PDF 解析", "PDF 解析完成", 100, "done");
    } catch (err) {
      if (!signal.aborted && !isManualStopError(err)) {
        pushGenerationTrace("upload", "PDF 解析", err instanceof Error ? err.message : "上传失败", undefined, "error");
        setError(err instanceof Error ? err.message : "上传失败");
      }
    } finally {
      clearGenerationSignal("upload", signal);
      setUploading(false);
    }
  }

  async function handlePolish() {
    if (!resumeText.trim()) return;
    const signal = createGenerationSignal("structure");
    setPolishing(true);
    setError(null);
    pushGenerationTrace("structure", "简历结构整理", "正在用质量模型识别模块、标题和经历层级", 10, "running");
    try {
      const res = await fetchWithTimeout("/api/v1/resume-polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText }),
        signal,
      }, 120000);
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error?.message ?? "结构整理失败，请重试");
      }
      const data = payload.data as PolishResumeTextResponse;
      setResumeText(data.polishedText);
      pushGenerationTrace("structure", "简历结构整理", "AI 结构整理已完成：已规范模块标题和项目符号", 100, "done");
    } catch (err) {
      if (!signal.aborted && !isManualStopError(err)) {
        pushGenerationTrace("structure", "简历结构整理", err instanceof Error ? err.message : "结构整理失败", undefined, "error");
        setError(err instanceof Error ? err.message : "结构整理失败，请重试");
      }
    } finally {
      clearGenerationSignal("structure", signal);
      setPolishing(false);
    }
  }

  async function handleAnalyze() {
    if (!resumeText.trim() || !jobDescriptionText.trim()) return;
    const signal = createGenerationSignal("analysis");
    setAnalyzing(true);
    setAnalysisProgress({ message: "正在创建分析会话", progress: 1 });
    pushGenerationTrace("analysis", "投递决策报告", "正在创建分析会话", 1, "running");
    setError(null);
    try {
      setRewriteResult(null);
      setEditableRewriteText("");
      setCompareSectionIndex(0);
      setInterviewQuestions([]);
      setInterviewBatchIndex(0);
      setAnsweringQuestionId(null);
      const userProfile: UserProfile = { identity, currentRole, roleSpecialty: roleSpecialty || undefined, yearsOfExperience: yearsOfExperience || undefined };
      const createRes = await fetchWithTimeout("/api/v1/analysis-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobDescriptionText, jobTitle: jobTitle || undefined, targetCompany: targetCompany || undefined, userProfile, resumeFileUrl: pdfFileId || undefined }),
        signal,
      }, 70000);
      const createPayload = await createRes.json();
      if (!createRes.ok || !createPayload.success) throw new Error(createPayload.error?.message ?? "创建分析失败");

      const sid = createPayload.data.sessionId;
      setSessionId(sid);
      rememberLocalSession(sid);
      await refreshPaidStatus(sid);

      setAnalysisProgress({ message: "正在生成投递决策报告", progress: 8 });
      pushGenerationTrace("analysis", "投递决策报告", "会话已创建，正在启动报告生成", 8, "running");
      setCurrentStep(3);
      const reportRes = await fetchWithTimeout(`/api/v1/analysis-sessions/${sid}/decision-report`, {
        headers: { Accept: "text/event-stream" },
        signal,
      }, 600000);
      if (!reportRes.ok) {
        const errText = await reportRes.text();
        let msg = "决策报告生成失败";
        try { const j = JSON.parse(errText); msg = j.error?.message || msg; } catch {}
        throw new Error(msg);
      }
      const reportPayload = await readGenerationEventStream<DecisionReport>(
        reportRes,
        setAnalysisProgress,
        createStreamTraceHandler("analysis", "投递决策报告"),
      );
      setDecisionReport(reportPayload);
      setCurrentStep(3);
    } catch (err) {
      if (!signal.aborted && !isManualStopError(err)) {
        pushGenerationTrace("analysis", "投递决策报告", err instanceof Error ? err.message : "分析失败", undefined, "error");
        setError(err instanceof Error ? err.message : "分析失败");
      }
    } finally {
      clearGenerationSignal("analysis", signal);
      setAnalyzing(false);
      window.setTimeout(() => setAnalysisProgress(null), 900);
    }
  }

  async function handleRewrite() {
    if (!sessionId) return;
    const signal = createGenerationSignal("rewrite");
    setRewriting(true);
    setRewriteProgress({ message: "正在准备岗位定制简历生成任务", progress: 1 });
    pushGenerationTrace("rewrite", "岗位定制简历", "正在准备岗位定制简历生成任务", 1, "running");
    setError(null);
    const traceId = nextDebugTraceId("rewrite");
    try {
      // #region debug-point D:rewrite-click
      void reportGenerationDebugEvent({
        hypothesisId: "D",
        location: "components/copilot/copilot-workbench.tsx:handleRewrite:start",
        msg: "[DEBUG] rewrite requested",
        data: { sessionId, resumeChars: resumeText.length, jdChars: jobDescriptionText.length },
        traceId,
      });
      // #endregion
      const res = await fetchWithTimeout(`/api/v1/analysis-sessions/${sessionId}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ rewriteMode: "aggressive_fact_bound" }),
        signal,
      }, 900000);
      if (!res.ok) {
        const errText = await res.text();
        let msg = "简历改写失败";
        try { const j = JSON.parse(errText); msg = j.error?.message || msg; } catch {}
        throw new Error(msg);
      }
      const rewriteData = await readGenerationEventStream<RewriteResult>(
        res,
        setRewriteProgress,
        createStreamTraceHandler("rewrite", "岗位定制简历"),
      );
        if (!hasMeaningfulRewrite(rewriteData, resumeText)) {
          throw new Error("本次没有生成有效改写内容，请重试");
        }
        // #region debug-point D:rewrite-success
        void reportGenerationDebugEvent({
          hypothesisId: "D",
          location: "components/copilot/copilot-workbench.tsx:handleRewrite:success",
          msg: "[DEBUG] rewrite response accepted",
          data: {
            sessionId,
            sections: rewriteData.sections.length,
            textChars: rewriteData.fullRewrittenText.length,
            factGuardStatus: rewriteData.factGuard.status,
          },
          traceId,
        });
        // #endregion
        setRewriteResult(rewriteData);
        setEditableRewriteText(formatRewriteResultForEditor(rewriteData));
        setCompareSectionIndex(0);
        setViewMode("compare");
        setInterviewQuestions([]);
        setInterviewBatchIndex(0);
      setCurrentStep(4);
    } catch (err) {
      // #region debug-point D:rewrite-error
      void reportGenerationDebugEvent({
        hypothesisId: "D",
        location: "components/copilot/copilot-workbench.tsx:handleRewrite:error",
        msg: "[DEBUG] rewrite request failed on client",
        data: { sessionId, errorMessage: err instanceof Error ? err.message : String(err) },
        traceId,
      });
      // #endregion
      if (!signal.aborted && !isManualStopError(err)) {
        pushGenerationTrace("rewrite", "岗位定制简历", err instanceof Error ? err.message : "简历改写失败，请重试", undefined, "error");
        setError(err instanceof Error ? err.message : "简历改写失败，请重试");
      }
    } finally {
      clearGenerationSignal("rewrite", signal);
      setRewriting(false);
      window.setTimeout(() => setRewriteProgress(null), 900);
    }
  }

  async function handleGenerateQuestions(batchIndexOverride?: number) {
    if (!sessionId) return;
    const batchPlan = getInterviewBatchPlan(identity);
    const batchIndex = typeof batchIndexOverride === "number" ? batchIndexOverride : interviewBatchIndex;
    if (batchIndex >= batchPlan.length) return;
    const batch = batchPlan[batchIndex];
    const isFirstBatch = batchIndex === 0;
    const append = !isFirstBatch;
    const signal = createGenerationSignal("questions");
    setGeneratingQuestions(true);
    setQuestionsProgress({ message: `正在生成第 ${batchIndex + 1}/${batchPlan.length} 批：${batch.label}`, progress: 1 });
    pushGenerationTrace("questions", "面试预测题", `正在生成第 ${batchIndex + 1}/${batchPlan.length} 批：${batch.label}`, 1, "running");
    setError(null);
    const traceId = `${nextDebugTraceId("questions")}_b${batchIndex}`;
    try {
      // #region debug-point D:questions-click
      void reportGenerationDebugEvent({
        hypothesisId: "D",
        location: "components/copilot/copilot-workbench.tsx:handleGenerateQuestions:start",
        msg: "[DEBUG] interview questions requested",
        data: { sessionId, batchIndex, categories: batch.categories, count: batch.count, append },
        traceId,
      });
      // #endregion
      const res = await fetchWithTimeout(`/api/v1/analysis-sessions/${sessionId}/interview-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ questionCount: batch.count, includeCategories: batch.categories, append }),
        signal,
      }, 360000);
      if (!res.ok) {
        const errText = await res.text();
        let msg = "面试题生成失败";
        try { const j = JSON.parse(errText); msg = j.error?.message || msg; } catch {}
        throw new Error(msg);
      }
      const questionsPayload = await readGenerationEventStream<{ sessionId: string; questions: InterviewQuestionItem[] }>(
        res,
        setQuestionsProgress,
        createStreamTraceHandler("questions", "面试预测题"),
      );
      const newQuestions = questionsPayload.questions;
      if (newQuestions?.length) {
        // #region debug-point D:questions-success
        void reportGenerationDebugEvent({
          hypothesisId: "D",
          location: "components/copilot/copilot-workbench.tsx:handleGenerateQuestions:success",
          msg: "[DEBUG] interview questions response accepted",
          data: { sessionId, batchIndex, questionCount: newQuestions.length },
          traceId,
        });
        // #endregion
        setInterviewQuestions((prev) => (append ? [...prev, ...newQuestions] : newQuestions));
        setInterviewBatchIndex(batchIndex + 1);
      } else {
        throw new Error("本批没有生成有效面试题，请重试");
      }
      setCurrentStep(4);
    } catch (err) {
      // #region debug-point D:questions-error
      void reportGenerationDebugEvent({
        hypothesisId: "D",
        location: "components/copilot/copilot-workbench.tsx:handleGenerateQuestions:error",
        msg: "[DEBUG] interview questions request failed on client",
        data: { sessionId, batchIndex, errorMessage: err instanceof Error ? err.message : String(err) },
        traceId,
      });
      // #endregion
      if (!signal.aborted && !isManualStopError(err)) {
        pushGenerationTrace("questions", "面试预测题", err instanceof Error ? err.message : "面试题生成失败，请重试", undefined, "error");
        setError(err instanceof Error ? err.message : "面试题生成失败，请重试");
      }
    } finally {
      clearGenerationSignal("questions", signal);
      setGeneratingQuestions(false);
      window.setTimeout(() => setQuestionsProgress(null), 900);
    }
  }

  function handleResetInterviewQuestions() {
    setInterviewQuestions([]);
    setInterviewBatchIndex(0);
  }

  function openRegenerateConfirm(action: "analysis" | "rewrite" | "question-detail", questionId?: string) {
    if (action === "analysis") {
      setRegenerateConfirm({
        action,
        title: "重新生成投递判断？",
        description: "会覆盖当前判断结果，并清空已生成的简历和面试题。",
        confirmLabel: "继续重新生成",
      });
      return;
    }

    if (action === "rewrite") {
      setRegenerateConfirm({
        action,
        title: "重新生成岗位定制简历？",
        description: "会覆盖当前简历内容，并清空已生成的面试题。",
        confirmLabel: "继续重新生成",
      });
      return;
    }

    setRegenerateConfirm({
      action,
      questionId,
      title: "重新生成这题回答包？",
      description: "会覆盖当前题目的可复述话术、复述要点和追问风险。",
      confirmLabel: "继续重新生成",
    });
  }

  function handleConfirmRegenerate() {
    const action = regenerateConfirm;
    if (!action) return;

    setRegenerateConfirm(null);

    if (action.action === "analysis") {
      void handleAnalyze();
      return;
    }

    if (action.action === "rewrite") {
      void handleRewrite();
      return;
    }

    if (action.questionId) {
      void handleGenerateQuestionDetail(action.questionId);
    }
  }

  async function handleGenerateQuestionDetail(questionId: string) {
    if (!sessionId || answeringQuestionId) return;
    const signal = createGenerationSignal("questions");
    setAnsweringQuestionId(questionId);
    setQuestionsProgress({ message: "正在生成本题回答包", progress: 15 });
    pushGenerationTrace("questions", "面试预测题", "正在生成本题回答框架和参考话术", 15, "running");
    setError(null);
    try {
      const res = await fetchWithTimeout(`/api/v1/analysis-sessions/${sessionId}/interview-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ detailQuestionId: questionId }),
        signal,
      }, 180000);
      if (!res.ok) {
        const errText = await res.text();
        let msg = "本题回答包生成失败";
        try { const j = JSON.parse(errText); msg = j.error?.message || msg; } catch {}
        throw new Error(msg);
      }
      const payload = await readGenerationEventStream<{ sessionId: string; question: InterviewQuestionItem }>(
        res,
        setQuestionsProgress,
        createStreamTraceHandler("questions", "面试预测题"),
      );
      if (!payload.question) throw new Error("本题回答包为空，请重试");
      setInterviewQuestions((prev) => prev.map((item) => item.id === payload.question.id ? payload.question : item));
      pushGenerationTrace("questions", "面试预测题", "本题回答包已生成", 100, "done");
    } catch (err) {
      if (!signal.aborted && !isManualStopError(err)) {
        pushGenerationTrace("questions", "面试预测题", err instanceof Error ? err.message : "本题回答包生成失败", undefined, "error");
        setError(err instanceof Error ? err.message : "本题回答包生成失败，请重试");
      }
    } finally {
      clearGenerationSignal("questions", signal);
      setAnsweringQuestionId(null);
      window.setTimeout(() => setQuestionsProgress(null), 900);
    }
  }

  async function handleExportDocx() {
    if (!sessionId) return;
    const signal = createGenerationSignal("export");
    setExporting(true);
    pushGenerationTrace("export", "Word 导出", "正在生成 Word 文档", 20, "running");
    try {
      const res = await fetch(`/api/v1/analysis-sessions/${sessionId}/export-resume-docx`, { signal });
      if (!res.ok) throw new Error("Word 生成失败");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `简历-AIPM改写版.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      pushGenerationTrace("export", "Word 导出", "Word 文档已生成", 100, "done");
    } catch (err) {
      if (!signal.aborted && !isManualStopError(err)) {
        pushGenerationTrace("export", "Word 导出", err instanceof Error ? err.message : "Word 生成失败", undefined, "error");
        setError(err instanceof Error ? err.message : "Word 生成失败");
      }
    } finally {
      clearGenerationSignal("export", signal);
      setExporting(false);
    }
  }

  const canProceedToStep2 = resumeText.trim().length > 20;
  const canAnalyze = canProceedToStep2 && jobDescriptionText.trim().length > 20;
  const dimensionSortMode: DimensionSortMode = "gap";
  const reportDimensions = useMemo(
    () => normalizeReportDimensions(decisionReport?.dimensions),
    [decisionReport],
  );
  const sortedDimensions = useMemo(
    () => sortDimensions(reportDimensions, dimensionSortMode),
    [reportDimensions, dimensionSortMode],
  );
  const priorityDimensions = useMemo(
    () => sortedDimensions.filter((dimension) => dimension.gap !== "met").slice(0, 3),
    [sortedDimensions],
  );
  const metDimensions = useMemo(
    () => sortedDimensions.filter((dimension) => dimension.gap === "met"),
    [sortedDimensions],
  );
  const gapDimensions = useMemo(
    () => sortedDimensions.filter((dimension) => dimension.gap !== "met"),
    [sortedDimensions],
  );
  const resumeCharCount = resumeText.trim().length;
  const jdCharCount = jobDescriptionText.trim().length;
  const compareSection = rewriteResult?.sections[compareSectionIndex] ?? rewriteResult?.sections[0] ?? null;

  return (
    <div className="aipm-page grid min-h-[calc(100vh-96px)] max-w-[1200px] grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* 左栏：步骤导航 */}
      <aside className="hidden w-[230px] shrink-0 lg:block">
        <nav className="sticky top-[118px] h-[360px] w-[230px] rounded-[24px] border border-[#e2e8f0] bg-white p-0 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <div className="px-5 pt-5 text-[16px] font-semibold leading-[22px] text-[#0f172a]">4 步完成求职包</div>
          {STEPS.map((step) => (
            <button
              key={step.id}
              onClick={() => step.id <= currentStep && setCurrentStep(step.id as Step)}
              className={`ml-4 mt-[18px] flex h-12 w-[198px] items-center rounded-[15px] px-3 text-left text-[13px] font-semibold leading-[18px] transition ${
                step.id === currentStep
                  ? "border border-[#eef2ff] bg-[#eef2ff] text-[#4f46e5]"
                  : step.id < currentStep
                    ? "border border-transparent bg-white text-[#64748b] hover:bg-[#f8fafc]"
                    : "cursor-not-allowed text-[#94a3b8]"
              }`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold leading-[14px] ${
                step.id === currentStep ? "bg-[#4f46e5] text-white" : step.id < currentStep ? "bg-[#0f766e] text-white" : "bg-[#f1f5f9] text-white"
              }`}>
                {step.id < currentStep ? "✓" : step.id}
              </span>
              <span className={`ml-3 ${step.id === currentStep ? "text-[#4f46e5]" : step.id < currentStep ? "text-[#64748b]" : "text-[#64748b]"}`}>
                {step.label}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      {/* 中栏：主内容 */}
      <main className="min-w-0 w-full">
        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm">{error}</div>
        )}

        <nav className="mb-4 flex gap-2 overflow-x-auto rounded-[18px] border border-[#e2e8f0] bg-white p-2 shadow-[0_10px_24px_rgba(15,23,42,0.06)] lg:hidden" aria-label="流程步骤">
          {STEPS.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => step.id <= currentStep && setCurrentStep(step.id as Step)}
              disabled={step.id > currentStep}
              className={`flex min-w-[108px] items-center justify-center rounded-[14px] px-3 py-2 text-[12px] font-semibold leading-4 ${
                step.id === currentStep
                  ? "bg-[#eef2ff] text-[#4f46e5]"
                  : step.id < currentStep
                    ? "bg-[#ecfdf5] text-[#0f766e]"
                    : "bg-[#f8fafc] text-[#94a3b8]"
              }`}
            >
              {step.id < currentStep ? "✓" : step.id}. {step.label}
            </button>
          ))}
        </nav>

        {/* Step 1: 简历预处理 */}
        {currentStep === 1 && (
          <section className="aipm-card w-full rounded-[24px] p-5 sm:rounded-[30px] sm:p-8">
            <div className="text-[14px] font-semibold leading-5 text-[#4f46e5]">Step 1 / 简历预处理</div>
            <h1 className="mt-2 text-[26px] font-semibold leading-9 tracking-[-0.03em] text-[#0f172a] sm:text-[30px] sm:leading-10">把原始简历整理成可分析输入</h1>
            <p className="mt-3 max-w-[590px] text-[16px] leading-[26px] text-[#64748b]">
              真实功能：身份选择、当前岗位、细分方向、年限、PDF 上传、文本粘贴、AI 结构整理。
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-[13px] font-medium leading-[18px] text-[#64748b]">我的身份</label>
                <select value={identity} onChange={(e) => setIdentity(e.target.value as UserIdentity)} className="aipm-input text-[14px]">
                  {IDENTITY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              {identity === "career_changer" ? (
                <div>
                  <label className="mb-2 block text-[13px] font-medium leading-[18px] text-[#64748b]">当前岗位</label>
                  <select value={currentRole} onChange={(e) => { setCurrentRole(e.target.value as CurrentRole); setRoleSpecialty(""); }} className="aipm-input text-[14px]">
                    {ROLE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              ) : (
                <div className="rounded-[14px] border border-dashed border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-[14px] leading-[22px] text-[#94a3b8]">
                  应届生 / 实习生无需填写当前岗位，可直接上传或粘贴简历文本。
                </div>
              )}

              {identity === "career_changer" && ROLE_SPECIALTY_MAP[currentRole] && (
                <div>
                  <label className="mb-2 block text-[13px] font-medium leading-[18px] text-[#64748b]">细分方向</label>
                  <select value={roleSpecialty} onChange={(e) => setRoleSpecialty(e.target.value)} className="aipm-input text-[14px]">
                    <option value="">请选择</option>
                    {ROLE_SPECIALTY_MAP[currentRole].map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              )}
              {identity === "career_changer" && (
                <div>
                  <label className="mb-2 block text-[13px] font-medium leading-[18px] text-[#64748b]">工作年限</label>
                  <input type="number" min={0} max={30} value={yearsOfExperience} onChange={(e) => setYearsOfExperience(Number(e.target.value))} className="aipm-input text-[14px]" />
                </div>
              )}
            </div>

            <div className="mt-5">
              <label className="relative block cursor-pointer rounded-[18px] border border-[#4f46e5] bg-[#eef2ff] p-5 transition hover:bg-[#e8edff] sm:p-6">
                <div className="text-[18px] font-semibold leading-6 text-[#4f46e5]">{uploading ? "上传 PDF 解析中..." : "上传 PDF 解析"}</div>
                <div className="mt-2 text-[14px] leading-[22px] text-[#64748b]">支持 .pdf，解析后自动填充简历文本；也可以直接粘贴。</div>
                <input type="file" accept=".pdf" onChange={handlePdfUpload} className="sr-only" disabled={uploading} />
              </label>
              {uploadInfo ? <div className="mt-3 text-sm text-[#64748b]">{uploadInfo}</div> : null}
              <div className="mt-4">
                <ProgressBar active={uploading} stages={UPLOAD_STAGES} completedMessage="PDF 解析完成" />
              </div>
            </div>

            <div className="mt-8">
              <label className="mb-2 block text-[13px] font-medium leading-[18px] text-[#64748b]">简历内容</label>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="粘贴简历内容，或等待 PDF 解析结果回填……"
                rows={12}
                className="aipm-textarea min-h-[190px] text-[14px]"
              />
            </div>

            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button onClick={handlePolish} disabled={polishing || !resumeText.trim()} className="aipm-btn-secondary min-h-[46px] w-full sm:w-[150px]">
                  {polishing ? "整理中..." : "AI 结构整理"}
                </button>
                <span className="text-sm text-[#94a3b8]">{resumeCharCount} 字</span>
              </div>
              <button
                onClick={() => setCurrentStep(2)}
                disabled={!canProceedToStep2}
                className="aipm-btn-primary w-full disabled:opacity-40 sm:w-[160px]"
              >
                下一步：目标岗位
              </button>
            </div>

            {uploading ? (
              <GenerationTracePanel traces={generationTraces} activeOperation="upload" className="mt-4" onStop={() => stopGeneration("upload")} />
            ) : (
              <GenerationTracePanel traces={generationTraces} activeOperation="structure" className="mt-4" onStop={polishing ? () => stopGeneration("structure") : undefined} />
            )}

            <div className="mt-8 rounded-[18px] border border-[#e2e8f0] bg-[#f8fafc] p-5 sm:mt-10 sm:p-6">
              <div className="text-[18px] font-semibold leading-6 text-[#0f172a]">Step 2 目标岗位输入</div>
              <div className="mt-2 text-[14px] leading-[22px] text-[#64748b]">岗位名称、目标公司、JD 全文；满足简历和 JD 均 &gt;20 字后生成报告。</div>
            </div>
          </section>
        )}

        {/* Step 2: 目标岗位 */}
        {currentStep === 2 && (
          <section className="aipm-card w-full rounded-[24px] p-5 sm:rounded-[30px] sm:p-8 lg:min-h-[1230px]">
            <div className="text-[14px] font-semibold leading-5 text-[#4f46e5]">Step 2 / 目标岗位输入</div>
            <h1 className="mt-2 text-[26px] font-semibold leading-9 tracking-[-0.03em] text-[#0f172a] sm:text-[30px] sm:leading-10">补充岗位与 JD，准备生成投递决策报告</h1>
            <p className="mt-3 max-w-[590px] text-[16px] leading-[26px] text-[#64748b]">
              真实功能：岗位名称、目标公司、JD 全文；满足简历和 JD 均 &gt;20 字后生成报告。
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-[13px] font-medium leading-[18px] text-[#64748b]">岗位名称</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="如：AI 产品经理、大模型产品经理"
                  className="aipm-input text-[14px]"
                />
              </div>
              <div>
                <label className="mb-2 block text-[13px] font-medium leading-[18px] text-[#64748b]">目标公司</label>
                <input
                  type="text"
                  value={targetCompany}
                  onChange={(e) => setTargetCompany(e.target.value)}
                  placeholder="如：字节跳动、阿里巴巴、百度"
                  className="aipm-input text-[14px]"
                />
              </div>
            </div>

            <div className="mt-8">
              <label className="mb-2 block text-[13px] font-medium leading-[18px] text-[#64748b]">JD 全文</label>
              <textarea
                value={jobDescriptionText}
                onChange={(e) => setJobDescriptionText(e.target.value)}
                placeholder="粘贴完整的岗位描述……"
                rows={12}
                className="aipm-textarea min-h-[190px] text-[14px]"
              />
              <div className="mt-3 text-sm text-[#94a3b8]">{jdCharCount} 字</div>
            </div>

            <div className="mt-8 rounded-[18px] border border-[#e2e8f0] bg-[#f8fafc] p-5 sm:p-6">
              <div className="text-[18px] font-semibold leading-6 text-[#0f172a]">生成条件</div>
              <div className="mt-2 text-[14px] leading-[22px] text-[#64748b]">
                当前需要同时满足：简历内容 &gt;20 字，JD 内容 &gt;20 字。系统会基于这两份真实输入生成投递决策报告。
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => setCurrentStep(1)} className="aipm-btn-secondary w-full sm:w-[130px]">
                返回上一步
              </button>
              <button
                onClick={handleAnalyze}
                disabled={!canAnalyze || analyzing}
                className="aipm-btn-primary w-full disabled:opacity-40 sm:w-[190px]"
              >
                {analyzing ? "AI 分析中..." : "生成投递决策报告"}
              </button>
            </div>
            <GenerationTracePanel traces={generationTraces} activeOperation="analysis" className="mt-4" onStop={analyzing ? () => stopGeneration("analysis") : undefined} />
          </section>
        )}

        {/* Step 3: 投递决策报告 */}
        {currentStep === 3 && !decisionReport && analyzing && (
          <section className="aipm-card w-full rounded-[24px] p-5 sm:rounded-[30px] sm:p-8 lg:min-h-[760px]">
            <div className="text-[14px] font-semibold leading-5 text-[#4f46e5]">Step 3 / 投递决策报告</div>
            <h1 className="mt-2 max-w-[640px] text-[26px] font-semibold leading-9 tracking-[-0.03em] text-[#0f172a] sm:text-[30px] sm:leading-10">正在生成投递决策报告</h1>
            <p className="mt-3 max-w-[620px] text-[15px] leading-6 text-[#64748b]">
              已进入报告页，系统会快速完成投递判断、匹配分和优先补齐项整理。生成完成后内容会自动替换这里。
            </p>
            <GenerationTracePanel traces={generationTraces} activeOperation="analysis" className="mt-5" onStop={() => stopGeneration("analysis")} />
            <div className="mt-8 space-y-5" aria-hidden="true">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="relative h-24 overflow-hidden rounded-[20px] border border-[#e2e8f0] bg-[#f8fafc]">
                    <div className="aipm-activity-scan h-full" />
                  </div>
                ))}
              </div>
              <div className="relative h-56 overflow-hidden rounded-[24px] border border-[#e2e8f0] bg-white">
                <div className="aipm-activity-scan h-full" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="relative h-16 overflow-hidden rounded-[18px] border border-[#e2e8f0] bg-[#f8fafc]">
                    <div className="aipm-activity-scan h-full" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {currentStep === 3 && decisionReport && (
          <section className="aipm-card w-full rounded-[24px] p-5 sm:rounded-[30px] sm:p-8">
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${getRecommendationTone(decisionReport.recommendation).badge}`}>
              <StatusGlyph recommendation={decisionReport.recommendation} className="h-4 w-4" />
              {decisionReport.recommendationLabel}
            </div>
            <h1 className="mt-5 max-w-[600px] text-[28px] font-semibold leading-9 tracking-[-0.03em] text-[#0f172a] sm:text-[34px] sm:leading-[44px]">
              {decisionReport.overallMatchScore >= 70 ? "这份岗位可以优先准备投递" : decisionReport.overallMatchScore >= 50 ? "这份岗位可以冲，但要先补齐关键能力" : "先别急着投，补齐短板后胜率更高"}
            </h1>
            <p className="mt-4 max-w-[620px] text-[16px] leading-8 text-[#475569] sm:text-[18px]">{decisionReport.oneLiner}</p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-[18px]">
              <button
                onClick={() => openRegenerateConfirm("analysis")}
                disabled={analyzing}
                className="inline-flex h-[46px] w-full items-center justify-center rounded-[16px] border border-[#e2e8f0] bg-white text-[13px] font-semibold leading-[17px] tracking-[0] text-[#0f172a] disabled:opacity-40 sm:w-[150px]"
              >
                {analyzing ? "重新生成中..." : "重新生成判断"}
              </button>
              <button
                onClick={() => { if (requirePaid("rewrite")) handleRewrite(); }}
                disabled={rewriting || analyzing}
                className="inline-flex h-[46px] w-full items-center justify-center rounded-[16px] bg-[#0f172a] text-[13px] font-semibold leading-[17px] tracking-[0] text-white shadow-[0_14px_34px_rgba(15,23,42,0.08)] disabled:opacity-40 sm:w-[160px]"
              >
                {rewriting ? "改写中..." : isPaid ? "生成岗位定制简历" : "解锁产物包生成简历"}
              </button>
              <button
                onClick={() => { if (requirePaid("questions")) handleGenerateQuestions(); }}
                disabled={generatingQuestions || analyzing}
                className="inline-flex h-[46px] w-full items-center justify-center rounded-[16px] border border-[#e2e8f0] bg-white text-[13px] font-semibold leading-[17px] tracking-[0] text-[#0f172a] disabled:opacity-40 sm:w-[160px]"
              >
                {generatingQuestions ? "生成中..." : isPaid ? "生成面试预测题" : "解锁面试预测题"}
              </button>
              <button
                onClick={() => { setCurrentStep(2); setDecisionReport(null); setSessionId(null); refreshPaidStatus(null); }}
                className="inline-flex h-[46px] w-full items-center justify-center rounded-[16px] border border-[#e2e8f0] bg-white text-[13px] font-semibold leading-[17px] tracking-[0] text-[#0f172a] sm:w-[130px]"
              >
                换一个岗位
              </button>
            </div>
            {(rewriting || generatingQuestions) ? (
              <GenerationTracePanel
                traces={generationTraces}
                activeOperation={rewriting ? "rewrite" : "questions"}
                className="mt-4"
                onStop={() => stopGeneration(rewriting ? "rewrite" : "questions")}
              />
            ) : null}

            <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <DecisionStatCard label="匹配分" value={String(decisionReport.overallMatchScore)} note="/100" />
              <DecisionStatCard label="已达标" value={String(metDimensions.length)} note="能力项" />
              <DecisionStatCard label="需补齐" value={String(reportDimensions.filter((dim) => dim.gap === "insufficient").length)} note="能力项" />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div className="rounded-[22px] border border-[#dcfce7] bg-[#f0fdf4] p-5">
                <div className="text-[16px] font-semibold leading-6 text-[#166534]">已达标能力</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {metDimensions.length > 0 ? metDimensions.map((dimension) => (
                    <span key={dimension.dimensionId} className="inline-flex rounded-full border border-[#bbf7d0] bg-white px-3 py-1.5 text-[13px] font-semibold leading-5 text-[#166534]">
                      {dimension.dimensionLabel}
                    </span>
                  )) : (
                    <span className="text-[14px] leading-6 text-[#166534]">当前还没有明确达标项，先补关键证据再重新判断。</span>
                  )}
                </div>
              </div>

              <div className="rounded-[22px] border border-[#e2e8f0] bg-white p-5">
                <div className="text-[16px] font-semibold leading-6 text-[#0f172a]">还需补齐</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {gapDimensions.length > 0 ? gapDimensions.map((dimension) => (
                    <span key={dimension.dimensionId} className="inline-flex rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1.5 text-[13px] font-semibold leading-5 text-[#475569]">
                      {dimension.dimensionLabel}
                    </span>
                  )) : (
                    <span className="text-[14px] leading-6 text-[#64748b]">当前核心能力已基本达标，可以直接进入简历和面试准备。</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-[26px] border border-[#c7d2fe] bg-[#eef2ff] p-5 sm:p-6">
              <div className="text-[20px] font-semibold leading-7 text-[#0f172a]">投递前先处理这 3 件事</div>
              <div className="mt-2 text-[16px] leading-8 text-[#475569]">先按优先级补证据，再决定是否投递；不要把时间浪费在泛泛优化上。</div>
              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {(priorityDimensions.length ? priorityDimensions : sortedDimensions.slice(0, 3)).map((dimension, index) => (
                  <div key={dimension.dimensionId} className="rounded-[18px] border border-white/80 bg-white px-4 py-4 shadow-[0_8px_20px_rgba(79,70,229,0.08)]">
                    <div className="text-[12px] font-semibold leading-4 text-[#4f46e5]">优先级 {index + 1}</div>
                    <div className="mt-2 text-[18px] font-semibold leading-7 text-[#0f172a]">{dimension.dimensionLabel}</div>
                    <div className="mt-2 text-[16px] leading-7 text-[#475569]">
                      {dimension.gap === "met" ? "作为优势前置到简历核心经历里。" : "先补一条可验证证据，再改写进简历或面试素材。"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 rounded-[22px] border border-[#e2e8f0] bg-white px-5 py-4 sm:px-6">
              <div className="text-[18px] font-semibold leading-7 text-[#0f172a]">下一步建议</div>
              <div className="mt-2 text-[16px] leading-8 text-[#475569]">
                如果认可这份岗位判断，下一步直接生成岗位定制简历或面试预测题；如果判断还不够准，先返回补充简历或 JD，再重新生成一次。
              </div>
            </div>
          </section>
        )}

        {/* Step 4: 结果产出 */}
        {currentStep === 4 && (
          <section className="aipm-card w-full rounded-[24px] p-5 sm:rounded-[30px] sm:p-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold leading-5 text-[#4f46e5]">Step 4 / 求职材料交付台</div>
                <h1 className="mt-2 max-w-[680px] text-[26px] font-semibold leading-9 tracking-[-0.03em] text-[#0f172a] sm:text-[30px] sm:leading-10">
                  生成、检查并导出你的投递材料
                </h1>
                <p className="mt-3 max-w-[680px] text-[17px] leading-8 text-[#475569]">
                  按 01 简历 → 02 面试题 → 03 导出 的顺序完成；前一步未完成时，后面的卡片会保持折叠。
                </p>
              </div>
              <button onClick={() => setCurrentStep(3)} className="aipm-btn-secondary w-full shrink-0 sm:w-[140px]">
                返回报告
              </button>
            </div>

            {/* 顶部 stepper：紧凑、单行，只承担"现在到哪一步"导航 */}
            <ol className="mt-6 flex flex-col gap-2 rounded-[18px] border border-[#e2e8f0] bg-[#f8fafc] p-2 sm:flex-row sm:items-stretch sm:gap-0 sm:p-3">
              {[
                { id: "01", label: "岗位定制简历", done: Boolean(rewriteResult), running: rewriting, hint: rewriteResult ? `${rewriteResult.sections.length} 个模块已生成` : rewriting ? "改写中" : "可选生成" },
                { id: "02", label: "面试预测题", done: interviewQuestions.length > 0, running: generatingQuestions, hint: interviewQuestions.length ? `${interviewQuestions.length} 道题` : generatingQuestions ? "生成中" : rewriteResult ? "基于投递版" : "基于原始简历" },
                { id: "03", label: "导出交付", done: false, running: exporting, hint: exporting ? "导出中" : rewriteResult ? "可复制 / 下载" : "等待简历完成" },
              ].map((item, idx, arr) => {
                const status = item.running ? "running" : item.done ? "done" : "pending";
                const tone = status === "done" ? "bg-[#10b981] text-white" : status === "running" ? "bg-[#4f46e5] text-white" : "bg-white text-[#94a3b8] border border-[#cbd5e1]";
                return (
                  <li key={item.id} className="flex flex-1 items-center gap-3 rounded-[14px] bg-white px-3 py-2 sm:bg-transparent">
                    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${tone}`}>{item.id}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold leading-5 text-[#0f172a]">{item.label}</div>
                      <div className="truncate text-[12px] leading-4 text-[#64748b]">{item.hint}</div>
                    </div>
                    {idx < arr.length - 1 ? (
                      <span aria-hidden className="hidden h-px w-6 shrink-0 bg-[#cbd5e1] sm:block" />
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {rewriting && (
              <GenerationTracePanel traces={generationTraces} activeOperation="rewrite" className="mt-5" onStop={() => stopGeneration("rewrite")} />
            )}
            {!rewriting && generatingQuestions && (
              <GenerationTracePanel traces={generationTraces} activeOperation="questions" className="mt-5" onStop={() => stopGeneration("questions")} />
            )}

            <div className="mt-8 space-y-6">
              {/* 01 简历主卡：合并状态 + 操作 + 事实护栏 + 视图切换 + 内容 */}
              <article className="rounded-[22px] border border-[#c7d2fe] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:rounded-[24px] sm:p-6">
                <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0f172a] text-[12px] font-semibold leading-4 text-white">01</span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold leading-5 text-[#4f46e5]">简历材料</div>
                      <div className="mt-1 text-[20px] font-semibold leading-7 text-[#0f172a] sm:text-[22px] sm:leading-8">岗位定制简历</div>
                      <div className="mt-2 max-w-[620px] text-[16px] leading-8 text-[#475569]">
                        {rewriteResult
                          ? "先看事实护栏，再切换「对比检查」或「编辑全文」完成定稿。"
                          : "基于投递决策报告与 JD 改写表达，不会编造事实。"}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
                    {!rewriteResult ? (
                      <button onClick={() => { if (requirePaid("rewrite")) handleRewrite(); }} disabled={rewriting} className="aipm-btn-primary w-full disabled:opacity-40 sm:w-[170px]">
                        {rewriting ? "改写中..." : "生成定制简历"}
                      </button>
                    ) : (
                      <>
                        <button onClick={() => { if (requirePaid("rewrite")) openRegenerateConfirm("rewrite"); }} disabled={rewriting} className="rounded-full border border-[#cbd5e1] bg-white px-4 py-2 text-sm font-semibold text-[#475569] disabled:opacity-40">
                          {rewriting ? "重生成中..." : "重新生成简历"}
                        </button>
                        <button onClick={() => setViewMode("compare")} className={`rounded-full px-4 py-2 text-sm font-semibold ${viewMode === "compare" ? "bg-[#0f172a] text-white" : "border border-[#cbd5e1] bg-white text-[#64748b]"}`}>
                          对比检查
                        </button>
                        <button onClick={() => setViewMode("edit")} className={`rounded-full px-4 py-2 text-sm font-semibold ${viewMode === "edit" ? "bg-[#0f172a] text-white" : "border border-[#cbd5e1] bg-white text-[#64748b]"}`}>
                          编辑全文
                        </button>
                      </>
                    )}
                  </div>
                </header>

                {!rewriteResult ? (
                  <div className="mt-5 rounded-[18px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-5 text-[16px] leading-8 text-[#64748b]">
                    还没有生成岗位定制简历。生成完成后，这里会显示定制简历和全文编辑区。
                  </div>
                ) : (
                  <>
                    {/* 事实护栏：移到主卡顶部，和操作按钮在同一视口内 */}
                    <div className="mt-5 rounded-[18px] border border-[#bbf7d0] bg-[#f0fdf4] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-[14px] font-semibold leading-5 text-[#0f766e]">事实护栏：{formatRewriteFactGuardStatus(rewriteResult.factGuard.status)}</div>
                          <div className="mt-1 break-words text-[15px] leading-7 text-[#475569]">{rewriteResult.factGuard.summary}</div>
                        </div>
                        <span className="inline-flex w-fit shrink-0 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[#0f766e]">{rewriteResult.sections.length} 个模块</span>
                      </div>
                    </div>

                    {viewMode === "edit" ? (
                      <div className="mt-5 rounded-[18px] border border-[#e2e8f0] bg-white p-4">
                        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-sm font-semibold text-[#0f172a]">完整简历编辑区</span>
                          <span className="text-sm tabular-nums text-[#94a3b8]">{editableRewriteText.length} 字</span>
                        </div>
                        <textarea
                          value={editableRewriteText}
                          onChange={(e) => setEditableRewriteText(e.target.value)}
                          className="h-[320px] w-full resize-y rounded-[14px] border border-[#e2e8f0] bg-[#f8fafc] p-4 text-[16px] leading-8 text-[#0f172a] focus:border-[#4f46e5] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[rgba(79,70,229,0.12)] sm:h-[420px] sm:text-[15px] sm:leading-7"
                          spellCheck={false}
                        />
                      </div>
                    ) : null}

                    {viewMode === "compare" && compareSection ? (
                      <div className="mt-5 space-y-4">
                        {rewriteResult.sections.length > 1 ? (
                          <div className="flex flex-wrap gap-2">
                            {rewriteResult.sections.slice(0, 8).map((section, index) => (
                              <button
                                key={`${section.sectionLabel}-${index}`}
                                type="button"
                                onClick={() => setCompareSectionIndex(index)}
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${compareSectionIndex === index ? "bg-[#eef2ff] text-[#4f46e5] ring-1 ring-[#c7d2fe]" : "border border-[#e2e8f0] bg-white text-[#64748b] hover:border-[#cbd5e1]"}`}
                              >
                                {section.sectionLabel}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="rounded-[18px] border border-[#e2e8f0] bg-[#f8fafc] p-4">
                            <div className="text-[12px] font-semibold leading-4 text-[#64748b]">原简历片段</div>
                            <ResumeTextLines text={compareSection.originalText} className="mt-3 text-[#475569]" />
                          </div>
                          <div className="rounded-[18px] border border-[#0f766e] bg-white p-4">
                            <div className="text-[12px] font-semibold leading-4 text-[#0f766e]">改写后</div>
                            <ResumeTextLines text={compareSection.rewrittenText} terms={rewriteResult.aipmTermsHighlighted} className="mt-3 text-[#0f172a]" />
                            {compareSection.explanation ? (
                              <div className="mt-3 rounded-[12px] bg-[#ecfdf5] px-3 py-2 text-[12px] leading-5 text-[#0f766e]">
                                {compareSection.explanation}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <details className="group rounded-[16px] border border-[#e2e8f0] bg-[#f8fafc] open:bg-white">
                          <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-[13px] font-semibold leading-5 text-[#0f172a]">
                            <span>展开查看全部 {rewriteResult.sections.length} 个模块速览</span>
                            <span className="text-[12px] font-medium text-[#64748b] group-open:hidden">点击展开</span>
                            <span className="hidden text-[12px] font-medium text-[#64748b] group-open:inline">点击收起</span>
                          </summary>
                          <div className="space-y-3 px-4 pb-4">
                            {rewriteResult.sections.map((section, index) => (
                              <ResumeSectionPreview key={`${section.sectionLabel}-${index}`} section={section} terms={rewriteResult.aipmTermsHighlighted} />
                            ))}
                          </div>
                        </details>
                      </div>
                    ) : null}
                  </>
                )}
              </article>

              {/* 02 面试题卡：可先基于原始简历生成；有投递版简历时自动使用投递版 */}
              {(() => {
                const batchPlan = getInterviewBatchPlan(identity);
                const totalBatches = batchPlan.length;
                const nextBatch = interviewBatchIndex < totalBatches ? batchPlan[interviewBatchIndex] : null;
                const isFirstRun = interviewBatchIndex === 0 && interviewQuestions.length === 0;
                const allDone = interviewBatchIndex >= totalBatches;
                const questionSourceLabel = rewriteResult ? "投递版简历" : "原始简历";
                return (
                <article className="rounded-[22px] border border-[#e2e8f0] bg-white p-4 sm:rounded-[24px] sm:p-6">
                  <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0f172a] text-[12px] font-semibold leading-4 text-white">02</span>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold leading-5 text-[#4f46e5]">面试准备</div>
                        <div className="mt-1 text-[20px] font-semibold leading-7 text-[#0f172a]">高频追问 × 回答包</div>
                        <div className="mt-2 max-w-[680px] text-[16px] leading-8 text-[#475569]">
                          {interviewQuestions.length
                            ? `已基于${questionSourceLabel}生成 ${interviewQuestions.length} 道题目（共 ${interviewBatchIndex}/${totalBatches} 批）。先快速看题是否命中，再按需为单题生成回答框架、参考话术和常见坑。${nextBatch ? "可继续生成下一批题目。" : "已完成全部题目批次。"}`
                            : `先快速生成基于${questionSourceLabel}和 JD 的题目列表；确认题目命中后，再为重点题目单独生成回答包。`}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
                      {nextBatch ? (
                        <button
                          onClick={() => { if (requirePaid("questions")) handleGenerateQuestions(); }}
                          disabled={generatingQuestions}
                          className="aipm-btn-secondary w-full shrink-0 disabled:opacity-40 sm:w-[200px]"
                        >
                          {generatingQuestions
                            ? "生成中..."
                            : isFirstRun
                              ? `生成第 1 批：${nextBatch.label}`
                              : `继续：${nextBatch.label}`}
                        </button>
                      ) : (
                        <button
                          onClick={handleResetInterviewQuestions}
                          disabled={generatingQuestions}
                          className="aipm-btn-secondary w-full shrink-0 disabled:opacity-40 sm:w-[170px]"
                        >
                          重新生成面试题
                        </button>
                      )}
                    </div>
                  </header>

                  <div className="mt-5 rounded-[16px] border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-[15px] leading-7 text-[#475569]">
                    已生成 <span className="font-semibold text-[#0f172a]">{interviewQuestions.length}</span> 道题
                    {nextBatch ? `，可继续生成：${nextBatch.label}` : "，题目已生成完毕"}
                  </div>

                  <div className="mt-5 space-y-4">
                    {interviewQuestions.length > 0 ? (
                      (isPaid ? interviewQuestions : interviewQuestions.slice(0, 2)).map((question, qIndex) => (
                        <InterviewQuestionCard
                          key={question.id}
                          index={qIndex + 1}
                          question={question}
                          locked={!isPaid && qIndex >= 1}
                          generatingDetail={answeringQuestionId === question.id}
                          detailGenerationDisabled={Boolean(answeringQuestionId && answeringQuestionId !== question.id)}
                          onGenerateDetail={() => handleGenerateQuestionDetail(question.id)}
                          onRegenerateDetail={() => openRegenerateConfirm("question-detail", question.id)}
                          onUnlock={() => { setPaywallAction("questions"); setPaywallOpen(true); }}
                        />
                      ))
                    ) : (
                      <div className="rounded-[16px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-4 text-[13px] leading-5 text-[#94a3b8]">
                        点击右上角按钮开始生成第 1 批，当前将使用{questionSourceLabel}和 JD 作为题目依据。
                      </div>
                    )}
                    {allDone && interviewQuestions.length > 0 ? (
                      <div className="rounded-[16px] border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-[13px] leading-5 text-[#166534]">
                        全部 {totalBatches} 批题目已生成完毕，共 {interviewQuestions.length} 道。可继续为重点题生成回答包。
                      </div>
                    ) : null}
                    {!isPaid && interviewQuestions.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => { setPaywallAction("questions"); setPaywallOpen(true); }}
                        className="w-full rounded-[16px] border border-dashed border-[#fbcfe8] bg-[#fff7fb] px-4 py-3 text-[13px] font-semibold leading-5 text-[#be185d] transition hover:bg-[#fdecf3]"
                      >
                        解锁生成剩余 {Math.max(interviewQuestions.length - 2, 0)} 道面试题与完整回答包
                      </button>
                    ) : null}
                  </div>
                </article>
                );
              })()}

              {/* 03 导出卡：未生成简历时折叠为占位条 */}
              {!rewriteResult ? (
                <div className="flex items-center gap-3 rounded-[18px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-5 py-4 text-[13px] leading-5 text-[#94a3b8]">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#cbd5e1] bg-white text-[12px] font-semibold text-[#94a3b8]">03</span>
                  <span className="min-w-0 flex-1">导出交付：等简历生成后展开复制 / 下载入口</span>
                </div>
              ) : (
                <article className="rounded-[22px] border border-[#e2e8f0] bg-white p-4 sm:rounded-[24px] sm:p-6">
                  <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0f172a] text-[12px] font-semibold leading-4 text-white">03</span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold leading-5 text-[#4f46e5]">最终交付</div>
                        <div className="mt-1 text-[20px] font-semibold leading-7 text-[#0f172a]">复制或导出</div>
                        <div className="mt-2 text-[13px] leading-5 text-[#64748b]">确认简历内容后，再复制全文或导出 Word 投递材料。</div>
                      </div>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(editableRewriteText || rewriteResult?.fullRewrittenText || "");
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        disabled={!rewriteResult}
                        className="aipm-btn-secondary w-full disabled:opacity-40 sm:w-[150px]"
                      >
                        {copied ? "已复制" : "复制简历全文"}
                      </button>
                      <button
                        onClick={() => { if (requirePaid("export")) handleExportDocx(); }}
                        disabled={!rewriteResult || exporting}
                        className="aipm-btn-primary w-full disabled:opacity-40 sm:w-[130px]"
                      >
                        {exporting ? "导出中..." : "下载 Word"}
                      </button>
                    </div>
                  </header>
                  <ProgressBar active={exporting} stages={EXPORT_STAGES} completedMessage="Word 文档已生成" />
                  {exporting ? (
                    <GenerationTracePanel traces={generationTraces} activeOperation="export" className="mt-4" onStop={() => stopGeneration("export")} />
                  ) : null}
                </article>
              )}
            </div>
          </section>
        )}
      </main>

      <PaywallModal
        open={paywallOpen}
        onClose={() => { setPaywallOpen(false); setPaywallAction(null); }}
        onUnlock={handlePaywallUnlock}
      />
      <RegenerateConfirmDialog
        open={Boolean(regenerateConfirm)}
        title={regenerateConfirm?.title ?? ""}
        description={regenerateConfirm?.description ?? ""}
        confirmLabel={regenerateConfirm?.confirmLabel ?? "继续"}
        onClose={() => setRegenerateConfirm(null)}
        onConfirm={handleConfirmRegenerate}
      />
    </div>
  );
}

function DecisionStatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="h-[104px] rounded-[20px] border border-[#e2e8f0] bg-white px-[18px] py-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
      <div className="text-[12px] font-medium leading-4 text-[#64748b]">{label}</div>
      <div className="mt-2 text-[28px] font-semibold leading-9 text-[#0f172a]">{value}</div>
      <div className="text-[12px] leading-4 text-[#94a3b8]">{note}</div>
    </div>
  );
}

function InterviewQuestionCard({
  index,
  question,
  locked,
  generatingDetail,
  detailGenerationDisabled,
  onGenerateDetail,
  onRegenerateDetail,
  onUnlock,
}: {
  index: number;
  question: InterviewQuestionItem;
  locked: boolean;
  generatingDetail: boolean;
  detailGenerationDisabled: boolean;
  onGenerateDetail: () => void;
  onRegenerateDetail: () => void;
  onUnlock: () => void;
}) {
  const categoryLabel = CATEGORY_LABEL_MAP[question.category] ?? question.category;
  const keyPoints = (question.keyPoints ?? []).filter(Boolean);
  const pitfalls = (question.pitfalls ?? []).filter(Boolean);
  const sampleAnswer = (question.sampleAnswer ?? "").trim();
  const hasDetail = Boolean(sampleAnswer || keyPoints.length || pitfalls.length);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!sampleAnswer) return;
    try {
      await navigator.clipboard.writeText(sampleAnswer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className="rounded-[22px] border border-[#e2e8f0] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.035)] transition hover:border-[#cbd5e1]">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold leading-4 text-[#64748b]">Q{String(index).padStart(2, "0")}</span>
            <span className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-[12px] font-semibold leading-4 text-[#475569]">
              {categoryLabel}
            </span>
            {hasDetail ? (
              <span className="rounded-full bg-[#ecfdf5] px-2.5 py-1 text-[12px] font-semibold leading-4 text-[#0f766e]">已生成回答包</span>
            ) : null}
          </div>
          <h4 className="mt-3 break-words text-[20px] font-semibold leading-9 text-[#0f172a]">
            {question.question}
          </h4>
        </div>
        {!locked ? (
          <button
            type="button"
            onClick={hasDetail ? onRegenerateDetail : onGenerateDetail}
            disabled={generatingDetail || detailGenerationDisabled}
            className="inline-flex h-11 w-full shrink-0 items-center justify-center rounded-[14px] bg-[#0f172a] px-4 text-[15px] font-semibold leading-5 text-white transition hover:bg-[#1e293b] disabled:opacity-50 sm:w-[170px]"
          >
            {generatingDetail ? "生成中..." : detailGenerationDisabled ? "请稍候" : hasDetail ? "重新生成回答包" : "生成回答包"}
          </button>
        ) : null}
      </header>

      <div className="mt-4 rounded-[16px] border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
        <div className="text-[14px] font-semibold leading-5 text-[#475569]">面试官真正想验证</div>
        <p className="mt-1.5 break-words text-[17px] leading-8 text-[#334155]">
          {question.whyAsked || "—"}
        </p>
      </div>

      {locked ? (
        <button
          type="button"
          onClick={onUnlock}
          className="mt-4 block w-full rounded-[16px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-3 text-left text-[16px] font-semibold leading-7 text-[#475569] transition hover:bg-white"
        >
          解锁查看可复述话术、复述要点和追问风险
        </button>
      ) : hasDetail ? (
        <details className="group mt-4 rounded-[18px] border border-[#e2e8f0] bg-white open:bg-[#f8fafc]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[16px] font-semibold leading-7 text-[#0f172a]">
            <span>查看回答包</span>
            <span className="text-[13px] font-medium text-[#64748b] group-open:hidden">展开</span>
            <span className="hidden text-[13px] font-medium text-[#64748b] group-open:inline">收起</span>
          </summary>
          <div className="border-t border-[#e2e8f0] px-4 pb-4 pt-4">
            {sampleAnswer ? (
              <section>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[14px] font-semibold leading-5 text-[#475569]">可直接复述的话术</div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex h-8 items-center rounded-full border border-[#cbd5e1] bg-white px-3 text-[12px] font-semibold leading-4 text-[#475569] transition hover:border-[#94a3b8]"
                  >
                    {copied ? "已复制" : "复制"}
                  </button>
                </div>
                <p className="mt-2 whitespace-pre-line break-words rounded-[14px] border border-[#e2e8f0] bg-white px-4 py-3 text-[17px] leading-9 text-[#0f172a]">
                  {sampleAnswer}
                </p>
              </section>
            ) : null}

            {(keyPoints.length || pitfalls.length) ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {keyPoints.length ? (
                  <section>
                    <div className="text-[14px] font-semibold leading-5 text-[#475569]">复述要点</div>
                    <ul className="mt-2 space-y-2 text-[16px] leading-8 text-[#334155]">
                      {keyPoints.map((point, i) => (
                        <li key={`${question.id}-key-${i}`} className="flex items-start gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#64748b]" />
                          <span className="break-words">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {pitfalls.length ? (
                  <section>
                    <div className="text-[14px] font-semibold leading-5 text-[#475569]">容易被追问的坑</div>
                    <ul className="mt-2 space-y-2 text-[16px] leading-8 text-[#334155]">
                      {pitfalls.map((point, i) => (
                        <li key={`${question.id}-pit-${i}`} className="flex items-start gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#64748b]" />
                          <span className="break-words">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function RegenerateConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-[28px] border border-white/20 bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.22)] sm:rounded-[32px] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#fde68a] bg-[#fffbeb] text-[#d97706]">
            <ProductIcon name="history" className="h-5 w-5" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e2e8f0] bg-white text-[#64748b] transition hover:border-[#cbd5e1] hover:text-[#0f172a]"
            aria-label="关闭确认弹窗"
          >
            <ProductIcon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">
          <h3 className="text-[22px] font-semibold leading-8 text-[#0f172a]">{title}</h3>
          <p className="mt-2 text-[16px] leading-7 text-[#475569]">{description}</p>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="aipm-btn-secondary w-full sm:w-[120px]">
            先取消
          </button>
          <button type="button" onClick={onConfirm} className="aipm-btn-primary w-full sm:w-[156px]">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function GenerationTracePanel({
  traces,
  activeOperation,
  className = "",
  onStop,
}: {
  traces: GenerationTraceItem[];
  activeOperation?: GenerationOperation;
  className?: string;
  onStop?: () => void;
}) {
  const operationMeta: Record<GenerationOperation, { title: string; desc: string }> = {
    upload: { title: "PDF 解析", desc: "上传文件、解析文本和识别简历内容" },
    structure: { title: "简历结构整理", desc: "规整段落、修正换行和基础表达" },
    analysis: { title: "投递决策报告", desc: "快速整理投递判断、匹配分和优先补齐项" },
    rewrite: { title: "岗位定制简历", desc: "展示原文、改写后和改写原因" },
    questions: { title: "面试预测题", desc: "生成高频追问、回答要点和考察维度" },
    export: { title: "Word 导出", desc: "整理简历结构并生成可下载文档" },
  };
  const scopedOperation = activeOperation ?? traces[0]?.operation;
  const scopedTraces = scopedOperation ? traces.filter((trace) => trace.operation === scopedOperation) : [];
  const visibleTraces = scopedTraces.slice(0, 8);
  const latest = visibleTraces[0];
  const rewriteTraces = latest?.status === "running"
    ? visibleTraces.filter((trace) => trace.artifact).slice(0, 2)
    : [];
  const taskMeta = scopedOperation ? operationMeta[scopedOperation] : undefined;

  if (!latest) {
    return (
      <div className={`rounded-[20px] border border-dashed border-[#cbd5e1] bg-white px-5 py-4 ${className}`}>
        <div className="text-[14px] font-semibold leading-5 text-[#0f172a]">AI 生成过程</div>
        <div className="mt-1 text-[13px] leading-5 text-[#94a3b8]">开始生成后，这里会展示当前任务状态；有真实产物时会直接展示结果。</div>
      </div>
    );
  }

  return (
    <div className={className}>
      <GenerationActivity
        title={taskMeta?.title ?? latest.label}
        description={taskMeta?.desc}
        message={latest.message}
        status={latest.status}
        progress={latest.progress}
        startedAt={latest.timestamp}
        onStop={latest.status === "running" ? onStop : undefined}
      />
      {rewriteTraces.length > 0 ? (
        <div className="mt-4 space-y-4 rounded-[22px] border border-[#e2e8f0] bg-white px-5 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-semibold leading-5 text-[#0f172a]">真实改写过程</div>
              <div className="text-[12px] leading-5 text-[#94a3b8]">展示最近 2 段</div>
            </div>
          {rewriteTraces.map((trace) => {
            const artifact = trace.artifact;
            if (!artifact) return null;
            return (
              <div key={trace.id} className="rounded-[18px] border border-[#dbeafe] bg-[#f8fafc] p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[13px] font-semibold leading-5 text-[#0f172a]">{artifact.sectionLabel}</div>
                  <div className="text-[11px] leading-4 text-[#94a3b8]">
                    {new Date(trace.timestamp).toLocaleTimeString("zh-CN", { hour12: false, minute: "2-digit", second: "2-digit" })}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <div className="rounded-[14px] border border-[#e2e8f0] bg-white p-3">
                    <div className="text-[11px] font-semibold leading-4 text-[#64748b]">原文</div>
                    <p className="mt-2 max-h-[150px] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-[#475569]">
                      {artifact.originalText}
                    </p>
                  </div>
                  <div className="rounded-[14px] border border-[#bbf7d0] bg-white p-3">
                    <div className="text-[11px] font-semibold leading-4 text-[#0f766e]">改写后</div>
                    <p className="mt-2 max-h-[150px] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-[#0f172a]">
                      {artifact.rewrittenText}
                    </p>
                  </div>
                </div>
                {(artifact.explanation || artifact.targetDimensions?.length) && (
                  <div className="mt-3 rounded-[14px] border border-[#e2e8f0] bg-white px-3 py-2">
                    {artifact.explanation && (
                      <div className="break-words text-[12px] leading-5 text-[#475569]">
                        <span className="font-semibold text-[#0f172a]">为什么这样改：</span>{artifact.explanation}
                      </div>
                    )}
                    {artifact.targetDimensions?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {artifact.targetDimensions.slice(0, 4).map((dimension) => (
                          <span key={dimension} className="rounded-full bg-[#ecfdf5] px-2 py-1 text-[11px] font-semibold leading-4 text-[#0f766e]">
                            {dimension}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ResumeSectionPreview({
  section,
  terms,
}: {
  section: RewriteResult["sections"][number];
  terms: RewriteResult["aipmTermsHighlighted"];
}) {
  return (
    <div className="rounded-[18px] border border-[#e2e8f0] bg-[#f8fafc] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-[16px] font-semibold leading-6 text-[#0f172a]">{section.sectionLabel}</div>
        {section.targetDimensions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {section.targetDimensions.slice(0, 3).map((dimension) => (
              <span key={dimension} className="rounded-full bg-[#eef2ff] px-2 py-1 text-[11px] font-semibold leading-4 text-[#4f46e5]">
                {dimension}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <ResumeTextLines text={section.rewrittenText} terms={terms} className="mt-3 text-[#0f172a]" />
      {section.explanation ? (
        <div className="mt-3 rounded-[14px] border border-[#e2e8f0] bg-white px-3 py-2 text-[15px] leading-7 text-[#64748b]">
          <span className="font-semibold text-[#0f172a]">改写说明：</span>{section.explanation}
        </div>
      ) : null}
    </div>
  );
}

function ResumeTextLines({
  text,
  terms = [],
  className = "",
}: {
  text: string;
  terms?: RewriteResult["aipmTermsHighlighted"];
  className?: string;
}) {
  const sanitized = (text || "")
    .replace(/\r/g, "")
    .replace(/\\r\\n|\\r|\\n/g, "\n")
    .replace(/(?<!\\)\\n/g, "\n")
    .replace(/\\\\/g, "")
    .replace(/\*{2,3}([^*\n]+)\*{2,3}/g, "$1")
    .replace(/\|/g, "·");

  const lines = sanitized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^#{1,6}\s+/, ""))
    .map((line) => line.replace(/\s*#{2,6}\s+/g, " · "))
    .filter(Boolean);

  if (!lines.length) {
    return <div className={`text-[16px] leading-8 text-[#94a3b8] ${className}`}>暂无内容</div>;
  }

  const isHeadingLike = (line: string) => {
    if (/^[-•·●]\s*/.test(line)) return false;
    const hasSeparator = /[·•｜|]|\s·\s/.test(line) || /[-/]\s*(?:至今|present|Present|\d{4})/.test(line);
    const hasDate = /\d{4}\s*(?:[./\-年]|至)/.test(line);
    return (hasSeparator && hasDate) || /^(?:[\u4e00-\u9fa5A-Za-z]{2,}：)/.test(line);
  };

  return (
    <div className={`space-y-2.5 text-[16px] leading-8 ${className}`}>
      {lines.map((line, index) => {
        const isBullet = /^[-•·●]\s*/.test(line);
        const content = line.replace(/^[-•·●]\s*/, "");
        if (isBullet) {
          return (
            <div key={`${content}-${index}`} className="grid grid-cols-[10px_minmax(0,1fr)] gap-2">
              <span className="mt-[9px] h-1.5 w-1.5 rounded-full bg-[#4f46e5]" />
              <div className="min-w-0 break-words">
                <AIPMTermHighlighter text={content} terms={terms} />
              </div>
            </div>
          );
        }
        if (isHeadingLike(content)) {
          return (
            <p key={`${content}-${index}`} className="break-words font-semibold text-[#0f172a]">
              <AIPMTermHighlighter text={content} terms={terms} />
            </p>
          );
        }
        return (
          <p key={`${content}-${index}`} className="break-words">
            <AIPMTermHighlighter text={content} terms={terms} />
          </p>
        );
      })}
    </div>
  );
}

function StatusGlyph({
  recommendation,
  className,
}: {
  recommendation: DecisionReport["recommendation"];
  className?: string;
}) {
  if (recommendation === "recommended") {
    return <CheckGlyph className={className} />;
  }
  if (recommendation === "cautious") {
    return <AlertGlyph className={className} />;
  }
  return <CloseGlyph className={className} />;
}

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CloseGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function AlertGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 3.9 1.8 18.4A1.2 1.2 0 0 0 2.8 20h18.4a1.2 1.2 0 0 0 1-1.8L13.7 3.9a1.2 1.2 0 0 0-2.4 0Z" />
    </svg>
  );
}
