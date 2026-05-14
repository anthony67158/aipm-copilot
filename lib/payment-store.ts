import { prisma } from "@/lib/prisma";
import { FULL_REPORT_PRODUCT_CODE, FULL_REPORT_PRODUCT_CODES } from "@/lib/product-codes";
import type { Pagination, PaymentOrder, PaymentOrderId } from "@/types/api";

const SINGLE_REPORT_PRICE = 660;

const createId = <T extends string>(prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}` as T;

function mapPaymentOrder(record: {
  id: string;
  userId: string;
  sessionId: string | null;
  productCode: string;
  productName: string;
  currency: string;
  amountTotal: number;
  amountPaid: number;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PaymentOrder {
  return {
    id: record.id as PaymentOrderId,
    userId: record.userId as PaymentOrder["userId"],
    sessionId: record.sessionId as PaymentOrder["sessionId"],
    productCode: record.productCode as PaymentOrder["productCode"],
    productName: record.productName,
    currency: record.currency as PaymentOrder["currency"],
    amountTotal: record.amountTotal,
    amountPaid: record.amountPaid,
    status: record.status as PaymentOrder["status"],
    paidAt: record.paidAt ? record.paidAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const paymentStore = {
  async createPaidOrder(userId: string, sessionId: string) {
    const existing = await prisma.paymentOrder.findFirst({
      where: { userId, sessionId, productCode: { in: FULL_REPORT_PRODUCT_CODES }, status: "PAID" },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return mapPaymentOrder(existing);
    }

    const order = await prisma.paymentOrder.create({
      data: {
        id: createId<PaymentOrderId>("po"),
        userId,
        sessionId,
        productCode: FULL_REPORT_PRODUCT_CODE,
        productName: "岗位求职产物包",
        currency: "CNY",
        amountTotal: SINGLE_REPORT_PRICE,
        amountPaid: SINGLE_REPORT_PRICE,
        status: "PAID",
        paidAt: new Date(),
      },
    });

    return mapPaymentOrder(order);
  },

  async getOrder(orderId: string, userId: string) {
    const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) return null;
    return mapPaymentOrder(order);
  },

  async listOrders(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, totalItems] = await Promise.all([
      prisma.paymentOrder.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.paymentOrder.count({ where: { userId } }),
    ]);

    const pagination: Pagination = {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    };

    return {
      items: items.map(mapPaymentOrder),
      pagination,
    };
  },

  async hasPaidSession(userId: string, sessionId: string) {
    const count = await prisma.paymentOrder.count({
      where: { userId, sessionId, productCode: { in: FULL_REPORT_PRODUCT_CODES }, status: "PAID" },
    });
    return count > 0;
  },

  async claimPaidSessions(userId: string, sessionIds: string[]) {
    const uniqueSessionIds = Array.from(new Set(sessionIds.filter(Boolean)));
    if (uniqueSessionIds.length === 0) return [];

    const orders = [];
    for (const sessionId of uniqueSessionIds) {
      orders.push(await this.createPaidOrder(userId, sessionId));
    }
    return orders;
  },
};
