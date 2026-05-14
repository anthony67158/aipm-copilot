# AIPM Copilot 数据库表设计

## 1. 设计目标

本设计服务于 Web MVP，目标是：

- 支撑投递诊断与简历改写闭环
- 支撑用户版本管理与导出
- 支撑基础权益与订单能力
- 保持字段可扩展，便于后续功能迭代

数据库建议：`PostgreSQL 15+`

---

## 2. 命名约定

- 表名：`snake_case` 复数名词
- 主键：`id`，类型 `text`（前缀 ID）或 `uuid`
- 时间字段：`created_at`、`updated_at`
- 枚举值：`UPPER_SNAKE_CASE`
- 软删除：优先用状态字段，不强制 `deleted_at`

ID 前缀建议：

- 用户：`u_`
- 分析会话：`as_`
- 诊断结果：`dr_`
- 改写结果：`or_`
- 简历版本：`rv_`
- 导出任务：`ex_`
- 订单：`po_`
- 支付记录：`pr_`

---

## 3. ER 关系概览

```text
users (1) -------- (N) analysis_sessions
analysis_sessions (1) -- (1) diagnosis_results
analysis_sessions (1) -- (1) optimization_results
users (1) -------- (N) resume_versions
analysis_sessions (1) -- (N) resume_versions
users (1) -------- (N) export_jobs
resume_versions (1) -- (N) export_jobs
users (1) -------- (N) payment_orders
payment_orders (1) -- (N) payment_records
users (1) -------- (N) entitlement_ledgers
```

---

## 4. 核心表设计

## 4.1 `users`

用途：

- 存储平台用户主信息

字段：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | text | PK | 用户 ID（如 `u_xxx`） |
| email | text | UNIQUE, NULLABLE | 邮箱 |
| phone | text | UNIQUE, NULLABLE | 手机号 |
| nickname | text | NULLABLE | 昵称 |
| avatar_url | text | NULLABLE | 头像 |
| auth_provider | text | NOT NULL DEFAULT `'anonymous'` | 认证来源 |
| status | text | NOT NULL DEFAULT `'ACTIVE'` | 用户状态 |
| created_at | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| updated_at | timestamptz | NOT NULL DEFAULT now() | 更新时间 |

索引：

- `uk_users_email`
- `uk_users_phone`
- `idx_users_created_at`

---

## 4.2 `analysis_sessions`

用途：

- 一次简历分析任务的主记录

字段：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | text | PK | 会话 ID（`as_xxx`） |
| user_id | text | FK -> users.id, NULLABLE | 未登录可为空 |
| status | text | NOT NULL | `PENDING/PROCESSING/ANALYZED/OPTIMIZING/OPTIMIZED/FAILED` |
| resume_text | text | NOT NULL | 原始简历文本 |
| resume_file_url | text | NULLABLE | 原文件地址 |
| job_description_text | text | NOT NULL | JD 文本 |
| job_title | text | NULLABLE | 岗位标题 |
| job_category | text | NULLABLE | 岗位类别 |
| application_type | text | NULLABLE | `campus/internship/social` |
| focus_modules | jsonb | NOT NULL DEFAULT `'[]'::jsonb` | 用户选中的重点优化模块 |
| failure_reason | text | NULLABLE | 失败原因 |
| created_at | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| updated_at | timestamptz | NOT NULL DEFAULT now() | 更新时间 |

索引：

- `idx_analysis_sessions_user_id_created_at (user_id, created_at desc)`
- `idx_analysis_sessions_status_created_at (status, created_at desc)`
- `idx_analysis_sessions_job_category (job_category)`

---

## 4.3 `diagnosis_results`

用途：

- 存储分析诊断结果（每个会话最多一条）

