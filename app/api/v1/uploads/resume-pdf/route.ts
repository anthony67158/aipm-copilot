import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractResumePdf, PDF_EXTRACTION_ERRORS } from "@/lib/pdf-extract";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "resume-originals");

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "file is required",
        },
        requestId: crypto.randomUUID(),
      },
      { status: 422 }
    );
  }

  const looksLikePdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!looksLikePdf) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "only PDF files are supported",
        },
        requestId: crypto.randomUUID(),
      },
      { status: 422 }
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parsed = await extractResumePdf(file.name, buffer);
    const extractedText = parsed.text.trim();
    if (!extractedText || extractedText.length < 20) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "这个 PDF 暂时没有提取到足够文本，请尝试更清晰的 PDF，或手动粘贴简历内容。",
          },
          requestId: crypto.randomUUID(),
        },
        { status: 422 }
      );
    }

    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const savedFileName = `${fileId}.pdf`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, savedFileName), buffer);

    return NextResponse.json({
      success: true,
      data: {
        fileName: file.name,
        extractedText,
        pageCount: parsed.pageCount,
        extractionMethod: parsed.extractionMethod,
        savedFileId: fileId,
      },
      requestId: crypto.randomUUID(),
    });
  } catch (error) {
    console.error("resume-pdf upload failed", error);
    const errorMessage = error instanceof Error ? error.message : "";
    if (errorMessage === PDF_EXTRACTION_ERRORS.ocrUnavailable) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "当前线上仅支持文本型 PDF，请粘贴简历内容，或上传可复制文本的 PDF。",
          },
          requestId: crypto.randomUUID(),
        },
        { status: 422 }
      );
    }

    if (errorMessage === PDF_EXTRACTION_ERRORS.noExtractableText) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "这个 PDF 暂时没有提取到足够文本，请上传可复制文本的 PDF，或直接粘贴简历内容。",
          },
          requestId: crypto.randomUUID(),
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "PDF 解析失败，请尝试重新导出为文本型 PDF，或直接粘贴简历内容。",
        },
        requestId: crypto.randomUUID(),
      },
      { status: 500 }
    );
  }
}
