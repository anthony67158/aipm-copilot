import { NextResponse } from "next/server";
import { polishResumeText } from "@/lib/llm";
import type { PolishResumeTextRequest, PolishResumeTextResponse } from "@/types/api";

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<PolishResumeTextRequest>;

  if (!body.resumeText?.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "resumeText is required",
        },
        requestId: crypto.randomUUID(),
      },
      { status: 422 }
    );
  }

  try {
    const result = await polishResumeText({
      resumeText: body.resumeText,
    });

    const data: PolishResumeTextResponse = {
      polishedText: result.polishedText,
      modelVersion: result.modelVersion,
      mode: result.mode,
    };

    return NextResponse.json({
      success: true,
      data,
      requestId: crypto.randomUUID(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "AI_PROCESSING_FAILED",
          message: error instanceof Error ? error.message : "AI 结构整理失败，请稍后重试",
        },
        requestId: crypto.randomUUID(),
      },
      { status: 504 }
    );
  }
}
