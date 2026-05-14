"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "./auth-provider";
import { ProductIcon } from "@/components/ui/product-icons";

export function UserMenu() {
  const { user, loading, openAuth, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) {
    return <div className="h-10 w-24 animate-pulse rounded-2xl bg-slate-100" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => openAuth("login")}
          className="premium-focus rounded-2xl border border-slate-200 bg-white/70 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white sm:px-4"
        >
          登录
        </button>
        <button
          onClick={() => openAuth("register")}
          className="premium-focus hidden rounded-2xl bg-slate-950 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 min-[380px]:inline-flex sm:px-4"
        >
          注册
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen((value) => !value)}
        className="premium-focus inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/76 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
          {(user.nickname ?? "U").slice(0, 1)}
        </span>
        <span className="hidden sm:inline">{user.nickname ?? "用户"}</span>
        <ProductIcon name="chevron-down" className={`h-4 w-4 text-slate-400 transition ${menuOpen ? "rotate-180" : ""}`} />
      </button>
      {menuOpen && (
        <div className="premium-card absolute right-0 top-12 z-20 w-48 rounded-3xl p-2">
          <Link
            href="/dashboard/history"
            className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <ProductIcon name="history" className="h-4 w-4 text-slate-400" />
            我的报告
          </Link>
          <Link
            href="/dashboard/orders"
            className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <ProductIcon name="order" className="h-4 w-4 text-slate-400" />
            我的订单
          </Link>
          <button
            onClick={async () => {
              await logout();
              setMenuOpen(false);
            }}
            className="block w-full rounded-2xl px-3 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
