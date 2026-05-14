"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import type {
  CreateResumeVersionResponse,
  GetRewriteResultResponse,
  RewriteSection,
} from "@/types/api";

export function ResultClient({ sessionId }: { sessionId: string }) {
  const { user, openAuth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savedVersionId, setSavedVersionId] = useState<string | null>(null);
  const [result, setResult] = useState<GetRewriteResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const response = await fetch(`/api/v1/analysis-sessions/${sessionId}/rewrite`);
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.error?.message ?? "获取改写结果失败");
        }
        setResult(payload.data as GetRewriteResultResponse);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "加载失败");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [sessionId]);

  const suggestedTitle = useMemo(
    () => `岗位定制简历-${new Date().toLocaleDateString()}`,
    []
  );

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.fullRewrittenText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/resume-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          title: suggestedTitle,
          rewrittenResumeText: result.fullRewrittenText,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error?.message ?? "保存版本失败");
      }
      const data = payload.data as CreateResumeVersionResponse;
      setSavedVersionId(data.version.id);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "保存失败";
      if (message.includes("请先登录")) {
        openAuth("login");
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      window.open(`/api/v1/analysis-sessions/${sessionId}/export-resume-docx`, "_blank");
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : "导出失败";
      if (message.includes("请先登录")) {
        openAuth("login");
      }
      setError(message);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="rounded-[28px] border border-slate-200 bg-white/90 p-8 text-sm text-slate-500">正在加载改写结果...</div>;
  }

  if (error && !result) {
    return <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700">{error}</div>;
  }

  if (!result) {
    return <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700">未找到改写结果</div>;
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[24px] border border-slate-200 bg-white/90 p-5 sm:rounded-[28px] sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm font-medium text-emerald-700">改写完成</div>
            <h1 className="mt-3 text-[26px] font-semibold leading-9 tracking-tight text-slate-950 sm:text-3xl">你已经得到一份更适合目标岗位的定制版本。</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">结果页支持保存版本、查看历史记录和继续导出，方便你把岗位定制产物真正带走。</p>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              事实护栏状态：{formatFactGuardStatus(result.factGuard.status)}。{result.factGuard.summary}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ScoreCard label="改写前" score={result.beforeScore ?? 0} />
            <ScoreCard label="改写后" score={result.afterScore ?? 0} highlighted />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          {result.sections.map((section) => (
            <SectionCompare key={section.sectionKey} section={section} />
          ))}
        </div>
        <aside className="space-y-6">
          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5 sm:rounded-[28px] sm:p-6">
            <div className="text-sm font-medium text-slate-900">事实护栏</div>
            <div className="mt-3 text-sm leading-7 text-slate-600">{result.factGuard.summary}</div>
            {result.factGuard.issues.length > 0 ? (
              <div className="mt-4 space-y-3">
                {result.factGuard.issues.map((issue, index) => (
                  <div key={`${issue.code}-${index}`} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="font-medium">{issue.message}</div>
                    {issue.sectionLabel ? <div className="mt-1 text-xs text-amber-800">位置：{issue.sectionLabel}</div> : null}
                    <div className="mt-2 text-xs leading-6 text-amber-800">示例：{issue.examples.join("、")}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                未检测到新增数字、专有名词、岗位称谓或行业场景漂移。
              </div>
            )}
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5 sm:rounded-[28px] sm:p-6">
            <div className="text-sm font-medium text-slate-900">完整岗位定制版</div>
            <pre className="mt-4 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-950 p-4 text-sm leading-7 text-slate-100 sm:max-h-[420px] sm:p-5">
              {result.fullRewrittenText}
            </pre>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5 sm:rounded-[28px] sm:p-6">
            <div className="text-sm font-medium text-slate-900">下一步</div>
            <div className="mt-3 text-sm leading-7 text-slate-600">
              改写内容会尽量贴合岗位要求，但不会替你新增经历。导出或投递前，建议逐条确认是否符合你的真实经历。
            </div>
            {!user ? <div className="mt-3 text-sm text-amber-700">登录后才可保存到历史记录并导出文件。</div> : null}
            {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}
            {savedVersionId ? <div className="mt-3 text-sm text-emerald-700">已保存版本，可去历史记录继续查看。</div> : null}
            <div className="mt-5 flex flex-col gap-3">
              <button onClick={handleCopy} className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800">
                {copied ? "已复制" : "复制全文"}
              </button>
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:bg-slate-100">
                {saving ? "保存中..." : savedVersionId ? "已保存版本" : "保存到历史记录"}
              </button>
              <button onClick={handleExport} disabled={exporting} className="inline-flex items-center justify-center rounded-2xl border border-blue-300 bg-blue-50 px-5 py-3 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:bg-slate-100">
                {exporting ? "导出中..." : "下载 Word"}
              </button>
              <Link href="/dashboard/history" className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                查看历史记录
              </Link>
              <Link href="/copilot" className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                再试一个岗位
              </Link>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function ScoreCard({ label, score, highlighted = false }: { label: string; score: number; highlighted?: boolean }) {
  return (
    <div className={`rounded-[24px] px-5 py-4 ${highlighted ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
      <div className="text-sm">{label}</div>
      <div className="mt-2 text-3xl font-semibold sm:text-4xl">{score}</div>
    </div>
  );
}

function SectionCompare({ section }: { section: RewriteSection }) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white/90 p-5 sm:rounded-[28px] sm:p-6">
      <div className="text-sm font-medium text-blue-700">{section.sectionLabel}</div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">原文</div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{section.originalText}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">改写后</div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-800">{section.rewrittenText}</p>
        </div>
      </div>
      <div className="mt-4 rounded-2xl bg-slate-950 px-5 py-4 text-sm leading-7 text-slate-200">
        修改原因：{section.explanation}
      </div>
    </section>
  );
}

function formatFactGuardStatus(status: GetRewriteResultResponse["factGuard"]["status"]) {
  switch (status) {
    case "passed":
      return "通过";
    case "repaired":
      return "已修复";
    case "risky":
      return "有风险";
    case "fallback":
      return "已回退";
    default:
      return "未知";
  }
}
