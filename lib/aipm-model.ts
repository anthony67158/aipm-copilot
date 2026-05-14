import type { AIPMDimensionId, DimensionLevel } from "@/types/api";

export interface AIPMDimension {
  id: AIPMDimensionId;
  label: string;
  description: string;
  jdKeywords: string[];
  levelDescriptions: Record<DimensionLevel, string>;
}

export const AIPM_DIMENSIONS: AIPMDimension[] = [
  {
    id: "ai_understanding",
    label: "AI 技术理解力",
    description: "理解 LLM/ML 基础原理，能和算法工程师对话",
    jdKeywords: [
      "大模型", "LLM", "NLP", "RAG", "Prompt Engineering", "Agent",
      "Fine-tuning", "微调", "向量数据库", "Embedding", "Transformer",
      "GPT", "BERT", "深度学习", "机器学习", "自然语言处理",
      "多模态", "RLHF", "模型训练", "推理优化",
    ],
    levelDescriptions: {
      0: "不要求",
      1: "了解 AI 基本概念，能理解技术方案的大方向",
      2: "熟悉主流 AI 技术栈，能与算法工程师深入讨论方案",
      3: "精通 AI 技术原理，能主导技术选型和架构决策",
    },
  },
  {
    id: "product_design",
    label: "产品设计力",
    description: "需求分析、功能定义、交互设计、PRD 撰写",
    jdKeywords: [
      "需求分析", "产品规划", "PRD", "原型设计", "用户体验",
      "交互设计", "功能设计", "产品架构", "用户画像", "用户调研",
      "竞品分析", "产品迭代", "版本规划", "功能优先级",
    ],
    levelDescriptions: {
      0: "不要求",
      1: "能撰写基本功能需求文档",
      2: "能独立完成从需求分析到 PRD 输出的全流程",
      3: "能主导复杂产品的架构设计和长期规划",
    },
  },
  {
    id: "data_driven",
    label: "数据驱动力",
    description: "用数据定义指标、验证假设、驱动迭代",
    jdKeywords: [
      "数据分析", "A/B 测试", "指标体系", "SQL", "埋点",
      "数据看板", "漏斗分析", "留存分析", "转化率", "北极星指标",
      "数据驱动", "实验平台", "统计分析", "增长分析",
    ],
    levelDescriptions: {
      0: "不要求",
      1: "能理解基本业务指标，会看数据看板",
      2: "能独立设计指标体系和 A/B 测试方案",
      3: "能建立数据驱动的产品决策体系",
    },
  },
  {
    id: "project_execution",
    label: "项目推进力",
    description: "跨团队协调、进度管理、风险控制",
    jdKeywords: [
      "跨部门协作", "项目管理", "敏捷开发", "排期", "Scrum",
      "需求评审", "进度管理", "风险管理", "资源协调", "里程碑",
      "复盘", "OKR", "项目推进", "跨团队",
    ],
    levelDescriptions: {
      0: "不要求",
      1: "能参与项目执行，完成分配的任务",
      2: "能独立推进中型项目，协调 3+ 团队",
      3: "能主导复杂项目群的规划和执行",
    },
  },
  {
    id: "business_sense",
    label: "商业感知力",
    description: "理解商业模式、竞品格局、变现逻辑",
    jdKeywords: [
      "商业化", "竞品分析", "ROI", "用户增长", "留存",
      "变现", "商业模式", "营收", "付费转化", "LTV",
      "市场分析", "行业分析", "商业策略", "定价策略",
    ],
    levelDescriptions: {
      0: "不要求",
      1: "了解基本商业模式和竞品格局",
      2: "能独立完成商业分析并产出可执行策略",
      3: "能主导产品商业化战略和增长体系",
    },
  },
  {
    id: "ai_application",
    label: "AI 应用落地力",
    description: "能将 AI 能力嵌入产品场景，设计 AI 功能链路",
    jdKeywords: [
      "AI 产品化", "效果评估", "Prompt 设计", "标注体系", "模型评测",
      "AI 功能", "智能推荐", "智能客服", "智能搜索", "AI 生成",
      "AIGC", "AI 工作流", "AI Agent", "Copilot", "AI 应用",
      "评测指标", "Bad Case", "Case 分析", "人工审核",
    ],
    levelDescriptions: {
      0: "不要求",
      1: "了解 AI 在产品中的应用场景",
      2: "能独立设计 AI 功能的完整链路（需求→Prompt→评测→上线）",
      3: "能主导 AI 产品矩阵的架构设计和效果优化体系",
    },
  },
  {
    id: "communication",
    label: "沟通表达力",
    description: "向上汇报、跨团队对齐、文档输出",
    jdKeywords: [
      "跨团队沟通", "汇报", "文档能力", "表达能力", "协调能力",
      "沟通能力", "推动能力", "影响力", "演讲", "培训",
    ],
    levelDescriptions: {
      0: "不要求",
      1: "能清晰表达自己的想法，完成日常沟通",
      2: "能有效推动跨团队对齐，输出高质量文档",
      3: "能影响高层决策，主导组织级沟通",
    },
  },
];

export const DIMENSION_MAP = new Map(
  AIPM_DIMENSIONS.map((d) => [d.id, d])
);

export function buildAIPMSystemPrompt(userIdentity: string): string {
  const dimensionDefs = AIPM_DIMENSIONS.map(
    (d) =>
      `- ${d.id}（${d.label}）：${d.description}\n  等级定义：L0=${d.levelDescriptions[0]}; L1=${d.levelDescriptions[1]}; L2=${d.levelDescriptions[2]}; L3=${d.levelDescriptions[3]}\n  JD 关键词：${d.jdKeywords.slice(0, 8).join("、")}`
  ).join("\n");

  const identityContext =
    userIdentity === "career_changer"
      ? "该用户是从其他岗位转行做 AI 产品经理的人，需要特别关注其可迁移能力的识别和翻译。"
      : "该用户是应届生/实习生，需要特别关注其学校项目和实习经历中与 AIPM 相关的潜力信号。";

  return `你是一位资深的 AI 产品经理面试官和求职教练。你拥有 10 年互联网产品经验，其中 5 年专注 AI 产品方向。
你的任务是基于 AIPM（AI 产品经理）能力模型，评估求职者和目标岗位的匹配度。

## AIPM 能力模型（7 维度）

${dimensionDefs}

## 用户背景

${identityContext}

## 评估原则

1. 严格基于简历中的实际描述进行判断，不做无根据的推测
2. 可迁移能力要合理识别——运营中的数据分析能力可映射到"数据驱动力"
3. 等级判定要有具体证据支撑
4. 补齐方案必须是 2 周内可执行的具体行动，不能是空话
5. 投递建议要明确，不能模棱两可
6. 面试预判要基于真实的互联网公司面试流程`;
}