字段：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | text | PK | 诊断结果 ID（`dr_xxx`） |
| session_id | text | UNIQUE, FK -> analysis_sessions.id | 会话 ID |
| match_score | int | NOT NULL | 匹配分（0-100） |
| summary | text | NOT NULL | 总结 |
| matched_keywords | jsonb | NOT NULL DEFAULT `'[]'::jsonb` | 命中关键词 |
| missing_keywords | jsonb | NOT NULL DEFAULT `'[]'::jsonb` | 缺失关键词 |
| risks | jsonb | NOT NULL DEFAULT `'[]'::jsonb` | 风险列表 |
| recommendations | jsonb | NOT NULL DEFAULT `'[]'::jsonb` | 建议列表 |
| model_version | text | NULLABLE | 模型版本追踪 |
| created_at | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| updated_at | timestamptz | NOT NULL DEFAULT now() | 更新时间 |

索引：

- `uk_diagnosis_results_session_id`
- `idx_diagnosis_results_match_score`

---

## 4.4 `optimization_results`

说明：

- 该表名与部分字段名属于历史命名，当前业务语义为“岗位定制改写结果”
- 为兼容既有数据与代码，暂不在数据库层重命名

用途：

- 存储岗位定制改写结果（每个会话最多一条）

字段：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | text | PK | 改写结果 ID（`or_xxx`） |
| session_id | text | UNIQUE, FK -> analysis_sessions.id | 会话 ID |
| before_score | int | NULLABLE | 改写前分数 |
| after_score | int | NULLABLE | 改写后分数 |
| rewrite_mode | text | NOT NULL DEFAULT `'balanced'` | 改写风格 |
| selected_modules | jsonb | NOT NULL DEFAULT `'[]'::jsonb` | 改写模块 |
| optimized_sections | jsonb | NOT NULL DEFAULT `'[]'::jsonb` | 分模块改写结果 |
| full_optimized_resume_text | text | NOT NULL | 改写后全文 |
| model_version | text | NULLABLE | 模型版本追踪 |
| created_at | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| updated_at | timestamptz | NOT NULL DEFAULT now() | 更新时间 |

索引：

- `uk_optimization_results_session_id`
- `idx_optimization_results_after_score`

---

## 4.5 `resume_versions`

用途：

- 用户保存的简历版本

字段：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | text | PK | 版本 ID（`rv_xxx`） |
| user_id | text | FK -> users.id | 所属用户 |
| session_id | text | FK -> analysis_sessions.id | 来源分析会话 |
| title | text | NOT NULL | 版本标题 |
| job_title | text | NULLABLE | 目标岗位标题 |
| job_category | text | NULLABLE | 目标岗位类别 |
| source_type | text | NOT NULL DEFAULT `'optimized'` | `original/rewritten/manual_edit`，其中 `optimized` 为历史枚举值 |
| resume_text | text | NOT NULL | 版本内容 |
| is_archived | boolean | NOT NULL DEFAULT false | 是否归档 |
| created_at | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| updated_at | timestamptz | NOT NULL DEFAULT now() | 更新时间 |

索引：

- `idx_resume_versions_user_id_created_at (user_id, created_at desc)`
- `idx_resume_versions_session_id`
- `idx_resume_versions_is_archived`

---

## 4.6 `export_jobs`

用途：

- 管理导出任务与下载链接

字段：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | text | PK | 导出任务 ID（`ex_xxx`） |
| user_id | text | FK -> users.id | 所属用户 |
| source_type | text | NOT NULL | `resume_version/analysis_result` |
| source_id | text | NOT NULL | 来源实体 ID |
| format | text | NOT NULL | `txt/pdf/docx` |
| status | text | NOT NULL | `PENDING/PROCESSING/SUCCEEDED/FAILED` |
| file_url | text | NULLABLE | 导出文件地址 |
| failure_reason | text | NULLABLE | 失败原因 |
| expired_at | timestamptz | NULLABLE | 下载链接过期时间 |
| created_at | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| updated_at | timestamptz | NOT NULL DEFAULT now() | 更新时间 |

索引：

- `idx_export_jobs_user_id_created_at (user_id, created_at desc)`
- `idx_export_jobs_source (source_type, source_id)`
- `idx_export_jobs_status_created_at (status, created_at desc)`

---

## 4.7 `payment_orders`

