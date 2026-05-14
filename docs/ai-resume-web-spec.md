# AIPM Copilot — AI 产品经理求职教练 Web 规范文档

## 1. 文档目标

本文档定义 AIPM Copilot 产品的：

- 产品定位与差异化策略
- 目标用户与核心场景
- 网页信息架构
- 页面级 PRD
- API 草案与数据模型
- 首版实现路线图

---

## 2. 产品定位

### 2.1 一句话定位

> **专为想做 AI 产品经理的人打造的求职教练**——不只帮你改简历，更帮你判断"要不要投"、"差在哪"、"怎么补"。

### 2.2 差异化策略

| 维度 | 通用简历工具（竞品） | AIPM Copilot（我们） |
|---|---|---|
| 核心动作 | 改简历 → 导出 | 判断投不投 → 找出差距 → 补齐能力 → 改写简历 → 准备面试 |
| 服务对象 | 所有求职者 | 转岗到 AIPM 的人 + 想做 AIPM 的应届生/实习生 |
| 分析维度 | 关键词匹配 + 通用文本润色 | AIPM 能力模型 × JD 适配度 × 可补齐性评估 |
| 输出产物 | 改写后简历 | 投递决策报告 + 能力补齐方案 + 定制简历 + 面试题库 |
| 领域知识 | 无 | 内置 AI 产品经理能力图谱、行业术语库、AIPM JD 模式库 |

### 2.3 核心价值主张

1. **投不投？**——投递决策引擎：分析你和这个岗位的真实距离，告诉你"值不值得投"
2. **差在哪？**——AIPM 能力诊断：用 AI 产品经理能力模型拆解你的经历，找到真正的短板
3. **怎么补？**——可执行的能力补齐方案：2 周内可做的事，让你跨过门槛
4. **怎么写？**——岗位定制简历改写：基于 AIPM 语言体系，帮你把经历"翻译"成面试官想看的样子
5. **怎么答？**——面试题生成：结合 JD + 简历，预测可能被问到的问题和回答框架

### 2.4 产品边界（MVP）

本期包含：

- 投递决策报告
- AIPM 能力诊断
- 能力补齐建议
- 简历改写（用 AIPM 语言体系）
- 面试问题生成
- 版本保存与导出

本期不包含：

- 企业端
- 自动投递
- 社区
- 付费系统（首版免费验证 PMF）

---

## 3. 目标用户

### 3.1 用户画像 A：转岗者

- **典型背景**：3–7 年工作经验；来自传统产品经理、运营、研发、数据分析等岗位
- **核心焦虑**：不确定自己够不够格投 AI 产品经理；不知道怎么把旧经验翻译成 AIPM 语言
- **行为特征**：
  - 同时关注 5–20 个 AIPM 岗位
  - 在 Boss/拉勾/脉脉上反复看 JD，犹豫要不要投
  - 会搜"AI 产品经理需要什么能力"
  - 可能已在学 Prompt Engineering / RAG / Agent 相关知识

### 3.2 用户画像 B：应届生/实习生

- **典型背景**：大三到研二；计算机/信管/设计/商科背景；有 0–2 段互联网实习
- **核心焦虑**：经历太少写不满一页；不知道学校项目怎么包装；AIPM 岗位要求看不懂
- **行为特征**：
  - 投 AIPM 实习岗和校招岗
  - 简历写的是"参与了 XX 项目"，缺少成果描述
  - 有 AI 相关课程项目，但不知道怎么写成产品经验
  - 看很多小红书/知乎求职帖

### 3.3 两类用户的共性痛点

1. **看不懂 JD**：不知道"负责 AI 产品全链路"到底要哪些能力
2. **判断不了距离**：不确定自己离这个岗位有多远
3. **不会翻译经历**：有相关能力但不会用 AIPM 的语言表达
4. **不知道先补什么**：时间有限，不知道哪个能力最值得先补

### 3.4 用户成功标准

