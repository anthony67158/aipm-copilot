import type {
  AIPMTerm,
  RewriteFactGuard,
  RewriteFactGuardIssue,
  RewriteSection,
} from "@/types/api";

export interface RewriteValidationResult {
  isValid: boolean;
  issues: RewriteFactGuardIssue[];
}

const NUMBER_PATTERN = /\d+(?:\.\d+)?(?:%|w|W|k|K|\+|x|X)?/g;
const ENGLISH_TERM_PATTERN = /\b[A-Za-z][A-Za-z0-9+_.-]{1,}\b/g;
const DATE_RANGE_PATTERN = /(?:\d{4})[./\-年]\s*\d{1,2}(?:[./\-月]\d{0,2}日?)?\s*(?:[-–~至到]|\s至\s)?\s*(?:(?:\d{4})[./\-年]\s*\d{1,2}(?:[./\-月]\d{0,2}日?)?|至今|现在|present|Present|PRESENT)?/g;
const SINGLE_DATE_PATTERN = /\d{4}\s*(?:年|[./\-])\s*\d{1,2}(?:\s*(?:月|[./\-])\s*\d{0,2}日?)?/g;
const LOCATION_PATTERN = /[\u4e00-\u9fa5]{2,6}(?:市|省|区|县)/g;
const PROPER_NOUN_SUFFIXES = [
  "大学",
  "学院",
  "学校",
  "公司",
  "集团",
  "医院",
  "中心",
  "平台",
  "项目",
  "社团",
  "基金",
  "研究院",
  "实验室",
  "委员会",
  "医学院",
];

const PROPER_NOUN_PATTERN = new RegExp(
  `[\\u4e00-\\u9fa5A-Za-z0-9·()（）《》“”"\\-]{2,40}(?:${PROPER_NOUN_SUFFIXES.join("|")})`,
  "g"
);
const ROLE_TITLE_PATTERN = /[\u4e00-\u9fa5A-Za-z]{2,24}(?:产品经理|运营实习生|产品实习生|实习生|经理|负责人|专员|顾问|研究员|分析师|策划|主管|总监|工程师)/g;
const SECTION_DOMAIN_KEYWORDS = [
  "医疗",
  "医学",
  "医院",
  "临床",
  "护士",
  "卫健委",
  "药监",
  "合规",
  "医保",
  "慢病",
  "广告",
  "美妆",
  "金融",
  "基金",
  "财务",
  "投研",
  "教育",
  "教务",
  "校区",
  "社群",
  "医学院",
  "三甲",
];

function unique<T>(items: Iterable<T>) {
  return Array.from(new Set(items));
}

function normalizeToken(token: string) {
  return token.replace(/\s+/g, "").toLowerCase().trim();
}

function extractNumbers(text: string) {
  return unique((text.match(NUMBER_PATTERN) ?? []).map(normalizeToken));
}

function extractEnglishTerms(text: string) {
  return unique((text.match(ENGLISH_TERM_PATTERN) ?? []).map(normalizeToken));
}

function extractProperNouns(text: string) {
  return unique((text.match(PROPER_NOUN_PATTERN) ?? []).map((item) => item.trim()));
}

function extractRoleTitles(text: string) {
  return unique((text.match(ROLE_TITLE_PATTERN) ?? []).map((item) => item.trim()));
}

function extractSectionDomainKeywords(text: string) {
  return SECTION_DOMAIN_KEYWORDS.filter((keyword) => text.includes(keyword));
}

export function extractDateRanges(text: string) {
  const ranges = unique((text.match(DATE_RANGE_PATTERN) ?? []).map((item) => item.replace(/\s+/g, "").trim()));
  const singles = unique((text.match(SINGLE_DATE_PATTERN) ?? []).map((item) => item.replace(/\s+/g, "").trim()));
  const merged = unique([...ranges, ...singles]).filter((item) => item.length >= 5);
  return merged;
}

export function extractLocations(text: string) {
  return unique((text.match(LOCATION_PATTERN) ?? []).map((item) => item.trim()));
}

function formatList(items: string[], fallback = "无") {
  return items.length ? items.join("、") : fallback;
}

export function buildRewriteFactWhitelistSummary(resumeText: string) {
  const lines = resumeText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const keyLines = lines
    .filter((line) => /[：:•\-—]/.test(line) || line.length <= 28)
    .slice(0, 18);

  const numbers = extractNumbers(resumeText).slice(0, 20);
  const englishTerms = extractEnglishTerms(resumeText).slice(0, 20);
  const properNouns = extractProperNouns(resumeText).slice(0, 20);
  const dateRanges = extractDateRanges(resumeText).slice(0, 20);
  const roleTitles = extractRoleTitles(resumeText).slice(0, 20);
  const locations = extractLocations(resumeText).slice(0, 12);

  return [
    "## 原文事实白名单（以下信息必须 100% 保留，禁止删除/篡改/合并）",
    `- 时间/日期/任职区间：${formatList(dateRanges)}`,
    `- 角色/岗位/头衔：${formatList(roleTitles)}`,
    `- 机构/项目/组织名：${formatList(properNouns)}`,
    `- 地点/城市：${formatList(locations)}`,
    `- 数字/指标：${formatList(numbers)}`,
    `- 英文/技术词：${formatList(englishTerms)}`,
    "- 可直接引用的关键原文片段：",
    ...keyLines.map((line) => `  - ${line}`),
    "",
    "⚠️ 强制要求：rewrittenText 必须明确出现「时间/日期/任职区间」「角色/岗位/头衔」「机构/项目/组织名」中与本段相关的所有事实；任何一项被遗漏都视为不合格，需要重新生成。",
  ].join("\n");
}

