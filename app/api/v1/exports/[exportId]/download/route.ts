import { exportStore } from "@/lib/export-store";
import { getCurrentUserId } from "@/lib/auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ exportId: string }> }
) {
  const { exportId } = await context.params;
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return new Response("unauthorized", { status: 401 });
    }
    const bytes = await exportStore.buildResumePdf(exportId, userId);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="resume-${exportId}.pdf"`,
      },
    });
  } catch {
    return new Response("export not found", { status: 404 });
  }
}
