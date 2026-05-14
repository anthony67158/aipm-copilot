"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { UserMenu } from "@/components/auth/user-menu";

const NAV_ITEMS = [
  { href: "/", label: "首页" },
  { href: "/copilot", label: "求职教练" },
  { href: "/pricing", label: "定价" },
  { href: "/dashboard/history", label: "历史记录" },
  { href: "/dashboard/orders", label: "我的订单" },
];

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isInCopilotFlow = pathname === "/copilot" || pathname.startsWith("/copilot/");

  return (
    <div className="min-h-screen bg-[#f5f6fb] text-slate-950">
      <header className="sticky top-0 z-30 bg-[#f5f6fb]/90 px-3 py-3 backdrop-blur-md md:px-6 md:py-4">
        <div className="aipm-nav-shell mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[22px] px-3 py-2.5 md:grid-cols-[minmax(180px,1fr)_auto_minmax(180px,1fr)] md:gap-4 md:rounded-[26px] md:px-5 md:py-3">
          <Link href="/" className="flex min-w-0 items-center gap-3 text-[18px] font-semibold leading-6 tracking-[-0.02em] text-[#0f172a]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#c7d2fe] bg-[#eef2ff] text-[13px] font-bold text-[#4f46e5]">
              AI
            </span>
            <span className="truncate">AIPM Copilot</span>
          </Link>

          <nav className="hidden items-center gap-2 lg:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
            ))}
          </nav>

          <div className="flex items-center justify-end gap-3">
            {!isInCopilotFlow ? (
              <Link href="/copilot" className="aipm-btn-primary aipm-focus hidden min-w-[150px] md:inline-flex">
                开始评估
              </Link>
            ) : null}
            <UserMenu />
          </div>
        </div>
        {!isInCopilotFlow ? (
          <nav className="mx-auto mt-2 flex max-w-[1200px] gap-2 overflow-x-auto px-1 pb-1 lg:hidden" aria-label="移动端导航">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
            ))}
          </nav>
        ) : null}
      </header>
      <main>{children}</main>
    </div>
  );
}

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} data-active={isActive} className="aipm-focus aipm-nav-link whitespace-nowrap">
      {label}
    </Link>
  );
}
