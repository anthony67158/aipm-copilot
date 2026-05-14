import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { analysisStore } from "@/lib/analysis-store";
import { paymentStore } from "@/lib/payment-store";

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "请先登录后再认领报告" },
        requestId: crypto.randomUUID(),
      },
      { status: 401 }
    );
  }

  const body = (await request.json()) as Partial<{ sessionIds: string[]; paidSessionIds: string[] }>;
  const sessionIds = Array.isArray(body.sessionIds) ? body.sessionIds : [];
  const paidSessionIds = Array.isArray(body.paidSessionIds) ? body.paidSessionIds : [];

  const claimResult = await analysisStore.claimSessions(userId, sessionIds);
  await paymentStore.claimPaidSessions(userId, paidSessionIds);

  return NextResponse.json({
    success: true,
    data: { claimedCount: claimResult.count, paidClaimedCount: Array.from(new Set(paidSessionIds)).length },
    requestId: crypto.randomUUID(),
  });
}
