"use client";

import { useState } from "react";
import { ProductIcon } from "@/components/ui/product-icons";

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  onUnlock: () => Promise<void>;
}

export function PaywallModal({ open, onClose, onUnlock }: PaywallModalProps) {
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleMockPay() {
    setPaying(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 1200));
      await onUnlock();
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "支付失败，请重试");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-md sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/20 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.28)] sm:rounded-[32px]">
        <div className="bg-[linear-gradient(135deg,#111827,#4f46e5_62%,#7c3aed)] p-5 text-white sm:p-6">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="rounded-full bg-white/18 px-2.5 py-1">按次付费</span>
            <span className="rounded-full bg-white/18 px-2.5 py-1">无订阅</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">解锁本次岗位求职产物</h2>
          <p className="mt-2 text-base leading-7 text-white/86">投递决策已可查看；付一次 ¥6.6，把这次判断继续生成简历、面试题和可下载文件。</p>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black">¥6.6</span>
            <span className="text-sm text-white/70 line-through">¥29.9</span>
            <span className="ml-1 rounded-full bg-amber-300 px-2 py-0.5 text-xs font-bold text-amber-950">首发 78% OFF</span>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-4 text-sm font-semibold text-slate-800">付费后立即解锁：</div>
          <ul className="space-y-3 text-sm text-slate-700">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <ProductIcon name="check" className="h-3.5 w-3.5" />
              </span>
              <div>
                <span className="font-medium">岗位定制简历改写</span>
                <div className="mt-0.5 text-xs text-slate-500">基于当前简历、JD 和投递决策生成可编辑版本</div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <ProductIcon name="check" className="h-3.5 w-3.5" />
              </span>
              <div>
                <span className="font-medium">面试预测题生成</span>
                <div className="mt-0.5 text-xs text-slate-500">围绕 JD 要求和简历证据生成高频追问</div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <ProductIcon name="check" className="h-3.5 w-3.5" />
              </span>
              <div>
                <span className="font-medium">单题完整回答包</span>
                <div className="mt-0.5 text-xs text-slate-500">包含可复述话术、要点和容易被追问的坑</div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <ProductIcon name="check" className="h-3.5 w-3.5" />
              </span>
              <div>
                <span className="font-medium">Word 简历导出</span>
                <div className="mt-0.5 text-xs text-slate-500">将定制简历导出为可继续编辑的 .docx 文件</div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <ProductIcon name="check" className="h-3.5 w-3.5" />
              </span>
              <div>
                <span className="font-medium">历史记录继续处理</span>
                <div className="mt-0.5 text-xs text-slate-500">本次岗位已解锁后，后续回看和继续生成不重复收费</div>
              </div>
            </li>
          </ul>

          <div className="mt-6 space-y-2">
            {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
            <button
              onClick={handleMockPay}
              disabled={paying}
              className="premium-focus w-full rounded-2xl bg-[linear-gradient(135deg,#111827,#4f46e5_62%,#7c3aed)] py-3 text-sm font-bold text-white shadow-[0_16px_32px_rgba(79,70,229,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_38px_rgba(79,70,229,0.3)] disabled:opacity-50"
            >
              {paying ? "支付中..." : "立即 ¥6.6 解锁产物生成"}
            </button>
            <button
              onClick={onClose}
              className="w-full rounded-2xl py-2 text-xs text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            >
              先看免费决策
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1">
              <ProductIcon name="lock" className="h-3.5 w-3.5" />
              安全支付
            </span>
            <span>·</span>
            <span>本次岗位产物不重复收费</span>
          </div>
        </div>
      </div>
    </div>
  );
}
