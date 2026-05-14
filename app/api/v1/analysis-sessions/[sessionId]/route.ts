import { NextResponse } from "next/server";
import { analysisStore } from "@/lib/analysis-store";
import type { GetAnalysisSessionResponse } from "@/types/api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;
  const session = await analysisStore.getSession(sessionId);

  if (!session) {
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

  const data: GetAnalysisSessionResponse = {
    sessionId: session.id,
    status: session.status,
    progress: session.status === "OPTIMIZED" ? 100 : 90,
    failureReason: session.failureReason,
  };

  return NextResponse.json({
    success: true,
    data,
    requestId: crypto.randomUUID(),
  });
}
