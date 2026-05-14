import Link from "next/link";
import { IconBadge, ProductIcon } from "@/components/ui/product-icons";

export function SimplePage({
  badge,
  title,
  description,
  points,
}: {
  badge: string;
  title: string;
  description: string;
  points: string[];
}) {
  return (
    <div className="mx-auto max-w-4xl px-3 py-6 sm:px-4 sm:py-10 md:px-8 md:py-16">
      <div className="premium-panel rounded-[24px] p-5 sm:rounded-[32px] sm:p-8 md:p-10">
        <IconBadge name="spark" />
        <div className="mt-5 inline-flex rounded-full border border-indigo-200 bg-white/80 px-3 py-1.5 text-sm font-semibold text-indigo-700 shadow-sm">{badge}</div>
        <h1 className="mt-5 text-[30px] font-semibold leading-9 tracking-[-0.04em] text-slate-950 sm:text-4xl md:text-5xl">{title}</h1>
        <p className="mt-5 text-base leading-8 text-slate-600 md:text-lg">{description}</p>
        <div className="mt-8 space-y-4">
          {points.map((point) => (
            <div key={point} className="flex gap-3 rounded-2xl border border-slate-200 bg-white/76 px-5 py-4 text-base leading-8 text-slate-700">
              <ProductIcon name="check" className="mt-1 h-5 w-5 shrink-0 text-emerald-600" />
              {point}
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Link href="/copilot" className="premium-focus inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:w-auto">
            去体验主流程
            <ProductIcon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
