import { NextResponse } from "next/server";
import { analysisStore } from "@/lib/analysis-store";
import type { GetDiagnosisResponse } from "@/types/api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;
  const diagnosis = await analysisStore.getDiagnosis(sessionId);

  if (!diagnosis) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "diagnosis result not found",
        },
        requestId: crypto.randomUUID(),
      },
      { status: 404 }
    );
  }

  const data: GetDiagnosisResponse = {
    sessionId: diagnosis.sessionId,
    matchScore: diagnosis.matchScore,
    summary: diagnosis.summary,
    matchedKeywords: diagnosis.matchedKeywords,
    missingKeywords: diagnosis.missingKeywords,
    risks: diagnosis.risks,
    recommendations: diagnosis.recommendations,
  };

  return NextResponse.json({
    success: true,
    data,
    requestId: crypto.randomUUID(),
  });
}