- 转岗者：投递后面试率从 < 5% 提升到 15%+
- 应届生：能产出一份"看起来像做过 AI 产品的人写的简历"
- 两类用户都能在 10 分钟内完成"投递决策 + 简历改写"闭环

---

## 4. AIPM 能力模型

产品内置的分析引擎基于以下能力维度。此模型是本产品的核心领域知识壁垒。

### 4.1 能力维度定义

| 维度 ID | 维度名称 | 说明 | 典型 JD 关键词 |
|---|---|---|---|
| `ai_understanding` | AI 技术理解力 | 理解 LLM/ML 基础原理，能和算法工程师对话 | 大模型、NLP、RAG、Prompt Engineering、Agent、Fine-tuning |
| `product_design` | 产品设计力 | 需求分析、功能定义、交互设计、PRD 撰写 | 需求分析、产品规划、PRD、原型设计、用户体验 |
| `data_driven` | 数据驱动力 | 用数据定义指标、验证假设、驱动迭代 | 数据分析、A/B 测试、指标体系、SQL、埋点 |
| `project_execution` | 项目推进力 | 跨团队协调、进度管理、风险控制 | 跨部门协作、项目管理、敏捷开发、排期 |
| `business_sense` | 商业感知力 | 理解商业模式、竞品格局、变现逻辑 | 商业化、竞品分析、ROI、用户增长、留存 |
| `ai_application` | AI 应用落地力 | 能将 AI 能力嵌入产品场景，设计 AI 功能链路 | AI 产品化、效果评估、Prompt 设计、标注体系、模型评测 |
| `communication` | 沟通表达力 | 向上汇报、跨团队对齐、文档输出 | 跨团队沟通、汇报、文档能力 |

### 4.2 能力模型在产品中的应用

- **JD 解析**：从 JD 中提取岗位在各维度的要求等级（L0 不要求 / L1 了解 / L2 熟练 / L3 精通）
- **简历评估**：从简历中推断用户在各维度的当前等级
- **Gap 分析**：逐维度对比，输出"已达标 / 差一点 / 明显不足"
- **补齐建议**：针对"差一点"的维度，给出 2 周内可补齐的具体行动
- **改写指导**：针对"已达标但没写出来"的维度，指导怎么重新描述

---

## 5. 网页信息架构

### 5.1 站点地图

```text
/
├── /                           首页（产品介绍 + 快速开始）
├── /copilot                    求职教练主工作台（核心页面）
├── /report/:sessionId          投递决策报告页
├── /rewrite/:sessionId         简历改写结果页
├── /interview/:sessionId       面试题库页
├── /pricing                    定价页
├── /examples                   案例页（当前阶段默认隐藏）
├── /dashboard
│   ├── /dashboard/history      报告记录 + 简历版本
│   └── /dashboard/orders       我的订单
└── /api/*                      接口层
```

### 5.2 导航结构

顶部导航：

- 首页
- 求职教练（核心入口）
- 定价
- 历史记录
- 我的订单

### 5.3 关键用户流

#### 流程 A：转岗者首次使用

1. 进入首页 → 看到"专为转岗 AIPM 打造"
2. 点击"开始评估" → 进入 /copilot
3. 上传简历 + 粘贴目标 AIPM 岗位 JD
4. 系统生成**投递决策报告**（3 级判定：建议投递 / 谨慎投递 / 暂不建议）
5. 查看 AIPM 能力雷达图 + Gap 分析
6. 查看 2 周补齐方案
7. 一键生成改写版简历
8. 查看面试预测题
9. 导出 / 保存

#### 流程 B：应届生首次使用

1. 进入首页 → 看到"应届生也能写出 AIPM 简历"
2. 点击"免费试试" → 进入 /copilot
3. 粘贴简历（项目经历可能很薄）+ 粘贴目标实习 JD
4. 系统生成投递决策报告（可能判定"差一点，但可以冲"）
5. 查看能力诊断 → 高亮"AI 应用落地力"等维度需要补充
6. 查看补齐方案（"做一个 AI 小工具放 GitHub"等建议）
7. 生成改写版简历 → 把"参与了 XX"翻译成 AIPM 语言
8. 导出

