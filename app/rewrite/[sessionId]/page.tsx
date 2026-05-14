import { ResultClient } from "@/components/result-client";

export default async function RewritePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <div className="aipm-page aipm-page--narrow">
      <ResultClient sessionId={sessionId} />
    </div>
  );
}
