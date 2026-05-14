import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { paymentStore } from "@/lib/payment-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const userId = await getCurrentUserId();
  const { sessionId } = await context.params;
  const paid = userId ? await paymentStore.hasPaidSession(userId, sessionId) : false;

  return NextResponse.json({
    success: true,
    data: { paid },
    requestId: crypto.randomUUID(),
  });
}
