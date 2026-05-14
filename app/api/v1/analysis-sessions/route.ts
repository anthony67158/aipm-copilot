import { NextResponse } from "next/server";
import { analysisStore } from "@/lib/analysis-store";
import { getCurrentUserId } from "@/lib/auth";
import type { CreateAnalysisSessionRequest, CreateAnalysisSessionResponse, UserProfile } from "@/types/api";

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<CreateAnalysisSessionRequest & { userProfile?: UserProfile; targetCompany?: string }>;
  const userId = await getCurrentUserId();

  if (!body.resumeText?.trim() || !body.jobDescriptionText?.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "resumeText and jobDescriptionText are required",
        },
        requestId: crypto.randomUUID(),
      },
      { status: 422 }
    );
  }

  const session = await analysisStore.createSession({
    userId,
    resumeText: body.resumeText,
    resumeFileUrl: body.resumeFileUrl,
    jobDescriptionText: body.jobDescriptionText,
    jobTitle: body.jobTitle,
    jobCategory: body.jobCategory,
    applicationType: body.applicationType,
    focusModules: body.focusModules,
    userProfile: body.userProfile,
    targetCompany: body.targetCompany,
  });

  const data: CreateAnalysisSessionResponse = {
    sessionId: session.id,
    status: session.status,
    createdAt: session.createdAt,
  };

  return NextResponse.json({
    success: true,
    data,
    requestId: crypto.randomUUID(),
  });
}
