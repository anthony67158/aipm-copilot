import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { paymentStore } from "@/lib/payment-store";
import type { GetPaymentOrderResponse } from "@/types/api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "请先登录后查看订单" },
        requestId: crypto.randomUUID(),
      },
      { status: 401 }
    );
  }

  const { orderId } = await context.params;
  const order = await paymentStore.getOrder(orderId, userId);
  if (!order) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "订单不存在" },
        requestId: crypto.randomUUID(),
      },
      { status: 404 }
    );
  }

  const data: GetPaymentOrderResponse = { order };
  return NextResponse.json({ success: true, data, requestId: crypto.randomUUID() });
}
