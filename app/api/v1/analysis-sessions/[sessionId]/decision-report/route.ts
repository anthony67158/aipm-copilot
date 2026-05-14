import { NextResponse } from "next/server";
import { analysisStore } from "@/lib/analysis-store";
import { createGenerationStream, wantsEventStream } from "@/lib/generation-stream";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    const existing = await analysisStore.getDecisionReport(sessionId);
    if (existing) {
      if (wantsEventStream(_request)) {
        return createGenerationStream("decisionReport", async (emit) => {
          emit({
            stage: "decision_cached",
            message: "已找到现有投递决策报告",
            current: 4,
            total: 4,
            progress: 96,
          });
          return { success: true, data: existing, requestId: crypto.randomUUID() };
        });
      }
      return NextResponse.json({ success: true, data: existing, requestId: crypto.randomUUID() });
    }

    if (wantsEventStream(_request)) {
      return createGenerationStream("decisionReport", async (emit) => {
        const report = await analysisStore.generateAndSaveDecisionReport(sessionId, { onProgress: emit });
        if (!report) {
          return {
            success: false,
            error: { code: "NOT_FOUND", message: "Session not found" },
            requestId: crypto.randomUUID(),
          };
        }

        return {
          success: true,
          data: report,
          requestId: crypto.randomUUID(),
        };
      });
    }

    const report = await analysisStore.generateAndSaveDecisionReport(sessionId);
    if (!report) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Session not found" }, requestId: crypto.randomUUID() },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: report, requestId: crypto.randomUUID() });
  } catch (err) {
    console.error("decision-report generation failed:", err);
    return NextResponse.json(
      { success: false, error: { code: "LLM_ERROR", message: err instanceof Error ? err.message : "AI 生成失败，请重试" }, requestId: crypto.randomUUID() },
      { status: 500 }
    );
  }
}