#### 流程 C：多岗位批量决策（P1）

1. 用户上传 1 份 Master 简历
2. 批量导入 N 个 JD（粘贴多段 / 链接解析）
3. 系统生成岗位矩阵：哪些值得投、哪些需要准备、哪些暂时放弃
4. 用户选择要投的岗位，批量生成定制简历

---

## 6. 页面 PRD

### 6.1 首页 `/`

#### 页面目标

- 让用户 5 秒内理解"这是给想做 AIPM 的人用的"
- 建立专业感和信任
- 驱动用户进入求职教练

#### 主要模块

**1. Hero 区**

- 主标题：想做 AI 产品经理？先看看你离这个岗位有多远
- 副标题：专为转岗 AIPM 和 AIPM 应届求职者打造的 AI 求职教练。不只改简历，更帮你做投递决策。
- 主按钮：免费开始评估
- 次按钮：看看别人怎么转岗的

**2. 产品能力区（3 卡片）**

- 卡片 1：投递决策引擎——告诉你这个岗位值不值得投
- 卡片 2：AIPM 能力诊断——用行业能力模型分析你的差距
- 卡片 3：定制简历改写——帮你把经历翻译成 AIPM 语言

**3. 用户场景区**

- Tab 1：我是转岗者 → 展示转岗者典型故事和产品如何帮助
- Tab 2：我是应届生 → 展示应届生典型故事和产品如何帮助

**4. 真实案例区**

- 展示 2–3 个真实的"转岗前简历 → AIPM 改写后简历"对比
- 每个案例标注：投递建议等级、能力雷达对比

**5. AIPM 能力图谱预览**

- 展示 7 个能力维度的可视化
- 让用户看到"原来面试官是这样评估我的"

**6. FAQ**

- 和 ChatGPT 直接改简历有什么区别？
- 没有 AI 经验能转岗吗？
- 数据安全如何保证？
- 改写后的内容是不是编的？

#### 验收标准

- 首屏必须传达"垂直 AIPM"定位，不能看起来像通用简历工具
- 必须有面向两类用户的内容

---

### 6.2 求职教练工作台 `/copilot`

#### 页面目标

- 产品的核心交互页面，一站式完成：输入 → 决策 → 改写
- 统一主入口，并保留 `/optimize` 作为兼容过渡页

#### 页面布局

桌面端三栏布局：

- 左栏（窄）：步骤导航（Step 1/2/3/4）
- 中栏（宽）：当前步骤的主内容
- 右栏（中）：实时状态摘要 + 上下文信息

#### 步骤流程

**Step 1：输入简历**

- 支持粘贴文本 / 上传 PDF（继承现有 PDF 解析 + OCR 能力）
- 可选"AI 润色解析内容"（继承现有润色功能）
- 新增：选择身份标签：转岗者 / 应届生
- 新增：选择原岗位类型（产品经理 / 运营 / 研发 / 数据分析 / 设计 / 其他）

**Step 2：输入目标岗位**

- 粘贴 JD 文本
- 系统自动提取：岗位名称、公司、JD 中的能力要求
- 自动映射到 AIPM 能力模型各维度
- 展示 JD 解析结果：各维度要求等级的可视化

**Step 3：投递决策报告**

- 实时生成，不跳转页面
- 包含：
  - 投递建议等级：🟢 建议投递 / 🟡 谨慎投递 / 🔴 暂不建议
  - 一句话结论
  - AIPM 能力雷达图（岗位要求 vs 你的现状）
  - 逐维度 Gap 分析
  - "如果投了，可能卡在哪一轮"的预判
  - 2 周可执行补齐方案
