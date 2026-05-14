import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PdfExtractResult = {
  text: string;
  pageCount: number;
  extractionMethod: "text" | "ocr";
};

export async function extractResumePdf(fileName: string, buffer: Buffer): Promise<PdfExtractResult> {
  const tempFilePath = path.join(
    os.tmpdir(),
    `resume-upload-${Date.now()}-${Math.random().toString(36).slice(2)}-${sanitizeFileName(fileName)}`
  );

  await fs.writeFile(tempFilePath, buffer);

  try {
    let textResult: { text: string; pageCount: number } | null = null;

    try {
      textResult = await runPdfTextExtraction(tempFilePath, buffer);
    } catch {
      textResult = null;
    }

    if (textResult) {
      const normalizedText = normalizeExtractedText(textResult.text);
      if (normalizedText.length >= 50) {
        return {
          text: normalizedText,
          pageCount: textResult.pageCount,
          extractionMethod: "text",
        };
      }
    }

    const ocrResult = await runPdfOcrExtraction(tempFilePath);
    const normalizedOcrText = normalizeExtractedText(ocrResult.text);
    if (normalizedOcrText.length >= 20) {
      return {
        text: normalizedOcrText,
        pageCount: ocrResult.pageCount || textResult?.pageCount || 1,
        extractionMethod: "ocr",
      };
    }

    if (textResult) {
      const normalizedText = normalizeExtractedText(textResult.text);
      if (normalizedText.length >= 20) {
        return {
          text: normalizedText,
          pageCount: textResult.pageCount,
          extractionMethod: "text",
        };
      }
    }

    throw new Error("NO_EXTRACTABLE_TEXT");
  } finally {
    await fs.unlink(tempFilePath).catch(() => undefined);
  }
}

async function runPdfTextExtraction(_filePath: string, buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return { text: result.text || "", pageCount: result.total || 1 };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function runPdfOcrExtraction(filePath: string) {
  const swiftScriptPath = path.join(process.cwd(), "scripts", "ocr_pdf.swift");
  const { stdout } = await execFileAsync("swift", [swiftScriptPath, filePath], {
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
    timeout: 60000,
  });

  return JSON.parse(stdout) as { text: string; pageCount: number };
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\f/g, "\n")
    .replace(/--\s*\d+\s*of\s*\d+\s*--/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}
