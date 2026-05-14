import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { versionStore } from "@/lib/version-store";
import type {
  CreateExportJobRequest,
  ExportJob,
  ExportJobId,
  ExportStatus,
} from "@/types/api";

const createId = <T extends string>(prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}` as T;

const CJK_FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf";

function mapExportJob(record: {
  id: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  format: string;
  status: string;
  fileUrl: string | null;
  failureReason: string | null;
  expiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ExportJob {
  return {
    id: record.id as ExportJobId,
    userId: record.userId as ExportJob["userId"],
    sourceType: record.sourceType as ExportJob["sourceType"],
    sourceId: record.sourceId as ExportJob["sourceId"],
    format: record.format as ExportJob["format"],
    status: record.status as ExportStatus,
    fileUrl: record.fileUrl,
    failureReason: record.failureReason,
    expiredAt: record.expiredAt ? record.expiredAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const exportStore = {
  async createExportJob(input: CreateExportJobRequest, userId: string) {
    const exportId = createId<ExportJobId>("ex");
    const record = await prisma.exportJob.create({
      data: {
        id: exportId,
        userId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        format: input.format,
        status: "SUCCEEDED",
        fileUrl: `/api/v1/exports/${exportId}/download`,
        failureReason: null,
      },
    });
    return mapExportJob(record);
  },

  async getExportJob(exportId: string, userId?: string) {
    const record = await prisma.exportJob.findUnique({ where: { id: exportId } });
    if (record && userId && record.userId !== userId) {
      return null;
    }
    return record ? mapExportJob(record) : null;
  },

  async buildResumePdf(exportId: string, userId: string) {
    const exportJob = await prisma.exportJob.findUnique({ where: { id: exportId } });
    if (!exportJob || exportJob.userId !== userId) {
      throw new Error("export job not found");
    }

    const version = await versionStore.getVersion(exportJob.sourceId, userId);
    if (!version) {
      throw new Error("resume version not found");
    }

    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const page = pdf.addPage([595, 842]);
    const fontBytes = await readFile(CJK_FONT_PATH);
    const font = await pdf.embedFont(fontBytes);
    const bold = font;
    const margin = 48;
    const fontSize = 11;
    const titleSize = 18;
    let y = 790;

    page.drawText(version.title, {
      x: margin,
      y,
      size: titleSize,
      font: bold,
      color: rgb(0.06, 0.09, 0.16),
    });
    y -= 30;

    const lines = wrapText(version.resumeText, 78);
    for (const line of lines) {
      if (y < 60) {
        y = 790;
        pdf.addPage([595, 842]);
      }
      const currentPage = pdf.getPages()[pdf.getPageCount() - 1];
      currentPage.drawText(line, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.15, 0.2, 0.27),
      });
      y -= 18;
    }

    return Buffer.from(await pdf.save());
  },
};

function wrapText(input: string, width: number) {
  const normalized = input.replace(/\r/g, "");
  const lines: string[] = [];
  for (const rawLine of normalized.split("\n")) {
    if (!rawLine.trim()) {
      lines.push(" ");
      continue;
    }

    let current = "";
    for (const char of rawLine) {
      current += char;
      if (current.length >= width) {
        lines.push(current);
        current = "";
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}
