import Link from "next/link";

const capabilities = [
  { no: "01", title: "投递决策引擎", desc: "综合匹配分、推荐等级、一句话判断" },
  { no: "02", title: "7 维能力诊断", desc: "能力雷达、差距证据、补齐建议" },
  { no: "03", title: "求职产物生成", desc: "岗位定制简历、面试题、Word 导出" },
];

const dimensions = [
  { name: "AI 技术理解力", status: "差距明显", value: 42, tone: "#e11d48" },
  { name: "产品设计力", status: "已达标", value: 76, tone: "#0f766e" },
  { name: "数据驱动力", status: "接近达标", value: 64, tone: "#d97706" },
  { name: "项目推进力", status: "优势", value: 80, tone: "#0f766e" },
  { name: "商业感知力", status: "接近达标", value: 56, tone: "#d97706" },
  { name: "AI 应用落地力", status: "差距明显", value: 38, tone: "#e11d48" },
  { name: "沟通表达力", status: "已达标", value: 72, tone: "#0f766e" },
];

const facts = ["投递决策免费查看", "¥6.6 解锁求职产物", "事实护栏保障改写可信"];

const scenarios = [
  {
    title: "转岗者",
    desc: "运营、研发、数据、设计等角色转向 AIPM 时，先判断旧经历能否被翻译成岗位需要的证据。",
  },
  {
    title: "应届生 / 实习生",
    desc: "课程项目、实习和 Demo 更需要被整理成可讲的案例，而不是堆砌概念关键词。",
  },
];

export function HomePage() {
  return (
    <div className="aipm-page">
      <section className="aipm-hero lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:items-stretch">
        <div className="aipm-hero-card h-full p-5 sm:p-7 md:p-10">
          <span className="aipm-pill w-fit">LANDING PAGE</span>
          <h1 className="aipm-title-xl mt-6 max-w-[720px]">
            想做 AI 产品经理？先判断这份岗位值不值得投
          </h1>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Link href="/copilot" className="aipm-btn-primary w-full sm:w-[172px]">免费开始评估</Link>
            <Link href="/pricing" className="aipm-btn-secondary w-full sm:w-[210px]">查看产物包定价</Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {facts.map((fact) => (
              <span key={fact} className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-4 py-2 text-sm font-medium text-[#475569]">
                {fact}
              </span>
            ))}
          </div>
        </div>

        <div className="flex h-full flex-col rounded-[24px] bg-[#020617] p-5 text-white shadow-[0_14px_34px_rgba(15,23,42,0.08)] sm:p-8 lg:min-h-[388px] lg:rounded-[32px]">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="text-[13px] font-semibold leading-[18px] text-[#94a3b8]">投递决策示例</div>
              <span className="aipm-pill bg-[#eef2ff] text-[#4f46e5]">谨慎投递</span>
            </div>
            <h2 className="mt-5 max-w-[467px] text-[24px] font-semibold leading-8 tracking-[-0.03em] sm:text-[30px] sm:leading-[38px]">
              这份岗位可以冲，但要先补齐关键能力
            </h2>
            <p className="mt-3 max-w-[360px] text-[15px] leading-6 text-[#cbd5e1]">
              产品设计力与项目推进力达标；AI 技术理解力、AI 应用落地力不足。
            </p>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3 lg:mt-auto lg:gap-[14px]">
            <PreviewStat label="匹配分" value="58" sub="/100" />
            <PreviewStat label="已达标" value="2" sub="能力项" />
            <PreviewStat label="需补齐" value="3" sub="能力项" />
          </div>
        </div>
      </section>

      <section className="aipm-section grid gap-6 md:grid-cols-3">
        {capabilities.map((item) => (
          <article key={item.no} className="aipm-subtle-card p-5 sm:p-[27px] md:min-h-[220px]">
            <span className="aipm-pill min-w-[58px] justify-center">{item.no}</span>
            <h2 className="mt-4 text-[24px] font-semibold leading-8 tracking-[-0.02em] text-[#0f172a]">{item.title}</h2>
            <p className="mt-2 text-[16px] leading-[26px] text-[#64748b]">{item.desc}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
        <article className="aipm-hero-card p-5 sm:p-[31px]">
          <div className="aipm-kicker">真实能力模型</div>
          <h2 className="mt-2 text-[26px] font-semibold leading-[34px] tracking-[-0.02em] text-[#0f172a]">AIPM 7 维能力模型</h2>
          <p className="mt-1 text-[16px] leading-[26px] text-[#64748b]">只预览当前产品真实支持的 7 维判断，不延展课程体系或虚构成长路径。</p>
          <div className="mt-6 space-y-4 sm:mt-8 sm:space-y-[18px]">
            {dimensions.map((dim) => (
              <div key={dim.name} className="grid gap-2 rounded-[16px] border border-[#e2e8f0] bg-white p-3 sm:grid-cols-[140px_minmax(120px,1fr)_80px] sm:items-center sm:gap-4 sm:border-0 sm:bg-transparent sm:p-0">
                <div className="text-[14px] font-semibold leading-5 text-[#0f172a] sm:text-[13px] sm:leading-[18px]">{dim.name}</div>
                <div className="h-2.5 rounded-full bg-[#f1f5f9] sm:h-2">
                  <div className="h-full rounded-full" style={{ width: `${dim.value}%`, backgroundColor: dim.tone }} />
                </div>
                <div className="text-[13px] font-medium leading-5 text-[#64748b] sm:text-[12px] sm:leading-[17px]">{dim.status}</div>
              </div>
            ))}
          </div>
        </article>

        <article className="aipm-hero-card p-5 sm:p-[31px]">
          <div className="aipm-kicker">两类用户场景</div>
          <h2 className="mt-2 text-[26px] font-semibold leading-[34px] tracking-[-0.02em] text-[#0f172a]">同一个工作台，服务两种真实求职情境</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <span className="aipm-pill">转岗者</span>
            <span className="aipm-pill bg-[#ecfdf5] text-[#0f766e]">应届生/实习生</span>
          </div>
          <div className="mt-8 space-y-4">
            {scenarios.map((scenario) => (
              <div key={scenario.title} className="rounded-[24px] border border-[#e2e8f0] bg-[#f8fafc] p-5">
                <div className="text-[17px] font-semibold leading-[26px] text-[#0f172a]">{scenario.title}</div>
                <p className="mt-2 text-[16px] leading-[26px] text-[#64748b]">{scenario.desc}</p>
              </div>
            ))}
          </div>
          <div className="my-8 h-px bg-[#e2e8f0]" />
          <div className="rounded-[24px] border border-[#bbf7d0] bg-[#ecfdf5] p-5">
            <div className="text-sm font-semibold text-[#0f766e]">事实护栏</div>
            <p className="mt-2 text-[16px] font-semibold leading-[26px] text-[#0f172a]">
              改写不会新增原简历没有的经历、数字或专有名词。
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}

function PreviewStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[18px] border border-[#e2e8f0] bg-white p-4 text-[#0f172a] shadow-[0_14px_34px_rgba(15,23,42,0.08)] sm:rounded-[20px] sm:p-[17px]">
      <div className="text-[12px] font-medium leading-4 text-[#64748b]">{label}</div>
      <div className="mt-2 text-[28px] font-semibold leading-9 tracking-[-0.03em]">{value}</div>
      <div className="text-[12px] leading-4 text-[#94a3b8]">{sub}</div>
    </div>
  );
}
