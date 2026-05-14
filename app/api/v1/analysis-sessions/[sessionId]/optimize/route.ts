import { NextResponse } from "next/server";
import { analysisStore } from "@/lib/analysis-store";
import type { OptimizeAnalysisSessionResponse, TriggerRewriteRequest } from "@/types/api";

// Legacy compatibility route.
// New code should call /api/v1/analysis-sessions/[sessionId]/rewrite instead.
export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;
  const body = (await request.json()) as Partial<TriggerRewriteRequest>;
  const result = await analysisStore.generateAndSaveRewrite(sessionId, {
    rewriteMode: body.rewriteMode,
  });

  if (!result) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "analysis session not found",
        },
        requestId: crypto.randomUUID(),
      },
      { status: 404 }
    );
  }

  const session = await analysisStore.getSession(sessionId);

  const data: OptimizeAnalysisSessionResponse = {
    sessionId: (session?.id ?? sessionId) as OptimizeAnalysisSessionResponse["sessionId"],
    status: session?.status ?? "OPTIMIZED",
  };

  return NextResponse.json({
    success: true,
    data,
    requestId: crypto.randomUUID(),
  });
}
