import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { analysisStore } from "@/lib/analysis-store";
import type { ListReportHistoryResponse } from "@/types/api";

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "请先登录后查看报告记录" },
        requestId: crypto.randomUUID(),
      },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Number(searchParams.get("pageSize") || "20");
  const data: ListReportHistoryResponse = await analysisStore.listUserReports(userId, page, pageSize);

  return NextResponse.json({ success: true, data, requestId: crypto.randomUUID() });
}
