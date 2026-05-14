import { NextResponse } from "next/server";
import { versionStore } from "@/lib/version-store";
import { getCurrentUserId } from "@/lib/auth";
import type {
  CreateResumeVersionRequestCompat,
  CreateResumeVersionResponse,
  ListResumeVersionsResponse,
} from "@/types/api";

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "请先登录后再保存简历版本" },
        requestId: crypto.randomUUID(),
      },
      { status: 401 }
    );
  }
  const body = (await request.json()) as Partial<CreateResumeVersionRequestCompat>;
  // Accept the legacy optimizedResumeText field for backward compatibility.
  const resumeText = body.rewrittenResumeText?.trim() || body.optimizedResumeText?.trim();
  if (!body.sessionId || !body.title?.trim() || !resumeText) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "sessionId、title 和 rewrittenResumeText 为必填项",
        },
        requestId: crypto.randomUUID(),
      },
      { status: 422 }
    );
  }

  try {
    const version = await versionStore.createVersion({
      sessionId: body.sessionId,
      title: body.title,
      rewrittenResumeText: resumeText,
    }, userId);

    const data: CreateResumeVersionResponse = { version };
    return NextResponse.json({ success: true, data, requestId: crypto.randomUUID() });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: error instanceof Error ? error.message : "create version failed",
        },
        requestId: crypto.randomUUID(),
      },
      { status: 404 }
    );
  }
}

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "请先登录后查看历史记录" },
        requestId: crypto.randomUUID(),
      },
      { status: 401 }
    );
  }
  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Number(searchParams.get("pageSize") || "20");
  const data: ListResumeVersionsResponse = await versionStore.listVersions(userId, page, pageSize);
  return NextResponse.json({ success: true, data, requestId: crypto.randomUUID() });
}