- 底部 CTA：继续生成岗位定制简历 / 换一个岗位再看看

**Step 4：生成结果**

- 子 Tab A：改写版简历（分模块对比）
- 子 Tab B：面试预测题（基于简历 × JD 生成 15–20 个问题 + 回答框架）
- 导出 / 保存操作

#### 交互规则

- 每个步骤完成后自动展开下一步
- 已完成步骤可折叠回溯
- Step 3 是核心价值展示点，必须有强视觉冲击
- 未输入简历/JD 时 Step 3/4 不可触发

#### 页面状态

- 空态（未输入）
- 输入中
- 分析中（Step 3 loading，15–30 秒）
- 结果态
- 失败态

#### 验收标准

- 用户能在单页面内完成从输入到获得投递决策的全流程
- 能力雷达图是可视化的、直观的
- 补齐方案是具体可执行的（不是"提升数据能力"这种空话）

---

### 6.3 投递决策报告页 `/report/:sessionId`

#### 页面目标

- 投递决策报告的独立可分享页面
- 可从 /copilot Step 3 点击"查看完整报告"跳转
- 可生成分享链接

#### 核心模块

**1. 报告头部**

- 投递建议等级（带颜色标签）
- 目标岗位 + 公司
- 生成时间
- 一句话结论

**2. AIPM 能力雷达图**

- 7 维度蛛网图
- 双层：岗位要求（外层）vs 个人现状（内层）
- 点击维度可展开详情

**3. 逐维度分析**

每个维度展示：

- 岗位要求等级（L0–L3）
- 你的现状等级
- 判定结果：✅ 已达标 / ⚠️ 差一点 / ❌ 明显不足
- 证据：简历中支撑该判定的具体内容（或"未找到相关经历"）
- 补齐建议（针对⚠️和❌）

**4. 面试轮次预判**

- 简历筛选：通过概率估计
- 一面（业务面）：可能被追问的点
- 二面（交叉面/Leader 面）：可能暴露的短板
- HR 面：薪资/稳定性/动机风险评估

**5. 2 周补齐方案**

分优先级列出具体行动：
- Week 1 做什么
- Week 2 做什么
- 预期效果

**6. 行动 CTA**

- 按钮 1：生成岗位定制简历
- 按钮 2：看面试预测题
- 按钮 3：换一个岗位对比

#### 验收标准

- 报告必须给出明确的"投 / 不投"建议，不能模棱两可
- 补齐方案必须具体到"做什么事"（例如"用 Dify 搭一个 RAG 应用并写一篇复盘"）
- 面试轮次预判必须和实际面试流程匹配

---

### 6.4 简历改写结果页 `/rewrite/:sessionId`

#### 页面目标

- 展示 AIPM 语言体系下的定制简历
- 让用户理解"为什么这么改"

#### 核心模块

**1. 改写摘要**

- 原始匹配度 vs 改写后匹配度
- 核心改动要点（3–5 条）
- 改写策略说明（如"将运营经验翻译为产品经验"）

**2. 分模块对比**

模块列表：
- 个人简介 / Summary
- 工作/实习经历
- 项目经历
- 教育背景
- 技能清单

每个模块展示：
- 左：原文
- 右：改写后
- 下：改写原因 + 命中了哪个 AIPM 能力维度

**3. AIPM 术语标注**

在改写结果中高亮标注 AIPM 专业术语：
- 鼠标悬浮展示术语解释
- 让用户学习 AIPM 表达方式

**4. 编辑与导出**

- 单模块编辑
- 全文复制
- 导出 PDF
- 保存为版本

#### 验收标准

- 改写内容不得虚构事实
- 改写前后的差异必须可视化
- AIPM 术语标注帮助用户学习

---

### 6.5 面试题库页 `/interview/:sessionId`

#### 页面目标

- 基于简历 × JD 生成高度定制化的面试问题
- 帮用户提前准备

#### 核心模块

