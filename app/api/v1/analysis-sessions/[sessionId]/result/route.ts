import { NextResponse } from "next/server";
import { analysisStore } from "@/lib/analysis-store";
import { buildRewriteFactGuard, validateRewriteConsistency } from "@/lib/rewrite-guard";
import type { GetRewriteResultResponse, RewriteSection } from "@/types/api";

// Legacy compatibility route.
// New code should call /api/v1/analysis-sessions/[sessionId]/rewrite instead.
export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;
  const [session, result] = await Promise.all([
    analysisStore.getSession(sessionId),
    analysisStore.getOptimization(sessionId),
  ]);

  if (!session || !result) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "rewrite result not found",
        },
        requestId: crypto.randomUUID(),
      },
      { status: 404 }
    );
  }

  const sections: RewriteSection[] = result.optimizedSections.map((section) => ({
    sectionKey: section.sectionKey,
    sectionLabel: section.sectionLabel,
    originalText: section.originalText,
    rewrittenText: section.optimizedText,
    explanation: section.explanation,
    targetDimensions: [],
  }));

  const validation = validateRewriteConsistency({
    resumeText: session.resumeText,
    sections,
    fullRewrittenText: result.fullOptimizedResumeText,
    aipmTermsHighlighted: [],
  });

  const data: GetRewriteResultResponse = {
    sessionId: result.sessionId,
    beforeScore: result.beforeScore ?? 0,
    afterScore: result.afterScore ?? 0,
    rewriteStrategy: "legacy-result-route",
    sections,
    fullRewrittenText: result.fullOptimizedResumeText,
    aipmTermsHighlighted: [],
    factGuard: buildRewriteFactGuard(validation.isValid ? "passed" : "risky", validation.issues),
  };

  return NextResponse.json({
    success: true,
    data,
    requestId: crypto.randomUUID(),
  });
}
