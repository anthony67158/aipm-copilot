import Link from "next/link";

const freeFeatures = ["简历 PDF 解析", "AI 结构整理", "投递决策报告", "匹配分、推荐结论和关键理由"];
const paidFeatures = ["岗位定制简历改写", "面试预测题生成", "单题完整回答包", "Word 简历导出", "历史记录中继续处理本次求职包"];

export default function PricingPage() {
  return (
    <div className="aipm-page">
      <section className="aipm-hero-card p-5 sm:p-7 md:p-10">
        <span className="aipm-pill w-fit">MONETIZATION &amp; DASHBOARD</span>
        <h1 className="aipm-title-xl mt-6 max-w-[760px]">
          投递决策免费查看，¥6.6 解锁求职产物
        </h1>
        <p className="mt-5 max-w-[720px] text-[17px] leading-7 text-[#64748b]">
          先免费判断这份岗位值不值得投；确认要继续推进时，再按本次岗位解锁定制简历、面试题、回答包和 Word 导出。
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <MetricCard label="免费可看" value="投递决策" sub="匹配分、结论、关键风险直接展示" />
          <MetricCard label="付费解锁" value="¥6.6" sub="按本次岗位解锁，不做订阅夸大" />
          <MetricCard label="继续处理" value="简历 / 面试" sub="改写、预测题、回答包和导出" />
        </div>
      </section>

      <section className="aipm-section grid gap-4 sm:gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <PricingCard title="免费投递决策" price="¥0" features={freeFeatures} href="/copilot" action="免费生成决策" />
        <PricingCard title="岗位求职产物包" price="¥6.6 / 次岗位" features={paidFeatures} href="/copilot" action="解锁产物生成" featured />
      </section>

      <section className="mt-6 grid gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <article className="aipm-subtle-card p-5 sm:p-[27px]">
          <div className="aipm-kicker">History Preview</div>
          <h2 className="mt-2 text-[24px] font-semibold leading-8 text-[#0f172a]">历史记录：决策与产物状态</h2>
          <div className="mt-5 space-y-3">
            {[
              "字节跳动 · AI 产品经理 / 谨慎投递 / 58 分 / 已解锁产物",
              "百度 · 大模型产品实习 / 建议投递 / 76 分 / 决策免费",
              "腾讯云 · AI 应用产品 / 暂不建议 / 42 分 / 决策免费",
            ].map((item, index) => (
              <div key={item} className={`grid min-h-12 gap-2 rounded-xl border border-[#e2e8f0] px-[15px] py-3 text-[13px] leading-[18px] sm:grid-cols-[minmax(0,1fr)_80px] sm:items-center sm:py-0 ${index % 2 ? "bg-[#f8fafc]" : "bg-white"}`}>
                <span className="min-w-0 font-medium text-[#0f172a] sm:truncate">{item}</span>
                <Link href="/dashboard/history" className="font-semibold text-[#4f46e5]">查看报告</Link>
              </div>
            ))}
          </div>
        </article>

        <article className="aipm-subtle-card p-5 sm:p-[27px]">
          <div className="aipm-kicker">Order Preview</div>
          <h2 className="mt-2 text-[24px] font-semibold leading-8 text-[#0f172a]">订单状态</h2>
          <div className="mt-6 space-y-7">
            <OrderRow status="PAID" tone="success" />
            <OrderRow status="CREATED" tone="warning" />
          </div>
        </article>
      </section>
    </div>
  );
}

function PricingCard({ title, price, features, href, action, featured = false }: { title: string; price: string; features: string[]; href: string; action: string; featured?: boolean }) {
  return (
    <article className={`rounded-[24px] border p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)] sm:rounded-[28px] sm:p-[27px] ${featured ? "border-[#4f46e5] bg-[#eef2ff]" : "border-[#e2e8f0] bg-white"}`}>
      <h2 className="text-[18px] font-semibold leading-6 text-[#0f172a]">{title}</h2>
      <div className="mt-2 text-[32px] font-semibold leading-10 tracking-[-0.04em] text-[#0f172a] sm:text-[38px] sm:leading-[48px]">{price}</div>
      <ul className="mt-6 space-y-5">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-3 text-[13px] font-medium leading-[18px] text-[#64748b]">
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-[#4f46e5] text-[12px] font-bold leading-[14px] text-white">✓</span>
            {feature}
          </li>
        ))}
      </ul>
      <Link href={href} className={`${featured ? "aipm-btn-primary" : "aipm-btn-secondary"} mt-8 w-full justify-center px-[17px] sm:mt-12 sm:justify-start`}>
        {action}
      </Link>
    </article>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[20px] border border-[#e2e8f0] bg-[#f8fafc] p-5">
      <div className="text-sm font-semibold text-[#64748b]">{label}</div>
      <div className="mt-2 text-[24px] font-semibold leading-8 tracking-[-0.02em] text-[#0f172a]">{value}</div>
      <div className="mt-1 text-sm leading-6 text-[#94a3b8]">{sub}</div>
    </div>
  );
}

function OrderRow({ status, tone }: { status: string; tone: "success" | "warning" }) {
  return (
    <div className="grid gap-2 rounded-[16px] border border-[#e2e8f0] bg-white p-3 sm:grid-cols-[90px_80px_minmax(0,1fr)] sm:items-center sm:gap-5 sm:border-0 sm:bg-transparent sm:p-0">
      <span className={`aipm-pill justify-center ${tone === "success" ? "bg-[#ecfdf5] text-[#0f766e]" : "bg-[#fffbeb] text-[#d97706]"}`}>{status}</span>
      <span className="text-[18px] font-semibold leading-6 text-[#0f172a]">¥6.6</span>
      <span className="text-[13px] font-medium leading-[18px] text-[#64748b]">job_package</span>
    </div>
  );
}
