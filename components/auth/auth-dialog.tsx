"use client";

import { useState } from "react";
import { useAuth } from "./auth-provider";
import { IconBadge, ProductIcon } from "@/components/ui/product-icons";

export function AuthDialog() {
  const { authOpen, authMode, closeAuth, openAuth, login, register } = useAuth();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRegister = authMode === "register";

  function resetForm() {
    setNickname("");
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setSubmitting(false);
  }

  if (!authOpen) return null;

  async function handleSubmit() {
    if (!nickname.trim() || !password) {
      setError("请输入昵称和密码");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (isRegister) {
        await register(nickname.trim(), password);
      } else {
        await login(nickname.trim(), password);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-md sm:items-center sm:p-4">
      <div className="premium-card max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[28px] p-5 shadow-[0_30px_80px_rgba(15,23,42,0.24)] sm:rounded-[32px] sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-4">
            <IconBadge name="user" />
            <div>
              <div className="text-sm font-semibold text-indigo-700">{isRegister ? "创建账号" : "欢迎回来"}</div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{isRegister ? "保存报告与付费记录" : "继续你的求职流程"}</h2>
            </div>
          </div>
          <button
            onClick={() => { resetForm(); closeAuth(); }}
            className="premium-focus rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭登录弹窗"
          >
            <ProductIcon name="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 rounded-2xl border border-slate-200 bg-slate-100/80 p-1 text-sm">
          <button
            onClick={() => { resetForm(); openAuth("login"); }}
            className={`premium-focus rounded-xl px-3 py-2.5 font-medium transition ${!isRegister ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            登录
          </button>
          <button
            onClick={() => { resetForm(); openAuth("register"); }}
            className={`premium-focus rounded-xl px-3 py-2.5 font-medium transition ${isRegister ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            注册
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">个人昵称</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="输入 2-20 位昵称"
              className="premium-focus w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-base outline-none transition focus:border-indigo-300"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">设置密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入 6-32 位密码"
              className="premium-focus w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-base outline-none transition focus:border-indigo-300"
            />
          </div>
          {isRegister && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">确认密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                className="premium-focus w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-base outline-none transition focus:border-indigo-300"
              />
            </div>
          )}
        </div>

        {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="premium-focus mt-6 w-full rounded-2xl bg-[linear-gradient(135deg,#111827,#4f46e5_62%,#7c3aed)] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(79,70,229,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_42px_rgba(79,70,229,0.3)] disabled:translate-y-0 disabled:opacity-50"
        >
          {submitting ? (isRegister ? "注册中..." : "登录中...") : (isRegister ? "注册并继续" : "登录并继续")}
        </button>

        <p className="mt-3 text-center text-xs leading-6 text-slate-400">
          当前为极简账号体系，仅支持昵称 + 密码注册登录
        </p>
      </div>
    </div>
  );
}
