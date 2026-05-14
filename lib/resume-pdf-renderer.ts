import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, PDFFont, PDFPage } from "pdf-lib";

const CJK_FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf";
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "resume-originals");

interface ResumeSection {
  sectionLabel: string;
  rewrittenText: string;
}

interface RenderOptions {
  sections: ResumeSection[];
  fullText: string;
  originalPdfFileId?: string | null;
}

const COLORS = {
  heading: rgb(0.1, 0.1, 0.15),
  sectionTitle: rgb(0.15, 0.22, 0.42),
  body: rgb(0.2, 0.2, 0.25),
  accent: rgb(0.25, 0.35, 0.65),
  line: rgb(0.75, 0.78, 0.85),
  bullet: rgb(0.35, 0.45, 0.7),
};

export async function renderResumePdf(options: RenderOptions): Promise<Buffer> {
  const { sections, fullText, originalPdfFileId } = options;

  let pageWidth = 595;
  let pageHeight = 842;

  if (originalPdfFileId) {
    try {
      const originalPath = path.join(UPLOAD_DIR, `${originalPdfFileId}.pdf`);
      const originalBytes = await readFile(originalPath);
      const originalDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
      const firstPage = originalDoc.getPage(0);
      const { width, height } = firstPage.getSize();
      if (width > 100 && height > 100) {
        pageWidth = width;
        pageHeight = height;
      }
    } catch {
      // fall back to A4
    }
  }

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontBytes = await readFile(CJK_FONT_PATH);
  const font = await pdf.embedFont(fontBytes, { subset: true });

  const margin = {
    top: 56,
    bottom: 50,
    left: 52,
    right: 52,
  };
  const contentWidth = pageWidth - margin.left - margin.right;
  const lineHeight = 16;
  const sectionGap = 22;
  const headerFontSize = 13;
  const bodyFontSize = 10.5;
  const bulletIndent = 12;

  let currentPage: PDFPage = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin.top;

  function ensureSpace(needed: number) {
    if (y - needed < margin.bottom) {
      currentPage = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin.top;
    }
  }

  function drawLine(x1: number, x2: number, yPos: number) {
    currentPage.drawLine({
      start: { x: x1, y: yPos },
      end: { x: x2, y: yPos },
      thickness: 0.6,
      color: COLORS.line,
    });
  }

  function wrapLine(text: string, fontSize: number, maxWidth: number): string[] {
    const lines: string[] = [];
    let current = "";
    for (const char of text) {
      const testStr = current + char;
      const testWidth = font.widthOfTextAtSize(testStr, fontSize);
      if (testWidth > maxWidth && current.length > 0) {
        lines.push(current);
        current = char;
      } else {
        current = testStr;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawText(text: string, x: number, fontSize: number, color: typeof COLORS.body, maxWidth: number) {
    const wrapped = wrapLine(text, fontSize, maxWidth);
    for (const line of wrapped) {
      ensureSpace(lineHeight);
      currentPage.drawText(line, { x, y, size: fontSize, font, color });
      y -= lineHeight;
    }
  }

  const hasSections = sections.length > 0;
  const contentToRender = hasSections ? sections : parseTextIntoSections(fullText);

  for (let i = 0; i < contentToRender.length; i++) {
    const section = contentToRender[i];

    if (i > 0) {
      y -= sectionGap * 0.4;
    }

    ensureSpace(lineHeight * 2 + sectionGap);

    currentPage.drawText(section.sectionLabel, {
      x: margin.left,
      y,
      size: headerFontSize,
      font,
      color: COLORS.sectionTitle,
    });
    y -= 4;
    drawLine(margin.left, margin.left + contentWidth, y);
    y -= lineHeight;

    const paragraphs = section.rewrittenText.split("\n").filter((l) => l.trim().length > 0);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      const isBullet = trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("·");

      if (isBullet) {
        const bulletText = trimmed.replace(/^[•\-·]\s*/, "");
        ensureSpace(lineHeight);
        currentPage.drawText("•", {
          x: margin.left + bulletIndent,
          y,
          size: bodyFontSize,
          font,
          color: COLORS.bullet,
        });
        drawText(bulletText, margin.left + bulletIndent + 10, bodyFontSize, COLORS.body, contentWidth - bulletIndent - 10);
      } else {
        drawText(trimmed, margin.left, bodyFontSize, COLORS.body, contentWidth);
      }
      y -= 2;
    }

    y -= sectionGap * 0.6;
  }

  return Buffer.from(await pdf.save());
}

function parseTextIntoSections(text: string): ResumeSection[] {
  const lines = text.split("\n");
  const sections: ResumeSection[] = [];
  let currentLabel = "";
  let currentBody: string[] = [];

  const sectionPattern = /^(?:#{1,3}\s+)?(?:【(.+?)】|(.+?)[:：]?\s*$)/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentBody.length > 0) currentBody.push("");
      continue;
    }

    const isLikelyHeader =
      trimmed.length <= 20 &&
      !trimmed.startsWith("•") &&
      !trimmed.startsWith("-") &&
      !trimmed.startsWith("·") &&
      !trimmed.includes("，") &&
      !trimmed.includes("。");

    const match = sectionPattern.exec(trimmed);
    if (isLikelyHeader && (match || (trimmed.length <= 12 && /^[\u4e00-\u9fff\w\s/]+$/.test(trimmed)))) {
      if (currentLabel && currentBody.length > 0) {
        sections.push({ sectionLabel: currentLabel, rewrittenText: currentBody.join("\n") });
      }
      currentLabel = match?.[1] || match?.[2] || trimmed;
      currentBody = [];
    } else {
      if (!currentLabel) {
        currentLabel = "基本信息";
      }
      currentBody.push(trimmed);
    }
  }

  if (currentLabel && currentBody.length > 0) {
    sections.push({ sectionLabel: currentLabel, rewrittenText: currentBody.join("\n") });
  }

  if (sections.length === 0) {
    sections.push({ sectionLabel: "简历内容", rewrittenText: text });
  }

  return sections;
}