**1. 题目分类**

- 经历追问类（"你在 XX 项目中具体负责什么"）
- AIPM 专业类（"你怎么评估一个 AI 功能的效果"）
- 场景设计类（"如果让你设计一个 XX 功能，你怎么做"）
- 行为面试类（"遇到和研发意见不一致怎么办"）
- 转岗动机类（"为什么想从 XX 转做 AI 产品经理"）—— 仅转岗者

**2. 每道题展示**

- 题目
- 为什么可能被问到（和 JD/简历的关联）
- 回答框架（STAR 模型 / 结构化框架）
- 参考话术要点
- 踩坑提醒

**3. 模拟练习（P1）**

- 语音问答模拟（对接 TTS + ASR）
- AI 实时追问

#### 验收标准

- 面试题必须和具体的 JD + 简历强相关，不是通用题库
- 回答框架必须可落地，不是空话

---

### 6.6 AIPM 案例页 `/examples`

#### 页面目标

- 展示真实的转岗/应届生简历改写案例
- 建立产品专业性的信任

#### 核心模块

- 筛选器：转岗者 / 应届生 × 来源岗位类型
- 案例卡片：
  - 用户背景标签（如"运营 3 年 → AIPM"）
  - 改写前后对比
  - 能力雷达图对比
  - 投递决策等级
  - 最终结果（拿到面试 / Offer）

#### 验收标准

- 案例必须体现 AIPM 垂直能力，不是通用优化
- 每个案例都有明确的"来源岗位 → 目标岗位"标签

---

### 6.7 定价页 `/pricing`

#### 套餐设计

| 套餐 | 价格 | 权益 |
|---|---|---|
| 免费体验 | 0 | 1 次完整投递决策报告 + 改写 |
| 求职冲刺包 | ¥49 | 10 个岗位分析 + 无限改写 + 面试题 + 导出 |
| 月度教练 | ¥99/月 | 无限使用 + 岗位矩阵 + 优先出结果 |

#### 核心定价逻辑

- 锚定"职业咨询"心智（市场价 300–500/次），而非"工具订阅"心智
- 按"岗位数"计价，而非按"次数"计价
- 免费版足够完整让用户体验完整闭环

---

### 6.8 用户中心 `/dashboard`

#### 子页面

**/dashboard/history**

- 所有分析记录列表
- 每条记录展示：目标岗位、投递建议等级、时间
- 支持重新进入报告/改写/面试题页面

**/dashboard/orders**

- 所有完整求职包订单记录
- 每条记录展示：商品名、支付状态、金额、时间
- 支持回到历史记录继续查看已购报告

---

## 7. API 草案

### 7.1 设计原则

- REST 风格
- 统一响应结构（继承现有 SuccessResponse / ErrorResponse）
- 分析任务异步处理
- 输入输出 camelCase

### 7.2 核心接口

#### 1. 创建分析会话

`POST /api/v1/analysis-sessions`

```json
{
  "resumeText": "string",
  "jobDescriptionText": "string",
  "jobTitle": "AI 产品经理",
  "userProfile": {
    "identity": "career_changer" | "fresh_graduate",
    "currentRole": "product_manager" | "operation" | "developer" | "data_analyst" | "designer" | "other",
    "yearsOfExperience": 3
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "sessionId": "as_001",
    "status": "PROCESSING",
    "createdAt": "2026-05-07T12:00:00Z"
  }
}
```

#### 2. 获取投递决策报告

`GET /api/v1/analysis-sessions/:sessionId/decision-report`

