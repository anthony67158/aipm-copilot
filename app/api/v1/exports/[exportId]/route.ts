import { NextResponse } from "next/server";
import { exportStore } from "@/lib/export-store";
import { getCurrentUserId } from "@/lib/auth";
import type { GetExportJobResponse } from "@/types/api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ exportId: string }> }
) {
  const { exportId } = await context.params;
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "请先登录后查看导出任务" },
        requestId: crypto.randomUUID(),
      },
      { status: 401 }
    );
  }
  const exportJob = await exportStore.getExportJob(exportId, userId);

  if (!exportJob) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "export job not found",
        },
        requestId: crypto.randomUUID(),
      },
      { status: 404 }
    );
  }

  const data: GetExportJobResponse = {
    exportId: exportJob.id,
    status: exportJob.status,
    downloadUrl: exportJob.fileUrl ?? undefined,
    failureReason: exportJob.failureReason,
  };

  return NextResponse.json({ success: true, data, requestId: crypto.randomUUID() });
}
