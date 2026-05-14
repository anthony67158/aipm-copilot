import { prisma } from "@/lib/prisma";
import { renderResumeDocx } from "@/lib/resume-docx-renderer";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
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

    const docxBytes = await renderResumeDocx({
      sections,
      fullText: optimization.fullOptimizedResumeText,
      jobTitle: session.jobTitle,
      targetCompany: session.targetCompany,
    });

    const baseName = session.jobTitle
      ? `简历-${session.jobTitle.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "")}`
      : "简历-AIPM改写版";
    const fileName = `${baseName}.docx`;

    return new Response(new Uint8Array(docxBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Word 生成失败";
    return new Response(JSON.stringify({ success: false, error: { message } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