```json
{
  "success": true,
  "data": {
    "sessionId": "as_001",
    "recommendation": "cautious",
    "recommendationLabel": "谨慎投递",
    "oneLiner": "你的产品设计力和项目推进力达标，但 AI 技术理解力和 AI 应用落地力明显不足，面试中很可能被追问穿",
    "overallMatchScore": 58,
    "dimensions": [
      {
        "dimensionId": "ai_understanding",
        "dimensionLabel": "AI 技术理解力",
        "requiredLevel": 2,
        "currentLevel": 1,
        "gap": "insufficient",
        "evidence": "简历中未提及任何 AI/ML 相关技术实践",
        "remedyActions": [
          "完成吴恩达 Prompt Engineering 课程并产出学习笔记",
          "用 Dify/Coze 搭建一个 RAG 应用，写一篇 1500 字实践复盘"
        ]
      }
    ],
    "interviewRoundPrediction": {
      "resumeScreening": { "passRate": "medium", "risk": "AI 相关关键词覆盖不足" },
      "firstRound": { "likelyQuestions": ["你对 RAG 的理解是什么？", "..."], "weakness": "AI 技术理解力" },
      "secondRound": { "likelyQuestions": ["..."], "weakness": "缺乏 AI 产品从 0 到 1 经验" },
      "hrRound": { "risk": "转岗动机需要清晰表达" }
    },
    "twoWeekPlan": {
      "week1": [
        { "action": "完成 Dify RAG 实践并发布文章", "targetDimension": "ai_understanding" },
        { "action": "拆解 3 个 AI 产品（Kimi/豆包/Copilot）的功能设计逻辑", "targetDimension": "ai_application" }
      ],
      "week2": [
        { "action": "用 AI 工具做一个小产品（如面试助手 Bot）并记录 PRD", "targetDimension": "ai_application" },
        { "action": "整理个人 AI 产品方法论文档", "targetDimension": "product_design" }
      ]
    }
  }
}
```

#### 3. 获取简历改写结果

`GET /api/v1/analysis-sessions/:sessionId/rewrite`

```json
{
  "success": true,
  "data": {
    "sessionId": "as_001",
    "beforeScore": 58,
    "afterScore": 79,
    "rewriteStrategy": "将运营经验中的用户增长和数据分析部分翻译为产品经验，强调 AI 工具的应用和数据驱动决策",
    "sections": [
      {
        "sectionKey": "project",
        "sectionLabel": "项目经历",
        "originalText": "负责公司公众号运营，策划活动提升粉丝量",
        "rewrittenText": "主导基于用户分层模型的内容增长策略，设计 A/B 测试框架验证内容推荐效果，3 个月内将核心指标 DAU 提升 40%。同期引入 AI 写作工具辅助内容生产，将内容产出效率提升 2 倍",
        "explanation": "将运营动作翻译为产品化思维（分层模型、A/B 测试）；强调 AI 工具应用经验；补充量化成果",
        "targetDimensions": ["data_driven", "ai_application"]
      }
    ],
    "fullRewrittenText": "...",
    "aipmTermsHighlighted": [
      { "term": "用户分层模型", "explanation": "按行为/属性将用户分群，针对性设计策略的产品方法" },
      { "term": "A/B 测试框架", "explanation": "对照实验方法，AIPM 常用来验证 AI 功能效果" }
    ]
  }
}
```

#### 4. 获取面试题

`GET /api/v1/analysis-sessions/:sessionId/interview-questions`

```json
{
  "success": true,
  "data": {
    "sessionId": "as_001",
    "questions": [
      {
        "id": "iq_001",
        "category": "aipm_professional",
        "question": "如果让你评估一个 AI 功能上线后的效果，你会怎么设计指标体系？",
        "whyAsked": "JD 中要求'AI 产品效果评估'能力，而你的简历中缺乏相关经历",
        "answerFramework": "1. 明确功能目标（解决什么问题）→ 2. 定义北极星指标 → 3. 拆解过程指标 → 4. 设计对照组 → 5. 确定观察周期",
        "keyPoints": ["区分 AI 指标（准确率/召回率）和产品指标（CTR/留存）", "提到 Bad Case 分析机制"],
        "pitfalls": ["不要只说'看数据'，要具体到看什么数据、怎么看"]
      }
    ]
  }
}
```

