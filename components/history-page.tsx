"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { IconBadge, ProductIcon } from "@/components/ui/product-icons";
import type { ListReportHistoryResponse, ListResumeVersionsResponse, ReportHistoryItem, ResumeVersion } from "@/types/api";

export function HistoryPage() {
  const { user, loading: authLoading, openAuth } = useAuth();
  const [activeTab, setActiveTab] = useState<"reports" | "versions">("reports");
  const [reportItems, setReportItems] = useState<ReportHistoryItem[]>([]);
  const [versionItems, setVersionItems] = useState<ResumeVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    const run = async () => {
      try {
        const [reportRes, versionRes] = await Promise.all([
          fetch("/api/v1/reports?page=1&pageSize=20"),
          fetch("/api/v1/resume-versions?page=1&pageSize=20"),
        ]);

        const [reportPayload, versionPayload] = await Promise.all([
          reportRes.json(),
          versionRes.json(),
        ]);

        if (!reportRes.ok || !reportPayload.success) {
          throw new Error(reportPayload.error?.message ?? "获取报告记录失败");
        }
        if (!versionRes.ok || !versionPayload.success) {
          throw new Error(versionPayload.error?.message ?? "获取简历版本失败");
        }

        setReportItems((reportPayload.data as ListReportHistoryResponse).items);
        setVersionItems((versionPayload.data as ListResumeVersionsResponse).items);
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
      <LoginCard
        icon="history"
        eyebrow="登录后查看"
        title="历史记录已与账号绑定"
        description="登录后可查看你保存过的决策报告、简历版本和导出记录。匿名生成后归档到账号下的报告也会出现在这里。"
        onLogin={() => openAuth("login")}
      />
    );
  }

  if (loading) return <StateCard>正在读取历史记录...</StateCard>;

  if (error) {
    return <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-base text-rose-700">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <section className="aipm-card rounded-[24px] p-5 sm:rounded-[32px] sm:p-[31px]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <IconBadge name="history" />
            <div>
              <div className="text-[14px] font-semibold leading-5 text-[#4f46e5]">MONETIZATION & DASHBOARD</div>
              <h1 className="mt-2 text-[28px] font-semibold leading-9 tracking-[-0.03em] text-[#0f172a] sm:text-[30px] sm:leading-10">历史记录</h1>
              <p className="mt-2 max-w-[720px] text-[16px] leading-[26px] text-[#64748b]">集中管理你已经生成的免费投递决策和岗位求职产物，方便回看判断依据、继续改写或下载 Word。</p>
            </div>
          </div>
          <Link href="/copilot" className="aipm-btn-primary w-full gap-2 lg:w-auto">
            新建一份报告
            <ProductIcon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid gap-2 rounded-[20px] border border-[#e2e8f0] bg-[#f8fafc] p-2 sm:mt-8 sm:inline-grid sm:grid-cols-2 sm:gap-3">
          <button
            onClick={() => setActiveTab("reports")}
            className={`rounded-[15px] px-5 py-3 text-sm font-semibold transition ${activeTab === "reports" ? "bg-white text-[#0f172a] shadow-[0_8px_22px_rgba(15,23,42,0.08)]" : "text-[#64748b] hover:bg-white/70"}`}
          >
            报告记录 ({reportItems.length})
          </button>
          <button
            onClick={() => setActiveTab("versions")}
            className={`rounded-[15px] px-5 py-3 text-sm font-semibold transition ${activeTab === "versions" ? "bg-white text-[#0f172a] shadow-[0_8px_22px_rgba(15,23,42,0.08)]" : "text-[#64748b] hover:bg-white/70"}`}
          >
            简历版本 ({versionItems.length})
          </button>
        </div>
      </section>

      {activeTab === "reports" ? (
        reportItems.length === 0 ? (
          <EmptyCard icon="document" text="还没有归档过任何报告，先去生成一份投递决策报告吧。" />
        ) : (
          <div className="aipm-card overflow-hidden rounded-[24px] sm:rounded-[28px]">
            <div className="hidden grid-cols-[minmax(0,1.35fr)_120px_120px_150px_150px] gap-4 border-b border-[#e2e8f0] bg-[#f8fafc] px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-[#94a3b8] lg:grid">
              <div>岗位 / 判断</div>
              <div>匹配分</div>
              <div>产物状态</div>
              <div>创建时间</div>
              <div className="text-right">操作</div>
            </div>
            <div className="divide-y divide-[#e2e8f0]">
              {reportItems.map((item) => (
                <article key={item.sessionId} className="grid gap-4 px-4 py-5 transition hover:bg-[#f8fafc] sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_120px_120px_150px_150px] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[17px] font-semibold leading-6 text-[#0f172a]">{item.jobTitle ?? "未命名岗位"}</h2>
                      {item.targetCompany ? <span className="rounded-full border border-[#e2e8f0] bg-white px-2.5 py-1 text-xs font-medium text-[#64748b]">{item.targetCompany}</span> : null}
                    </div>
                    {item.recommendationLabel ? <p className="mt-2 text-sm font-semibold text-[#4f46e5]">{item.recommendationLabel}</p> : null}
                    {item.oneLiner ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#64748b]">{item.oneLiner}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-[#64748b]">
                      <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1">面试题 {item.interviewQuestionCount}</span>
                      <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1">简历改写 {item.hasRewrite ? "已生成" : "未生成"}</span>
                    </div>
                  </div>
                  <Metric value={item.overallMatchScore ?? "--"} suffix={item.overallMatchScore == null ? "" : "/100"} />
                  <StatusPill paid={item.isPaid} />
                  <time className="text-sm leading-6 text-[#64748b]">创建时间：{formatDate(item.createdAt)}</time>
                  <div className="flex flex-col gap-2">
                    <Link href={`/report/${item.sessionId}`} className="aipm-btn-secondary min-h-11 w-full px-4 py-2.5">查看报告</Link>
                    <Link href="/copilot" className="aipm-btn-primary min-h-11 w-full px-4 py-2.5">继续处理</Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )
      ) : versionItems.length === 0 ? (
        <EmptyCard icon="edit" text="还没有保存过任何简历版本，先去生成一份岗位定制改写吧。" />
      ) : (
        <div className="grid gap-4">
          {versionItems.map((item) => (
            <article key={item.id} className="aipm-card rounded-[24px] p-5 sm:rounded-[28px] sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[17px] font-semibold leading-6 text-[#0f172a]">{item.title}</h2>
                    <span className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-xs font-medium text-[#64748b]">{item.sourceType}</span>
                  </div>
                  <div className="mt-2 text-sm text-[#64748b]">岗位：{item.jobTitle ?? "未命名岗位"} · {formatDate(item.createdAt)}</div>
                  <pre className="mt-4 max-h-52 overflow-auto whitespace-pre-wrap rounded-[18px] border border-[#e2e8f0] bg-[#f8fafc] p-4 text-sm leading-7 text-[#334155]">{item.resumeText}</pre>
                </div>
                <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row">
                  <button onClick={() => navigator.clipboard.writeText(item.resumeText)} className="aipm-btn-secondary min-h-11 w-full px-4 py-2.5 sm:w-auto">复制文本</button>
                  <ExportButton sessionId={item.sessionId} />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StateCard({ children }: { children: React.ReactNode }) {
  return <div className="aipm-card rounded-[28px] p-8 text-base text-[#64748b]">{children}</div>;
}

function LoginCard({ icon, eyebrow, title, description, onLogin }: { icon: "history" | "order"; eyebrow: string; title: string; description: string; onLogin: () => void }) {
  return (
    <div className="aipm-card rounded-[32px] p-[31px]">
      <IconBadge name={icon} />
      <div className="mt-5 text-[14px] font-semibold leading-5 text-[#4f46e5]">{eyebrow}</div>
      <h1 className="mt-2 text-[28px] font-semibold leading-9 tracking-[-0.03em] text-[#0f172a]">{title}</h1>
      <p className="mt-3 max-w-xl text-base leading-8 text-[#64748b]">{description}</p>
      <button onClick={onLogin} className="aipm-btn-primary mt-6">立即登录</button>
    </div>
  );
}

function EmptyCard({ icon, text }: { icon: "document" | "edit"; text: string }) {
  return (
    <div className="aipm-card rounded-[28px] p-10 text-center">
      <IconBadge name={icon} className="mx-auto" />
      <p className="mx-auto mt-4 text-base leading-7 text-[#64748b]">{text}</p>
      <Link href="/copilot" className="aipm-btn-primary mt-6">开始生成</Link>
    </div>
  );
}

function Metric({ value, suffix }: { value: number | string; suffix?: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tracking-[-0.04em] text-[#0f172a]">{value}<span className="ml-1 text-sm font-medium text-[#94a3b8]">{suffix}</span></div>
    </div>
  );
}

function StatusPill({ paid }: { paid: boolean }) {
  return paid ? (
    <span className="inline-flex w-fit rounded-full border border-[#bbf7d0] bg-[#ecfdf5] px-3 py-1.5 text-xs font-bold text-[#0f766e]">产物已解锁</span>
  ) : (
    <span className="inline-flex w-fit rounded-full border border-[#fde68a] bg-[#fffbeb] px-3 py-1.5 text-xs font-bold text-[#d97706]">决策免费</span>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ExportButton({ sessionId }: { sessionId: string }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      window.open(`/api/v1/analysis-sessions/${sessionId}/export-resume-docx`, "_blank");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleExport} disabled={loading} className="aipm-btn-primary min-h-11 w-full px-4 py-2.5 disabled:bg-[#94a3b8] sm:w-auto">
      {loading ? "生成中..." : "下载 Word"}
    </button>
  );
}
