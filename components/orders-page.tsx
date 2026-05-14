"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { IconBadge, ProductIcon } from "@/components/ui/product-icons";
import type { ListPaymentOrdersResponse, PaymentOrder } from "@/types/api";

export function OrdersPage() {
  const { user, loading: authLoading, openAuth } = useAuth();
  const [items, setItems] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    const run = async () => {
      try {
        const response = await fetch("/api/v1/payments/orders?page=1&pageSize=50");
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.error?.message ?? "获取订单失败");
        }
        const data = payload.data as ListPaymentOrdersResponse;
        setItems(data.items);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "加载失败");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [authLoading, user]);

  if (authLoading) return <StateCard>正在确认登录状态...</StateCard>;

  if (!user) {
    return (
      <div className="aipm-card rounded-[32px] p-[31px]">
        <IconBadge name="order" />
        <div className="mt-5 text-[14px] font-semibold leading-5 text-[#4f46e5]">登录后查看</div>
        <h1 className="mt-2 text-[28px] font-semibold leading-9 tracking-[-0.03em] text-[#0f172a]">订单记录已与账号绑定</h1>
        <p className="mt-3 max-w-xl text-base leading-8 text-[#64748b]">登录后可查看每一次岗位求职产物包的付费记录，便于确认哪些岗位已经解锁后续生成能力。</p>
        <button onClick={() => openAuth("login")} className="aipm-btn-primary mt-6">立即登录</button>
      </div>
    );
  }

  if (loading) return <StateCard>正在读取订单记录...</StateCard>;

  if (error) return <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-base text-rose-700">{error}</div>;

  const paidCount = items.filter((item) => item.status === "PAID").length;
  const totalPaid = items.reduce((sum, item) => sum + item.amountPaid, 0);

  return (
    <div className="space-y-6">
      <section className="aipm-card rounded-[24px] p-5 sm:rounded-[32px] sm:p-[31px]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <IconBadge name="order" />
            <div>
              <div className="text-[14px] font-semibold leading-5 text-[#4f46e5]">MONETIZATION & DASHBOARD</div>
              <h1 className="mt-2 text-[28px] font-semibold leading-9 tracking-[-0.03em] text-[#0f172a] sm:text-[30px] sm:leading-10">我的订单</h1>
              <p className="mt-2 max-w-[680px] text-[16px] leading-[26px] text-[#64748b]">每条订单都对应一次岗位产物解锁。你可以回到历史记录查看免费决策，并继续生成简历、面试题和 Word 导出。</p>
            </div>
          </div>
          <Link href="/dashboard/history" className="aipm-btn-secondary w-full gap-2 lg:w-auto">
            查看历史记录
            <ProductIcon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-3 sm:gap-4">
          <SummaryCard label="订单总数" value={items.length.toString()} />
          <SummaryCard label="已支付" value={paidCount.toString()} tone="success" />
          <SummaryCard label="累计金额" value={`¥${(totalPaid / 100).toFixed(2)}`} />
        </div>
      </section>

      {items.length === 0 ? (
        <div className="aipm-card rounded-[24px] p-6 text-center sm:rounded-[28px] sm:p-10">
          <IconBadge name="order" className="mx-auto" />
          <p className="mx-auto mt-4 text-base leading-7 text-[#64748b]">还没有任何订单记录，先免费生成投递决策；需要继续产出简历和面试题时再解锁。</p>
          <Link href="/pricing" className="aipm-btn-primary mt-6">查看定价</Link>
        </div>
      ) : (
        <div className="aipm-card overflow-hidden rounded-[24px] sm:rounded-[28px]">
          <div className="hidden grid-cols-[minmax(0,1fr)_120px_120px_160px_150px] gap-4 border-b border-[#e2e8f0] bg-[#f8fafc] px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-[#94a3b8] lg:grid">
            <div>产品</div>
            <div>金额</div>
            <div>状态</div>
            <div>时间</div>
            <div className="text-right">操作</div>
          </div>
          <div className="divide-y divide-[#e2e8f0]">
            {items.map((item) => (
              <article key={item.id} className="grid gap-4 px-4 py-5 transition hover:bg-[#f8fafc] sm:px-6 lg:grid-cols-[minmax(0,1fr)_120px_120px_160px_150px] lg:items-center">
                <div className="min-w-0">
                  <h2 className="truncate text-[17px] font-semibold leading-6 text-[#0f172a]">{item.productName}</h2>
                  <p className="mt-2 truncate text-sm text-[#64748b]">订单号：{item.id}</p>
                  {item.paidAt ? <p className="mt-1 text-sm text-[#94a3b8]">支付时间：{formatDate(item.paidAt)}</p> : null}
                </div>
                <div className="text-xl font-semibold tracking-[-0.03em] text-[#0f172a]">¥{(item.amountPaid / 100).toFixed(2)}</div>
                <OrderStatus status={item.status} />
                <time className="text-sm leading-6 text-[#64748b]">创建时间：{formatDate(item.createdAt)}</time>
                <div className="flex lg:justify-end">
                  <Link href="/dashboard/history" className="aipm-btn-secondary min-h-11 w-full gap-2 px-4 py-2.5 lg:w-auto">
                    查看报告
                    <ProductIcon name="arrow-right" className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StateCard({ children }: { children: React.ReactNode }) {
  return <div className="aipm-card rounded-[28px] p-8 text-base text-[#64748b]">{children}</div>;
}

function SummaryCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" }) {
  return (
    <div className={`rounded-[20px] border p-5 ${tone === "success" ? "border-[#bbf7d0] bg-[#ecfdf5]" : "border-[#e2e8f0] bg-[#f8fafc]"}`}>
      <div className="text-sm font-semibold text-[#64748b]">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tracking-[-0.05em] ${tone === "success" ? "text-[#0f766e]" : "text-[#0f172a]"}`}>{value}</div>
    </div>
  );
}

function OrderStatus({ status }: { status: PaymentOrder["status"] }) {
  const isPaid = status === "PAID";
  return (
    <span className={`inline-flex w-fit rounded-full border px-3 py-1.5 text-xs font-bold ${isPaid ? "border-[#bbf7d0] bg-[#ecfdf5] text-[#0f766e]" : "border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]"}`}>
      {status}
    </span>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