#### 5. 触发简历改写

`POST /api/v1/analysis-sessions/:sessionId/rewrite`

```json
{
  "rewriteMode": "balanced",
  "focusDimensions": ["ai_understanding", "ai_application"]
}
```

#### 6. 触发面试题生成

`POST /api/v1/analysis-sessions/:sessionId/interview-questions`

```json
{
  "questionCount": 20,
  "includeCategories": ["experience_probe", "aipm_professional", "scenario_design", "behavioral", "career_switch_motivation"]
}
```

### 7.3 继承的现有接口

以下接口保持不变：

- `POST /api/v1/uploads/resume-pdf` — PDF 解析 + OCR
- `POST /api/v1/resume-polish` — AI 润色
- `POST /api/v1/resume-versions` — 保存版本
- `GET /api/v1/resume-versions` — 版本列表
- `POST /api/v1/exports` — 导出
- `GET /api/v1/exports/:exportId/download` — 下载

### 7.4 新增枚举类型

```typescript
type UserIdentity = "career_changer" | "fresh_graduate";

type CurrentRole =
  | "product_manager"
  | "operation"
  | "developer"
  | "data_analyst"
  | "designer"
  | "other";

type RecommendationLevel = "recommended" | "cautious" | "not_recommended";

type DimensionGap = "met" | "close" | "insufficient";

type AIPMDimensionId =
  | "ai_understanding"
  | "product_design"
  | "data_driven"
  | "project_execution"
  | "business_sense"
  | "ai_application"
  | "communication";

type InterviewQuestionCategory =
  | "experience_probe"
  | "aipm_professional"
  | "scenario_design"
  | "behavioral"
  | "career_switch_motivation";
```

---

## 8. 数据模型调整

### 8.1 AnalysisSession（扩展）

新增字段：

```prisma
model AnalysisSession {
  // ...existing fields...
  userIdentity       String?   // "career_changer" | "fresh_graduate"
  currentRole        String?   // 来源岗位类型
  yearsOfExperience  Int?
}
```

### 8.2 DecisionReport（新增）

```prisma
model DecisionReport {
  id                  String   @id @default(cuid())
  sessionId           String   @unique
  session             AnalysisSession @relation(fields: [sessionId], references: [id])
  recommendation      String   // "recommended" | "cautious" | "not_recommended"
  overallMatchScore   Int
  oneLiner            String
  dimensionsJson      String   // JSON: 各维度分析
  interviewPredJson   String   // JSON: 面试轮次预判
  twoWeekPlanJson     String   // JSON: 补齐方案
  createdAt           DateTime @default(now())
}
```

### 8.3 InterviewQuestion（新增）

```prisma
model InterviewQuestion {
  id              String   @id @default(cuid())
  sessionId       String
  session         AnalysisSession @relation(fields: [sessionId], references: [id])
  category        String
  question        String
  whyAsked        String
  answerFramework String
  keyPoints       String   // JSON array
  pitfalls        String   // JSON array
  createdAt       DateTime @default(now())
}
```

---

## 9. 前端建议类型定义

