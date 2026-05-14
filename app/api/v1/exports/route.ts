import { NextResponse } from "next/server";
import { exportStore } from "@/lib/export-store";
import { getCurrentUserId } from "@/lib/auth";
import type { CreateExportJobRequest, CreateExportJobResponse } from "@/types/api";

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "请先登录后再导出" },
        requestId: crypto.randomUUID(),
      },
      { status: 401 }
    );
  }
  const body = (await request.json()) as Partial<CreateExportJobRequest>;
  if (!body.sourceType || !body.sourceId || !body.format) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "sourceType, sourceId and format are required",
        },
        requestId: crypto.randomUUID(),
      },
      { status: 422 }
    );
  }

  const exportJob = await exportStore.createExportJob({
    sourceType: body.sourceType,
    sourceId: body.sourceId,
    format: body.format,
  }, userId);

  const data: CreateExportJobResponse = {
    exportId: exportJob.id,
    status: exportJob.status,
  };

  return NextResponse.json({ success: true, data, requestId: crypto.randomUUID() });
}
