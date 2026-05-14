"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GenerationActivity } from "@/components/generation-activity";
import type {
  DiagnosisRisk,
  GenerationProgressEvent,
  GetAnalysisSessionResponse,
  GetDiagnosisResponse,
} from "@/types/api";

type GenerationTraceItem = {
  id: string;
  message: string;
  progress?: number;
  status: "running" | "done" | "error";
  timestamp: number;
};

async function readGenerationStream(response: Response, onTrace: (event: GenerationProgressEvent) => void) {
  if (!response.body) {
    const payload = await response.json();
    if (!payload.success) throw new Error(payload.error?.message ?? "生成失败，请重试");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      const event = JSON.parse(dataLine.replace(/^data:\s*/, "")) as GenerationProgressEvent;
      onTrace(event);
      if (event.type === "done") {
        const payload = event.data as { success?: boolean; error?: { message?: string } } | undefined;
        if (!payload?.success) throw new Error(payload?.error?.message ?? "生成失败，请重试");
        receivedDone = true;
      }
      if (event.type === "error") {
        throw new Error(event.message || "生成失败，请重试");
      }
    }
  }

  if (!receivedDone) throw new Error("生成结果为空，请重试");
}

export function AnalyzeClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rewriting, setRewriting] = useState(false);
  const [diagnosis, setDiagnosis] = useState<GetDiagnosisResponse | null>(null);
  const [session, setSession] = useState<GetAnalysisSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generationTraces, setGenerationTraces] = useState<GenerationTraceItem[]>([]);

  const pushGenerationTrace = (item: Omit<GenerationTraceItem, "id" | "timestamp">) => {
    setGenerationTraces((prev) => [{
      ...item,
      id: `rewrite-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    }, ...prev].slice(0, 8));
  };

  useEffect(() => {
    const run = async () => {
      try {
        const [sessionRes, diagnosisRes] = await Promise.all([
          fetch(`/api/v1/analysis-sessions/${sessionId}`),
          fetch(`/api/v1/analysis-sessions/${sessionId}/diagnosis`),
        ]);
        const sessionPayload = await sessionRes.json();
        const diagnosisPayload = await diagnosisRes.json();

        if (!sessionRes.ok || !sessionPayload.success) {
          throw new Error(sessionPayload.error?.message ?? "获取会话失败");
        }
        if (!diagnosisRes.ok || !diagnosisPayload.success) {
          throw new Error(diagnosisPayload.error?.message ?? "获取诊断失败");
        }

        setSession(sessionPayload.data as GetAnalysisSessionResponse);
        setDiagnosis(diagnosisPayload.data as GetDiagnosisResponse);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "加载失败");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [sessionId]);

  const handleRewrite = async () => {
    setRewriting(true);
    setError(null);
    pushGenerationTrace({
      message: "正在准备岗位定制生成任务",
      progress: 1,
      status: "running",
    });
    try {
      const response = await fetch(`/api/v1/analysis-sessions/${sessionId}/rewrite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          rewriteMode: "aggressive_fact_bound",
        }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error?.message ?? "生成改写结果失败");
      }
      await readGenerationStream(response, (event) => {
        if (event.type !== "progress" && event.type !== "done" && event.type !== "error") return;
        pushGenerationTrace({
          message: event.message || (event.type === "done" ? "生成完成" : "生成失败"),
          progress: event.progress,
          status: event.type === "done" ? "done" : event.type === "error" ? "error" : "running",
        });
      });
      router.push(`/rewrite/${sessionId}`);
    } catch (rewriteError) {
      pushGenerationTrace({
        message: rewriteError instanceof Error ? rewriteError.message : "操作失败",
        status: "error",
      });
      setError(rewriteError instanceof Error ? rewriteError.message : "操作失败");
    } finally {
      setRewriting(false);
    }
  };

  if (loading) {
    return <div className="rounded-[28px] border border-slate-200 bg-white/90 p-8 text-sm text-slate-500">正在生成诊断结果...</div>;
  }

  if (error || !diagnosis || !session) {
    return (
      <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700">
        {error ?? "未找到分析结果"}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[24px] border border-slate-200 bg-white/90 p-5 sm:rounded-[28px] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm font-medium text-blue-700">诊断结果</div>
            <h1 className="mt-3 text-[26px] font-semibold leading-9 tracking-tight text-slate-950 sm:text-3xl">你的简历和岗位之间，还差这几步。</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{diagnosis.summary}</p>
          </div>
          <div className="rounded-[22px] bg-slate-950 px-5 py-4 text-white sm:rounded-[24px] sm:px-6 sm:py-5">
            <div className="text-sm text-slate-400">匹配得分</div>
            <div className="mt-2 text-4xl font-semibold sm:text-5xl">{diagnosis.matchScore}</div>
            <div className="mt-2 text-sm text-slate-300">当前状态：{session.status}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr_0.9fr]">
        <Card title="已命中关键词" accent="text-emerald-700">
          <KeywordList items={diagnosis.matchedKeywords} emptyText="还没有明显命中的关键词" variant="success" />
        </Card>
        <Card title="缺失关键词" accent="text-amber-700">
          <KeywordList items={diagnosis.missingKeywords} emptyText="当前没有高优先级缺失项" variant="warning" />
        </Card>
        <Card title="建议优先级" accent="text-slate-700">
          <ol className="space-y-3 text-sm leading-7 text-slate-600">
            {diagnosis.recommendations.map((item, index) => (
              <li key={item} className="flex gap-3">
                <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs text-white">
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <Card title="主要风险项" accent="text-rose-700">
        <div className="grid gap-4 md:grid-cols-2">
          {diagnosis.risks.map((risk) => (
            <div key={`${risk.type}-${risk.message}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{formatRiskType(risk)}</div>
              <p className="mt-3 text-sm leading-7 text-slate-700">{risk.message}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white/90 p-5 sm:rounded-[28px] sm:p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-medium text-slate-900">下一步建议</div>
          <div className="mt-1 text-sm text-slate-500">继续生成岗位定制改写结果，查看逐段调整内容和修改原因。</div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/copilot" className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            返回求职教练
          </Link>
          <button onClick={handleRewrite} disabled={rewriting} className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-400">
            {rewriting ? "生成中..." : "生成岗位定制版"}
          </button>
        </div>
      </div>
      <GenerationTracePanel traces={generationTraces} />
    </div>
  );
}

function GenerationTracePanel({ traces }: { traces: GenerationTraceItem[] }) {
  const latest = traces[0];

  if (!traces.length) {
    return (
      <section className="rounded-[22px] border border-dashed border-slate-300 bg-white/80 p-5">
        <div className="text-sm font-semibold text-slate-900">AI 生成过程</div>
        <div className="mt-1 text-sm leading-6 text-slate-500">点击生成后，这里只展示当前任务状态，避免历史日志干扰判断。</div>
      </section>
    );
  }

  return (
    <GenerationActivity
      title="岗位定制简历"
      description="正在结合诊断结果和岗位要求改写简历"
      message={latest.message}
      status={latest.status}
      progress={latest.progress}
      startedAt={latest.timestamp}
    />
  );
}

function Card({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white/90 p-6">
      <div className={`text-sm font-medium ${accent}`}>{title}</div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function KeywordList({ items, emptyText, variant }: { items: string[]; emptyText: string; variant: "success" | "warning" }) {
  if (items.length === 0) {
    return <div className="text-sm text-slate-500">{emptyText}</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className={`rounded-full px-3 py-1 text-sm ${
            variant === "success" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function formatRiskType(risk: DiagnosisRisk) {
  switch (risk.type) {
    case "BULLET_TOO_GENERIC":
      return "表达过泛";
    case "WEAK_QUANTIFICATION":
      return "结果不够量化";
    case "MISSING_KEYWORDS":
      return "关键词缺失";
    default:
      return "结构风险";
  }
}