```typescript
interface UserProfile {
  identity: UserIdentity;
  currentRole: CurrentRole;
  yearsOfExperience?: number;
}

interface DimensionAnalysis {
  dimensionId: AIPMDimensionId;
  dimensionLabel: string;
  requiredLevel: 0 | 1 | 2 | 3;
  currentLevel: 0 | 1 | 2 | 3;
  gap: DimensionGap;
  evidence: string;
  remedyActions: string[];
}

interface DecisionReport {
  sessionId: string;
  recommendation: RecommendationLevel;
  recommendationLabel: string;
  oneLiner: string;
  overallMatchScore: number;
  dimensions: DimensionAnalysis[];
  interviewRoundPrediction: InterviewRoundPrediction;
  twoWeekPlan: TwoWeekPlan;
}

interface InterviewRoundPrediction {
  resumeScreening: { passRate: string; risk: string };
  firstRound: { likelyQuestions: string[]; weakness: string };
  secondRound: { likelyQuestions: string[]; weakness: string };
  hrRound: { risk: string };
}

interface TwoWeekPlan {
  week1: PlanAction[];
  week2: PlanAction[];
}

interface PlanAction {
  action: string;
  targetDimension: AIPMDimensionId;
}

interface RewriteResult {
  sessionId: string;
  beforeScore: number;
  afterScore: number;
  rewriteStrategy: string;
  sections: RewriteSection[];
  fullRewrittenText: string;
  aipmTermsHighlighted: AIPMTerm[];
}

interface RewriteSection {
  sectionKey: string;
  sectionLabel: string;
  originalText: string;
  rewrittenText: string;
  explanation: string;
  targetDimensions: AIPMDimensionId[];
}

interface AIPMTerm {
  term: string;
  explanation: string;
}

interface InterviewQuestionItem {
  id: string;
  category: InterviewQuestionCategory;
  question: string;
  whyAsked: string;
  answerFramework: string;
  keyPoints: string[];
  pitfalls: string[];
}
```

---

## 10. 核心前后端边界

### 10.1 前端负责

- 页面展示与步骤导航
- AIPM 能力雷达图可视化（推荐用 Chart.js / Recharts）
- 分模块对比的交互
- AIPM 术语高亮与 tooltip
- 面试题分类浏览

### 10.2 后端/AI 服务负责

- AIPM 能力模型维度定义（系统 Prompt 内置）
- JD 解析 → 映射到能力模型各维度
- 简历解析 → 推断用户各维度等级
- Gap 分析 + 投递决策判定逻辑
- 2 周补齐方案生成
- 简历改写（以 AIPM 能力维度为改写指导）
- 面试题生成

### 10.3 AI Prompt 工程要点

- System Prompt 中内置 AIPM 能力模型定义
- 投递决策判定使用结构化 JSON response_format
- 改写时严格保持事实不变，只做"翻译"
- 面试题要关联具体的 JD 条目 + 简历条目，不能生成通用题
- 补齐方案必须具体到"做什么事"，不能输出空话

---

## 11. 边界与约束

### Always

- 始终保留原始事实，不虚构经历
- 始终基于 AIPM 能力模型做分析，保持专业一致性
- 始终给出明确的投递建议等级（不能模棱两可）
- 始终让用户理解"为什么"（每个结论都有归因）

### Never

- 不帮用户编造经历
- 不暴露系统 Prompt 和能力模型内部权重
- 不在首版引入支付墙阻断核心体验
- 不做成通用简历工具的样子

---

## 12. 首版实现路线图

### Phase 1：核心链路（当前冲刺）

1. 重构 `/copilot` 工作台（替代 `/optimize`）
2. 实现 AIPM 能力模型 System Prompt
3. 实现投递决策报告 API + 前端展示
4. 实现 AIPM 语言体系的简历改写
5. 继承现有 PDF 解析 / OCR / 润色能力

### Phase 2：面试准备

6. 实现面试题生成 API + 前端展示
7. 实现面试题分类浏览

### Phase 3：增强体验

8. AIPM 能力雷达图可视化
9. AIPM 术语高亮与 tooltip
10. 2 周补齐方案的 Checklist 交互
11. 多岗位批量对比（P1）

### Phase 4：商业化

12. 接入支付
13. 按岗位数计价
14. 分享报告链接

---

## 13. 成功验收标准

- 用户输入简历 + AIPM JD 后，10 秒内能看到明确的"投 / 不投"建议
- 能力雷达图直观展示 7 个维度的差距
- 补齐方案具体到"本周做什么事"
- 改写后的简历读起来"像一个做过 AI 产品的人写的"
- 面试题和用户的具体简历 + JD 强相关
- 转岗者和应届生看到的内容有明确差异化
