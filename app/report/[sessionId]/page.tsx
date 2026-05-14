import { notFound } from "next/navigation";
import { analysisStore } from "@/lib/analysis-store";
import { DecisionReportView } from "@/components/report/decision-report-view";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ sessionId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sessionId } = await params;
  return {
    title: `投递决策报告 · ${sessionId.slice(0, 8)} | AIPM Copilot`,
  };
}

export default async function ReportPage({ params }: Props) {
  const { sessionId } = await params;

  const report = await analysisStore.getDecisionReport(sessionId);
  if (!report) {
    notFound();
  }

  const session = await analysisStore.getSession(sessionId);
  const jobTitle = session?.jobTitle ?? undefined;

  return <DecisionReportView report={report} jobTitle={jobTitle} />;
}
