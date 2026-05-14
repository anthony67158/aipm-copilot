import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { paymentStore } from "@/lib/payment-store";
import { isFullReportProductCode } from "@/lib/product-codes";
import type { CreatePaymentOrderRequest, CreatePaymentOrderResponse, ListPaymentOrdersResponse } from "@/types/api";

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "请先登录后再支付" },
        requestId: crypto.randomUUID(),
      },
      { status: 401 }
    );
  }

  const body = (await request.json()) as Partial<CreatePaymentOrderRequest>;
  if (!body.sessionId || !isFullReportProductCode(body.productCode)) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "仅支持当前岗位的求职产物包支付" },
        requestId: crypto.randomUUID(),
      },
      { status: 422 }
    );
  }

  const order = await paymentStore.createPaidOrder(userId, body.sessionId);
  const data: CreatePaymentOrderResponse = {
    orderId: order.id,
    status: order.status,
  };
  return NextResponse.json({ success: true, data, requestId: crypto.randomUUID() });
}

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Number(searchParams.get("pageSize") || "20");
  const data: ListPaymentOrdersResponse = await paymentStore.listOrders(userId, page, pageSize);
  return NextResponse.json({ success: true, data, requestId: crypto.randomUUID() });
}