用途：

- 存储支付订单主记录

字段：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | text | PK | 订单 ID（`po_xxx`） |
| user_id | text | FK -> users.id | 所属用户 |
| session_id | text | FK -> analysis_sessions.id, NULLABLE | 关联分析会话 |
| product_code | text | NOT NULL | 商品编码 |
| product_name | text | NOT NULL | 商品名称 |
| currency | text | NOT NULL DEFAULT `'CNY'` | 币种 |
| amount_total | int | NOT NULL | 总金额（分） |
| amount_paid | int | NOT NULL DEFAULT 0 | 已支付金额（分） |
| status | text | NOT NULL | `CREATED/PAYING/PAID/CANCELED/REFUNDED/FAILED` |
| paid_at | timestamptz | NULLABLE | 支付时间 |
| created_at | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| updated_at | timestamptz | NOT NULL DEFAULT now() | 更新时间 |

索引：

- `idx_payment_orders_user_id_created_at (user_id, created_at desc)`
- `idx_payment_orders_status_created_at (status, created_at desc)`
- `idx_payment_orders_session_id`

---

## 4.8 `payment_records`

用途：

- 支付渠道流水和回调审计

字段：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | text | PK | 记录 ID（`pr_xxx`） |
| order_id | text | FK -> payment_orders.id | 订单 ID |
| channel | text | NOT NULL | `alipay/wechat/stripe` |
| channel_trade_no | text | NULLABLE | 渠道流水号 |
| event_type | text | NOT NULL | `PAY/REFUND/CALLBACK` |
| event_status | text | NOT NULL | 渠道返回状态 |
| raw_payload | jsonb | NOT NULL DEFAULT `'{}'::jsonb` | 原始回调 |
| created_at | timestamptz | NOT NULL DEFAULT now() | 创建时间 |

索引：

- `idx_payment_records_order_id_created_at (order_id, created_at desc)`
- `idx_payment_records_channel_trade_no`

---

## 4.9 `entitlement_ledgers`

用途：

- 用户权益流水（次数发放、消耗、退款回滚）

字段：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | text | PK | 权益流水 ID |
| user_id | text | FK -> users.id | 用户 ID |
| source_type | text | NOT NULL | `order/admin/promo/system` |
| source_id | text | NULLABLE | 来源 ID |
| entitlement_code | text | NOT NULL | 如 `OPTIMIZE_CREDIT` |
| delta | int | NOT NULL | 变动值（正负） |
| balance_after | int | NOT NULL | 变动后余额 |
| remark | text | NULLABLE | 备注 |
| created_at | timestamptz | NOT NULL DEFAULT now() | 创建时间 |

索引：

- `idx_entitlement_ledgers_user_id_created_at (user_id, created_at desc)`
- `idx_entitlement_ledgers_entitlement_code`

---

## 4.10 `decision_reports`（新增 — AIPM Copilot）

用途：

- 存储投递决策报告（每个会话最多一条）
- 包含 AIPM 能力模型的逐维度分析、面试轮次预判、2 周补齐方案

字段：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | text | PK | 报告 ID（`dp_xxx`） |
| session_id | text | UNIQUE, FK -> analysis_sessions.id | 会话 ID |
| recommendation | text | NOT NULL | `recommended/cautious/not_recommended` |
| recommendation_label | text | NOT NULL | 中文标签（建议投递/谨慎投递/暂不建议） |
| overall_match_score | int | NOT NULL | 综合匹配分（0-100） |
| one_liner | text | NOT NULL | 一句话结论 |
| dimensions_json | jsonb | NOT NULL | 各维度分析 JSON（DimensionAnalysis[]） |
| interview_pred_json | jsonb | NOT NULL | 面试轮次预判 JSON |
| two_week_plan_json | jsonb | NOT NULL | 补齐方案 JSON |
| model_version | text | NULLABLE | 模型版本追踪 |
| created_at | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| updated_at | timestamptz | NOT NULL DEFAULT now() | 更新时间 |

索引：

