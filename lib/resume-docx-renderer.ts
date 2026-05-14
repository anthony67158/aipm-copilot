import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  BorderStyle,
} from "docx";

interface ResumeSection {
  sectionLabel: string;
  rewrittenText: string;
}

interface RenderDocxOptions {
  sections: ResumeSection[];
  fullText: string;
  jobTitle?: string | null;
  targetCompany?: string | null;
}

function sanitizeLine(raw: string) {
  return raw
    .replace(/\\r\\n|\\r|\\n/g, "\n")
    .replace(/(?<!\\)\\n/g, "\n")
    .replace(/\\\\/g, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s*#{2,6}\s+/g, " · ")
    .replace(/\*{2,3}([^*\n]+)\*{2,3}/g, "$1")
    .replace(/\|/g, "·")
    .trim();
}

function parseSectionText(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = text
    .split(/\n+/)
    .map((l) => sanitizeLine(l))
    .filter(Boolean);

  for (const line of lines) {
    const isBullet = /^[-•·*●]\s*/.test(line);
    const cleanText = isBullet ? line.replace(/^[-•·*●]\s*/, "") : line;

    paragraphs.push(
      new Paragraph({
        spacing: { before: 80, after: 80, line: 300 },
        indent: isBullet ? { left: 320, hanging: 180 } : undefined,
        children: [
          ...(isBullet
            ? [new TextRun({ text: "• ", bold: true, color: "1E3A8A", size: 21 })]
            : []),
          new TextRun({
            text: cleanText,
            size: 21,
            color: "1F2937",
          }),
        ],
      })
    );
  }

  return paragraphs;
}

export async function renderResumeDocx(options: RenderDocxOptions): Promise<Buffer> {
  const { sections, fullText, jobTitle, targetCompany } = options;

  const titleText = targetCompany && jobTitle
    ? `${targetCompany} · ${jobTitle}`
    : jobTitle || "岗位定制简历";

  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "岗位定制简历",
          bold: true,
          size: 34,
          color: "111827",
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      children: [
        new TextRun({
          text: titleText,
          size: 20,
          color: "6B7280",
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      spacing: { before: 100, after: 260 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 8, color: "E5E7EB", space: 1 },
      },
      children: [new TextRun({ text: "", size: 2 })],
    })
  );

  if (sections.length > 0) {
    for (const section of sections) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
          children: [
            new TextRun({
              text: section.sectionLabel,
              bold: true,
              size: 24,
              color: "111827",
            }),
          ],
        })
      );

      children.push(
        new Paragraph({
          spacing: { after: 120 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: "E5E7EB", space: 1 },
          },
          children: [new TextRun({ text: "", size: 2 })],
        })
      );

      const sectionParagraphs = parseSectionText(section.rewrittenText);
      children.push(...sectionParagraphs);
    }
  } else {
    const fallbackParagraphs = parseSectionText(fullText);
    children.push(...fallbackParagraphs);
  }

  children.push(
    new Paragraph({
      spacing: { before: 600 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "由 AIPM Copilot 生成",
          size: 18,
          italics: true,
          color: "9CA3AF",
        }),
      ],
    })
  );

  const doc = new Document({
    creator: "AIPM Copilot",
    title: titleText,
    description: "AIPM Copilot 生成的岗位定制简历",
    styles: {
      default: {
        document: {
          run: { font: "Microsoft YaHei", size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
