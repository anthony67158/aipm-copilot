import { AnalyzeClient } from "@/components/analyze-client";

export default async function AnalyzePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <AnalyzeClient sessionId={sessionId} />
    </div>
  );
}