- `uk_decision_reports_session_id`
- `idx_decision_reports_recommendation`
- `idx_decision_reports_overall_match_score`

---

## 4.11 `interview_questions`（新增 — AIPM Copilot）

用途：

- 存储面试题库生成结果（每个会话可有多条）

字段：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | text | PK | 面试题 ID（`iq_xxx`） |
| session_id | text | FK -> analysis_sessions.id | 会话 ID |
| category | text | NOT NULL | 题目分类枚举 |
| question | text | NOT NULL | 题目内容 |
| why_asked | text | NOT NULL | 为什么可能被问到 |
| answer_framework | text | NOT NULL | 回答框架 |
| key_points | jsonb | NOT NULL DEFAULT '[]'::jsonb | 参考话术要点 |
| pitfalls | jsonb | NOT NULL DEFAULT '[]'::jsonb | 踩坑提醒 |
| created_at | timestamptz | NOT NULL DEFAULT now() | 创建时间 |

索引：

- `idx_interview_questions_session_id`
- `idx_interview_questions_category`

---

## 4.12 `analysis_sessions` 扩展字段（AIPM Copilot）

新增字段（追加到原有 `analysis_sessions` 表）：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| user_identity | text | NULLABLE | `career_changer/fresh_graduate` |
| current_role | text | NULLABLE | 用户当前岗位类型 |
| years_of_experience | int | NULLABLE | 工作年限 |

---

## 5. 建议约束与检查

建议增加检查约束：

- `diagnosis_results.match_score` 在 0 到 100
- `optimization_results.before_score` 在 0 到 100
- `optimization_results.after_score` 在 0 到 100
- `payment_orders.amount_total >= 0`
- `payment_orders.amount_paid >= 0`

建议对 `status` 字段使用 CHECK 或 PostgreSQL ENUM。

---

## 6. 审计与可观测性

建议全表统一：

- 保留 `created_at` 和 `updated_at`
- 关键写操作记录应用侧 `request_id`
- 关键 AI 输出保留 `model_version`

---

## 7. 分区与归档建议（P1 以后）

- `analysis_sessions`、`diagnosis_results`、`optimization_results` 量大后可按月份分区
- `payment_records` 可冷热分离
- `export_jobs` 文件链接过期后可异步清理

---

## 8. 初始化 SQL 草案

以下为示意 SQL（非完整迁移脚本）：

```sql
create table if not exists users (
  id text primary key,
  email text unique,
  phone text unique,
  nickname text,
  avatar_url text,
  auth_provider text not null default 'anonymous',
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists analysis_sessions (
  id text primary key,
  user_id text references users(id),
  status text not null,
  resume_text text not null,
  resume_file_url text,
  job_description_text text not null,
  job_title text,
  job_category text,
  application_type text,
  focus_modules jsonb not null default '[]'::jsonb,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists diagnosis_results (
  id text primary key,
  session_id text not null unique references analysis_sessions(id),
  match_score int not null check (match_score >= 0 and match_score <= 100),
  summary text not null,
  matched_keywords jsonb not null default '[]'::jsonb,
  missing_keywords jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  model_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists optimization_results (
  id text primary key,
  session_id text not null unique references analysis_sessions(id),
  before_score int check (before_score >= 0 and before_score <= 100),
  after_score int check (after_score >= 0 and after_score <= 100),
  rewrite_mode text not null default 'balanced',
  selected_modules jsonb not null default '[]'::jsonb,
  optimized_sections jsonb not null default '[]'::jsonb,
  full_optimized_resume_text text not null,
  model_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

## 9. 最小可落地表（MVP P0）

如果想最快上线 AIPM Copilot，最少先建这 6 张：

1. `users`
2. `analysis_sessions`（含新增的 user_identity / current_role / years_of_experience 字段）
3. `decision_reports`（投递决策报告 — 核心新功能）
4. `optimization_results`（简历改写结果）
5. `interview_questions`（面试题库）
6. `resume_versions`（版本保存）

支付、导出、权益相关表可放到 P1。
