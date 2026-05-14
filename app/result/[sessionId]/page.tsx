import { redirect } from "next/navigation";

// Legacy compatibility page.
// New code should link to /rewrite/[sessionId].
export default async function ResultPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  redirect(`/rewrite/${sessionId}`);
}
