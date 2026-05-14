import { prisma } from "@/lib/prisma";
import { renderResumePdf } from "@/lib/resume-pdf-renderer";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const session = await prisma.analysisSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    return new Response("Session not found", { status: 404 });
  }

  const optimization = await prisma.optimizationResult.findUnique({ where: { sessionId } });
  if (!optimization || !optimization.fullOptimizedResumeText) {
    return new Response("No rewrite result found. Generate a rewrite first.", { status: 404 });
  }

  const rawSections = Array.isArray(optimization.optimizedSections)
    ? (optimization.optimizedSections as Array<Record<string, string>>)
    : [];

  const sections = rawSections.map((s) => ({
    sectionLabel: s.sectionLabel || s.sectionKey || "内容",
    rewrittenText: s.rewrittenText || s.optimizedText || "",
  }));

  const pdfBytes = await renderResumePdf({
    sections,
    fullText: optimization.fullOptimizedResumeText,
    originalPdfFileId: session.resumeFileUrl,
  });

  const fileName = session.jobTitle
    ? `简历-${session.jobTitle.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "")}.pdf`
    : "简历-AIPM改写版.pdf";

  return new Response(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Content-Length": String(pdfBytes.length),
    },
  });
}