function collectRewriteText(sections: RewriteSection[], fullRewrittenText: string, aipmTermsHighlighted: AIPMTerm[]) {
  return [
    fullRewrittenText,
    ...sections.flatMap((section) => [
      section.sectionLabel,
      section.originalText,
      section.rewrittenText,
      section.explanation,
    ]),
    ...aipmTermsHighlighted.flatMap((term) => [term.term, term.explanation]),
  ]
    .filter(Boolean)
    .join("\n");
}

function diffTokens(next: string[], base: string[]) {
  const baseSet = new Set(base.map(normalizeToken));
  return next.filter((item) => !baseSet.has(normalizeToken(item)));
}

function buildGuardSummary(status: RewriteFactGuard["status"], issues: RewriteFactGuardIssue[]) {
  switch (status) {
    case "passed":
      return "事实护栏通过，当前改写未检测到新增事实风险";
    case "repaired":
      return `事实护栏已生效，系统已自动移除 ${issues.length} 类新增事实风险`;
    case "fallback":
      return "事实护栏已拦截高风险改写，本次已回退为原始简历";
    case "risky":
    default:
      return `检测到 ${issues.length} 类事实风险，请逐条核对后再导出或投递`;
  }
}

export function buildRewriteFactGuard(
  status: RewriteFactGuard["status"],
  issues: RewriteFactGuardIssue[]
): RewriteFactGuard {
  return {
    status,
    summary: buildGuardSummary(status, issues),
    issues,
  };
}

export function validateRewriteConsistency(input: {
  resumeText: string;
  sections: RewriteSection[];
  fullRewrittenText: string;
  aipmTermsHighlighted: AIPMTerm[];
}): RewriteValidationResult {
  const rewriteText = collectRewriteText(
    input.sections,
    input.fullRewrittenText,
    input.aipmTermsHighlighted
  );

  const issues: RewriteFactGuardIssue[] = [];

  // 放宽标准：只有出现大量新数字时才拦截
  const newNumbers = diffTokens(extractNumbers(rewriteText), extractNumbers(input.resumeText)).slice(0, 8);
  if (newNumbers.length > 3) {
    issues.push({
      code: "NEW_NUMERIC_FACT",
      message: "改写中出现了原简历没有的数字或量化指标",
      examples: newNumbers,
    });
  }

  // 放宽标准：允许少量常见英文术语
  const newEnglishTerms = diffTokens(
    extractEnglishTerms(rewriteText),
    extractEnglishTerms(input.resumeText)
  )
    .filter((item) => item !== "aipm" && item.length > 3)
    .slice(0, 8);
  if (newEnglishTerms.length > 5) {
    issues.push({
      code: "NEW_ENGLISH_TERM",
      message: "改写中出现了原简历没有的英文术语、工具名或专有缩写",
      examples: newEnglishTerms,
    });
  }

  // 放宽标准：只有出现新专有名词时才拦截
  const newProperNouns = diffTokens(
    extractProperNouns(rewriteText),
    extractProperNouns(input.resumeText)
  ).slice(0, 8);
  if (newProperNouns.length > 2) {
    issues.push({
      code: "NEW_PROPER_NOUN",
      message: "改写中出现了原简历没有的机构名、项目名或组织名",
      examples: newProperNouns,
    });
  }

  for (const section of input.sections) {
    const originalText = [section.sectionLabel, section.originalText].filter(Boolean).join("\n");
    const rewrittenText = [section.sectionLabel, section.rewrittenText, section.explanation]
      .filter(Boolean)
      .join("\n");

    const newRoleTitles = diffTokens(
      extractRoleTitles(rewrittenText),
      extractRoleTitles(originalText)
    ).slice(0, 6);
    if (newRoleTitles.length > 2) {
      issues.push({
        code: "ROLE_TITLE_DRIFT",
        message: "改写中出现了原段落没有的角色或岗位称谓，可能发生岗位漂移",
        examples: newRoleTitles,
        sectionLabel: section.sectionLabel,
      });
    }

    const originalDomains = extractSectionDomainKeywords(originalText);
    const rewrittenDomains = extractSectionDomainKeywords(rewrittenText);
    const newDomains = diffTokens(rewrittenDomains, originalDomains).slice(0, 6);
    if (newDomains.length >= 4) {
      issues.push({
        code: "SECTION_DOMAIN_DRIFT",
        message: "改写中引入了原段落没有的行业场景关键词，可能发生行业漂移",
        examples: newDomains,
        sectionLabel: section.sectionLabel,
      });
    }
  }

  // 放宽标准：允许少量问题存在，只要不超过一定数量
  return {
    isValid: issues.length <= 2,
    issues,
  };
}
