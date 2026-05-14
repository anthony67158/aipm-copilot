"use client";

import { useEffect, useMemo, useState } from "react";

type GenerationActivityStatus = "running" | "done" | "error";

type GenerationActivityProps = {
  title: string;
  description?: string;
  message?: string;
  status: GenerationActivityStatus;
  progress?: number;
  startedAt?: number;
  className?: string;
  onStop?: () => void;
};

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

export function GenerationActivity({
  title,
  description,
  message,
  status,
  progress,
  startedAt,
  className = "",
  onStop,
}: GenerationActivityProps) {
  const [now, setNow] = useState(startedAt ?? 0);
  const isRunning = status === "running";
  const safeProgress = typeof progress === "number" ? Math.max(0, Math.min(100, Math.round(progress))) : undefined;
  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, startedAt]);

  const activitySteps = useMemo(() => {
    if (status === "done") return ["结果已更新", "可继续操作", "已完成"];
    if (status === "error") return ["生成中断", "请重试", "保留输入"];
    return ["连接模型", "理解材料", "生成内容"];
  }, [status]);

  const activeStep = isRunning ? Math.floor(elapsedSeconds / 2) % activitySteps.length : activitySteps.length - 1;
  const statusLabel = status === "done" ? "已完成" : status === "error" ? "异常" : "生成中";
  const waitingHint = isRunning && elapsedSeconds >= 8
    ? "模型还在处理，结果返回后会自动更新，请保持页面打开。"
    : description;

  return (
    <div className={`rounded-[22px] border border-[#e2e8f0] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)] ${className}`} aria-live="polite">
      <div className="relative overflow-hidden rounded-[22px]">
        {isRunning ? <div className="aipm-activity-scan" aria-hidden="true" /> : null}
        <div className="relative flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="relative mt-0.5 h-12 w-12 shrink-0" aria-hidden="true">
              {isRunning ? (
                <>
                  <span className="aipm-activity-ring" />
                  <span className="aipm-activity-ring aipm-activity-ring--delay" />
                </>
              ) : null}
              <span
                className={`relative flex h-12 w-12 items-center justify-center rounded-full border ${
                  status === "done"
                    ? "border-[#bbf7d0] bg-[#ecfdf5]"
                    : status === "error"
                      ? "border-[#fecdd3] bg-[#fff1f2]"
                      : "border-[#c7d2fe] bg-[#eef2ff]"
                }`}
              >
                <span
                  className={`h-3 w-3 rounded-full ${
                    status === "done"
                      ? "bg-[#0f766e]"
                      : status === "error"
                        ? "bg-[#e11d48]"
                        : "aipm-activity-dot bg-[#4f46e5]"
                  }`}
                />
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold leading-5 text-[#0f172a]">AI 生成过程</div>
              <div className="mt-1 text-[16px] font-semibold leading-6 text-[#0f172a]">{title}</div>
              <div className="mt-1 break-words text-[13px] leading-5 text-[#64748b]">{message || description}</div>
              {waitingHint ? <div className="mt-2 text-[12px] leading-5 text-[#94a3b8]">{waitingHint}</div> : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
            <div className="flex items-center gap-2">
              {!isRunning ? (
                <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-[12px] font-semibold ${
                  status === "done"
                    ? "bg-[#ecfdf5] text-[#0f766e]"
                    : "bg-[#fff1f2] text-[#e11d48]"
                }`}>
                  {statusLabel}
                </span>
              ) : null}
              {isRunning && onStop ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="aipm-stop-button group relative inline-flex h-8 items-center justify-center overflow-hidden rounded-full border border-[#fecdd3] bg-white px-3.5 text-[12px] font-semibold text-[#be123c] shadow-[0_8px_18px_rgba(225,29,72,0.12)] outline-none transition hover:-translate-y-0.5 hover:border-[#fb7185] hover:bg-[#fff1f2] hover:text-[#9f1239] hover:shadow-[0_12px_24px_rgba(225,29,72,0.18)] focus-visible:ring-4 focus-visible:ring-[#fecdd3]"
                  aria-label="停止当前生成任务"
                >
                  <span className="absolute inset-0 aipm-stop-button__glow" aria-hidden="true" />
                  <span className="relative mr-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#fecdd3] bg-[#fff1f2] transition group-hover:scale-105">
                    <span className="h-1.5 w-1.5 rounded-[2px] bg-[#e11d48]" aria-hidden="true" />
                  </span>
                  <span className="relative">停止生成</span>
                </button>
              ) : null}
            </div>
            {isRunning ? <span className="text-[11px] font-semibold leading-4 text-[#94a3b8]">已等待 {formatElapsed(elapsedSeconds)}</span> : null}
          </div>
        </div>

        {isRunning ? (
          <div className="relative px-5 pb-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-[#eef2ff]">
              {typeof safeProgress === "number" ? (
                <div className="aipm-activity-progress h-full rounded-full bg-[#4f46e5] transition-all duration-500" style={{ width: `${safeProgress}%` }} />
              ) : (
                <div className="aipm-activity-progress aipm-activity-progress--indeterminate h-full rounded-full bg-[#4f46e5]" />
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {activitySteps.map((step, index) => (
                <span
                  key={step}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-4 transition ${
                    index === activeStep
                      ? "border-[#c7d2fe] bg-[#eef2ff] text-[#4f46e5]"
                      : "border-[#e2e8f0] bg-[#f8fafc] text-[#94a3b8]"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${index === activeStep ? "aipm-activity-dot bg-[#4f46e5]" : "bg-[#cbd5e1]"}`} />
                  {step}
                </span>
              ))}
              {typeof safeProgress === "number" ? <span className="ml-auto text-[11px] font-semibold leading-6 text-[#94a3b8]">{safeProgress}%</span> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
