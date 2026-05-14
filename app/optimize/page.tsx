import Link from "next/link";

export default function OptimizePage() {
  return (
    <div className="mx-auto max-w-4xl px-3 py-6 sm:px-6 sm:py-12 md:py-16">
      <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5 sm:rounded-[28px] sm:p-8 md:p-10">
        <div className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm text-indigo-700">
          产品升级提示
        </div>
        <h1 className="mt-4 text-[30px] font-semibold leading-9 tracking-tight text-slate-950 sm:text-4xl">简历优化已并入求职教练</h1>
        <p className="mt-4 text-base leading-8 text-slate-600">
          现在你可以在同一个流程里完成简历预处理、岗位诊断、定制改写、面试预测题和 Word 导出，不需要在两个页面之间来回切换。
        </p>
        <div className="mt-8 space-y-4">
          {[
            "先上传或粘贴简历，完成简历预处理和 AI 结构整理",
            "再输入目标岗位和公司，生成投递决策报告",
            "投递决策免费查看；需要继续推进时，再解锁定制改写、面试题和 Word 文档",
          ].map((point) => (
            <div key={point} className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-700">
              {point}
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/copilot"
            className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            前往求职教练
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            查看产物包定价
          </Link>
        </div>
      </div>
    </div>
  );
}
