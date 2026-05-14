"use client";

import { useMemo, useState } from "react";
import type { DecisionReport, DimensionAnalysis } from "@/types/api";

type DimensionSortMode = "gap" | "original" | "score";

interface DecisionReportViewProps {
  report: DecisionReport;
  jobTitle?: string;
}

export function DecisionReportView({ report, jobTitle }: DecisionReportViewProps) {
  const [copied, setCopied] = useState(false);
  const recommendationTone = getRecommendationTone(report.recommendation);
  const sortedDimensions = useMemo(
    () => sortDimensions(report.dimensions, "gap"),
    [report.dimensions],
  );
  const topDetailDimensions = sortedDimensions.slice(0, 3);
  const metDimensions = useMemo(
    () => sortedDimensions.filter((dim) => dim.gap === "met"),
    [sortedDimensions],
  );
  const gapDimensions = useMemo(
    () => sortedDimensions.filter((dim) => dim.gap !== "met"),
    [sortedDimensions],
  );
  const heroSummary =
    report.overallMatchScore >= 70
      ? "这份岗位可以优先准备投递"
      : report.overallMatchScore >= 50
        ? "这份岗位可以冲，但要先补齐关键能力"
        : "先别急着投，补齐短板后胜率更高";

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="aipm-page max-w-[1200px] space-y-5 sm:space-y-8">
      <header className={`overflow-hidden rounded-[24px] border border-[#e2e8f0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.08)] sm:rounded-[30px] ${recommendationTone.card}`}>
        <div className="grid gap-0 xl:grid-cols-[minmax(0,0.92fr)_minmax(520px,1.08fr)]">
          <div className="flex flex-col justify-between p-5 sm:p-[31px]">
            <div>
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${recommendationTone.badge}`}>
                  <StatusGlyph recommendation={report.recommendation} className="h-4 w-4" />
                  {report.recommendationLabel}
                </div>
                <button
                  onClick={handleCopyLink}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-[#e2e8f0] bg-white px-4 py-2 text-sm font-medium text-slate-600 transition duration-200 hover:-translate-y-0.5 hover:bg-white active:scale-[0.99] sm:w-auto"
                >
                  {copied ? "已复制链接" : "复制链接"}
                </button>
              </div>
              <div className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">AIPM Copilot Report</div>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl md:leading-[1.08]">
                {heroSummary}
              </h1>
              {jobTitle ? <p className="mt-4 text-base font-medium text-slate-500">目标岗位：{jobTitle}</p> : null}
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-700 md:text-lg">
                {report.oneLiner}
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[20px] border border-[#e2e8f0] bg-white p-4 sm:rounded-[24px] sm:p-5">
                  <div className="text-sm font-semibold text-slate-500">匹配分</div>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl">{report.overallMatchScore}</span>
                    <span className="pb-1 text-sm font-medium text-slate-400">/100</span>
                  </div>
                  <div className="mt-3 h-2.5 rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${recommendationTone.progress}`}
                      style={{ width: `${Math.min(Math.max(report.overallMatchScore, 0), 100)}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#e2e8f0] bg-white p-4 sm:rounded-[24px] sm:p-5">
                  <div className="text-sm font-semibold text-slate-500">已达标</div>
                  <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl">
                    {report.dimensions.filter((dim) => dim.gap === "met").length}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">个能力项可作为简历亮点</p>
                </div>
                <div className="rounded-[20px] border border-[#e2e8f0] bg-white p-4 sm:rounded-[24px] sm:p-5">
                  <div className="text-sm font-semibold text-slate-500">需优先补齐</div>
                  <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl">
                    {report.dimensions.filter((dim) => dim.gap === "insufficient").length}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">个能力项影响投递胜率</p>
                </div>
              </div>

              <div className="mt-7 space-y-3">
                <div className="text-sm font-semibold text-slate-500">判断依据</div>
                {getHeroReasons(report, sortedDimensions).map((reason, index) => (
                  <div key={reason} className="flex gap-3 rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xs font-semibold text-white">{index + 1}</span>
                    <p className="text-base leading-7 text-slate-700">{reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-[#e2e8f0] bg-[#f8fafc] p-4 md:p-6 lg:p-8 xl:border-l xl:border-t-0">
            <div className="grid h-full gap-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[28px] border border-[#dcfce7] bg-[#f0fdf4] p-5">
                  <div className="text-sm font-semibold text-[#166534]">已达标能力</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {metDimensions.length > 0 ? metDimensions.map((dim) => (
                      <span key={dim.dimensionId} className="rounded-full border border-[#bbf7d0] bg-white px-3 py-1.5 text-sm font-semibold text-[#166534]">
                        {dim.dimensionLabel}
                      </span>
                    )) : (
                      <p className="text-base leading-7 text-[#166534]">当前还没有明确达标项，先补关键证据再重新判断。</p>
                    )}
                  </div>
                </div>

                <div className="rounded-[28px] border border-[#e2e8f0] bg-white p-5">
                  <div className="text-sm font-semibold text-slate-700">还需补齐</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {gapDimensions.length > 0 ? gapDimensions.map((dim) => (
                      <span key={dim.dimensionId} className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1.5 text-sm font-semibold text-[#475569]">
                        {dim.dimensionLabel}
                      </span>
                    )) : (
                      <p className="text-base leading-7 text-slate-600">当前核心能力已基本达标，可以直接进入简历和面试准备。</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-[#e2e8f0] bg-white p-5">
                <div className="text-sm font-semibold text-slate-700">优先处理</div>
                <div className="mt-3 space-y-3">
                  {(gapDimensions.length ? gapDimensions : sortedDimensions).slice(0, 3).map((dim) => (
                    <div key={dim.dimensionId} className="rounded-2xl border border-slate-100 bg-[#f8fafc] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-base font-semibold text-slate-900">{dim.dimensionLabel}</span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getDimensionTone(dim.gap).badge}`}>{getDimensionTone(dim.gap).label}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {dim.gap === "met" ? "作为优势前置到简历核心经历里。" : "先补一条可验证证据，再进入简历改写或面试准备。"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="rounded-[24px] border border-[#e2e8f0] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)] sm:rounded-[32px] sm:p-[31px]">
        <h2 className="text-xl font-semibold text-slate-800">维度详情与补齐建议</h2>
        <p className="mt-1 text-base leading-7 text-slate-500">先处理影响最大的能力项，再根据需要查看其他维度。</p>
        <div className="mt-5 space-y-3">
          {sortedDimensions.map((dim, index) => (
            <details
              key={dim.dimensionId}
              open={index < 3}
              className="group rounded-[20px] border border-slate-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm sm:rounded-[24px]"
            >
              <summary className="flex cursor-pointer flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${getDimensionTone(dim.gap).iconWrap}`}>
                    <GapGlyph gap={dim.gap} className="h-5 w-5" />
                  </span>
                  <div>
                    <span className="block font-medium text-slate-800">{dim.dimensionLabel}</span>
                    <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-sm font-semibold ${getDimensionTone(dim.gap).badge}`}>
                      {getDimensionTone(dim.gap).label}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500">要求 L{dim.requiredLevel} / 现状 L{dim.currentLevel}</span>
                  <svg className="h-4 w-4 text-slate-400 transition group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </summary>
              <div className="space-y-3 border-t border-slate-100 px-5 py-4">
                <p className="text-base leading-8 text-slate-600">{dim.evidence}</p>
                {dim.remedyActions.length > 0 && (
                  <div className="space-y-2">
                    {dim.remedyActions.map((action, i) => (
                      <div key={i} className="flex items-start gap-2 text-base leading-7 text-indigo-700">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                          <BulletGlyph className="h-3.5 w-3.5" />
                        </span>
                        <span>{action}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-[#f8fafc] px-4 py-3 text-sm text-slate-500">
          已优先展开 {topDetailDimensions.length} 个关键维度，其他维度可继续查看。
        </div>
      </section>

      <footer className="border-t border-slate-200 pt-6 text-center text-sm text-slate-400">
        AIPM Copilot · AI 产品经理求职教练 · 报告仅供参考
      </footer>
    </div>
  );
}

function getRecommendationTone(recommendation: DecisionReport["recommendation"]) {
  if (recommendation === "recommended") {
    return {
      card: "",
      badge: "border-[#bbf7d0] bg-[#ecfdf5] text-[#0f766e]",
      iconWrap: "bg-[#ecfdf5] text-[#0f766e]",
      progress: "bg-[#0f766e]",
    };
  }
  if (recommendation === "cautious") {
    return {
      card: "",
      badge: "border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]",
      iconWrap: "bg-[#f8fafc] text-[#64748b]",
      progress: "bg-[#64748b]",
    };
  }
  return {
    card: "",
    badge: "border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]",
    iconWrap: "bg-[#f8fafc] text-[#64748b]",
    progress: "bg-[#e11d48]",
  };
}

function getDimensionTone(gap: DimensionAnalysis["gap"]) {
  if (gap === "met") {
    return {
      label: "已达标",
      badge: "border-[#bbf7d0] bg-[#ecfdf5] text-[#0f766e]",
      iconWrap: "bg-[#ecfdf5] text-[#0f766e]",
    };
  }
  if (gap === "close") {
    return {
      label: "接近达标",
      badge: "border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]",
      iconWrap: "bg-[#f8fafc] text-[#64748b]",
    };
  }
  return {
    label: "差距明显",
    badge: "border-[#fecdd3] bg-[#fff1f2] text-[#e11d48]",
    iconWrap: "bg-[#fff1f2] text-[#e11d48]",
  };
}

function getDimensionScore(currentLevel: number, requiredLevel: number) {
  if (requiredLevel <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((currentLevel / requiredLevel) * 100)));
}

function getHeroReasons(report: DecisionReport, sortedDimensions: DimensionAnalysis[]) {
  const insufficientCount = report.dimensions.filter((dim) => dim.gap === "insufficient").length;
  const closeCount = report.dimensions.filter((dim) => dim.gap === "close").length;
  const strongest = report.dimensions.find((dim) => dim.gap === "met");
  const weakest = sortedDimensions.find((dim) => dim.gap !== "met") ?? sortedDimensions[0];

  return [
    insufficientCount > 0 ? `${insufficientCount} 个能力项会影响投递成功率` : "没有明显硬伤，可以优先准备投递材料",
    weakest ? `最需要先补的是「${weakest.dimensionLabel}」` : "当前能力结构相对均衡",
    strongest ? `优势项是「${strongest.dimensionLabel}」，适合放到简历前半部分` : `${closeCount} 个维度接近达标，短期补齐空间明确`,
  ].slice(0, 3);
}

function sortDimensions(dimensions: DimensionAnalysis[], mode: DimensionSortMode) {
  if (mode === "original") {
    return [...dimensions];
  }

  if (mode === "score") {
    return [...dimensions].sort((a, b) => {
      const scoreDiff = getDimensionScore(b.currentLevel, b.requiredLevel) - getDimensionScore(a.currentLevel, a.requiredLevel);
      if (scoreDiff !== 0) return scoreDiff;
      return a.dimensionLabel.localeCompare(b.dimensionLabel, "zh-CN");
    });
  }

  const gapPriority: Record<DimensionAnalysis["gap"], number> = {
    insufficient: 0,
    close: 1,
    met: 2,
  };

  return [...dimensions].sort((a, b) => {
    const gapDiff = gapPriority[a.gap] - gapPriority[b.gap];
    if (gapDiff !== 0) return gapDiff;

    const levelGapA = a.requiredLevel - a.currentLevel;
    const levelGapB = b.requiredLevel - b.currentLevel;
    if (levelGapB !== levelGapA) return levelGapB - levelGapA;

    return a.dimensionLabel.localeCompare(b.dimensionLabel, "zh-CN");
  });
}

function StatusGlyph({
  recommendation,
  className,
}: {
  recommendation: DecisionReport["recommendation"];
  className?: string;
}) {
  if (recommendation === "recommended") return <CheckGlyph className={className} />;
  if (recommendation === "cautious") return <AlertGlyph className={className} />;
  return <CloseGlyph className={className} />;
}

function GapGlyph({ gap, className }: { gap: DimensionAnalysis["gap"]; className?: string }) {
  if (gap === "met") return <CheckGlyph className={className} />;
  if (gap === "close") return <AlertGlyph className={className} />;
  return <CloseGlyph className={className} />;
}

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CloseGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function AlertGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 3.9 1.8 18.4A1.2 1.2 0 0 0 2.8 20h18.4a1.2 1.2 0 0 0 1-1.8L13.7 3.9a1.2 1.2 0 0 0-2.4 0Z" />
    </svg>
  );
}

function BulletGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="12" r="5" />
    </svg>
  );
}
