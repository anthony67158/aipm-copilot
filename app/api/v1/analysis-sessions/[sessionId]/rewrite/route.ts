import { NextResponse } from "next/server";
import { analysisStore } from "@/lib/analysis-store";
import { createGenerationStream, wantsEventStream } from "@/lib/generation-stream";
import { buildRewriteFactGuard, validateRewriteConsistency } from "@/lib/rewrite-guard";
import type { GetRewriteResultResponse, RewriteSection, TriggerRewriteRequest } from "@/types/api";

type CachedRewriteSection = {
  sectionKey: string;
  sectionLabel: string;
  originalText: string;
  rewrittenText?: string;
  optimizedText?: string;
  explanation: string;
};

function formatCachedRewriteText(sectionKey: string, text: string) {
  const shouldBullet = !["profile", "education"].includes(sectionKey);
  const lines = text
    .replace(/\r/g, "")
    .replace(/\\n/g, "\n")
    .replace(/([。；;])\s*(?=[^-#\n])/g, "$1\n")
    .replace(/\s+(?=(?:[-*]\s+|[•·●]\s+|\d+[.、]\s*))/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim().replace(/^[•·●*]\s*/, "- "))
    .filter(Boolean)
    .filter((line) => !line.startsWith("## "));

  return lines
    .map((line) => {
      if (!shouldBullet) return line.replace(/^-\s*/, "");
      const hasDate = /\d{4}\s*(?:[./\-年]|至)/.test(line);
      const looksLikeHeading = hasDate && line.length <= 120 && /[·•｜|]|\s·\s|\s\|\s/.test(line);
      if (looksLikeHeading) return line.replace(/^-\s*/, "");
      return line.startsWith("- ") ? line : `- ${line}`;
    })
    .join("\n");
}

function formatCachedFullResume(sections: RewriteSection[]) {
  return sections
    .map((section) => {
      const body = formatCachedRewriteText(section.sectionKey, section.rewrittenText);
      return body ? `## ${section.sectionLabel}\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function getCachedRewriteQualityIssue(sections: RewriteSection[], fullRewrittenText: string) {
  const moduleCount = (fullRewrittenText.match(/^##\s+/gm) ?? []).length;
  if (sections.length > 1 && moduleCount < Math.max(2, Math.ceil(sections.length * 0.8))) {
    return "完整简历缺少模块标题";
  }

  for (const section of sections) {
    const lines = section.rewrittenText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const shouldHaveBullets = !["profile", "education", "skills", "awards", "certifications"].includes(section.sectionKey)
      && section.originalText.replace(/\s+/g, "").length > 60;
    const bulletLines = lines.filter((line) => line.startsWith("- "));
    if (shouldHaveBullets && bulletLines.length < 2) {
      return `${section.sectionLabel} 缺少完整 bullet 结构`;
    }
    for (const line of lines) {
      const text = line.replace(/^-\s*/, "").trim();
      if (text.length > 125 && !/\d{4}\s*(?:[./\-年]|至)/.test(text)) {
        return `${section.sectionLabel} 存在过长单行`;
      }
      if (/[，,、；;：:]$/.test(text) || /(通过|基于|围绕|包括|以及|并|和|及|或|与|为|将|对)$/.test(text)) {
        return `${section.sectionLabel} 存在疑似不完整语句`;
      }
    }
  }
  return null;
}

function buildCachedRewriteResponse(
  session: Awaited<ReturnType<typeof analysisStore.getSession>>,
  result: Awaited<ReturnType<typeof analysisStore.getOptimization>>,
) {
  if (!session || !result) return null;

  const sections: RewriteSection[] = result.optimizedSections.map((section) => {
    const item = section as CachedRewriteSection;
    return {
      sectionKey: item.sectionKey,
      sectionLabel: item.sectionLabel,
      originalText: item.originalText,
      rewrittenText: formatCachedRewriteText(item.sectionKey, item.rewrittenText ?? item.optimizedText ?? ""),
      explanation: item.explanation,
      targetDimensions: [],
    };
  });
  const fullRewrittenText = formatCachedFullResume(sections);
  const qualityIssue = getCachedRewriteQualityIssue(sections, fullRewrittenText);
  if (qualityIssue) {
    console.warn(`cached rewrite ignored because quality is low: ${qualityIssue}`);
    return null;
  }

  const validation = validateRewriteConsistency({
    resumeText: session.resumeText,
    sections,
    fullRewrittenText,
    aipmTermsHighlighted: [],
  });

  const data: GetRewriteResultResponse = {
    sessionId: result.sessionId,
    beforeScore: result.beforeScore ?? 0,
    afterScore: result.afterScore ?? 0,
    rewriteStrategy: "已返回上次生成的岗位定制简历，避免重复等待。",
    sections,
    fullRewrittenText,
    aipmTermsHighlighted: [],
    factGuard: buildRewriteFactGuard(validation.isValid ? "passed" : "risky", validation.issues),
  };

  return data;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = (await request.json()) as Partial<TriggerRewriteRequest>;

  try {
    if (wantsEventStream(request)) {
      return createGenerationStream("rewrite", async (emit) => {
        if (!body.focusDimensions?.length) {
          const [session, cached] = await Promise.all([
            analysisStore.getSession(sessionId),
            analysisStore.getOptimization(sessionId),
          ]);
          const cachedData = buildCachedRewriteResponse(session, cached);
          if (cachedData) {
            emit({ stage: "rewrite_cached", message: "已命中上次生成结果，无需重复等待", progress: 100 });
            return { success: true, data: cachedData, requestId: crypto.randomUUID() };
          }
        }

        const result = await analysisStore.generateAndSaveRewrite(sessionId, {
          rewriteMode: body.rewriteMode,
          focusDimensions: body.focusDimensions,
          onProgress: emit,
        });

        if (!result) {
          throw new Error("Session not found");
        }

        return { success: true, data: result, requestId: crypto.randomUUID() };
      });
    }

    if (!body.focusDimensions?.length) {
      const [session, cached] = await Promise.all([
        analysisStore.getSession(sessionId),
        analysisStore.getOptimization(sessionId),
      ]);
      const cachedData = buildCachedRewriteResponse(session, cached);
      if (cachedData) {
        return NextResponse.json({ success: true, data: cachedData, requestId: crypto.randomUUID() });
      }
    }

    const result = await analysisStore.generateAndSaveRewrite(sessionId, {
      rewriteMode: body.rewriteMode,
      focusDimensions: body.focusDimensions,
    });

    if (!result) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Session not found" }, requestId: crypto.randomUUID() },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: result, requestId: crypto.randomUUID() });
  } catch (err) {
    console.error("rewrite generation failed:", err);
    return NextResponse.json(
      { success: false, error: { code: "LLM_ERROR", message: err instanceof Error ? err.message : "AI 改写失败，请重试" }, requestId: crypto.randomUUID() },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const [session, result] = await Promise.all([
    analysisStore.getSession(sessionId),
    analysisStore.getOptimization(sessionId),
  ]);
  if (!session || !result) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Rewrite result not found. Call POST first." }, requestId: crypto.randomUUID() },
      { status: 404 }
    );
  }

  const data = buildCachedRewriteResponse(session, result);
  if (!data) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Rewrite result not found. Call POST first." }, requestId: crypto.randomUUID() },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data, requestId: crypto.randomUUID() });
}
