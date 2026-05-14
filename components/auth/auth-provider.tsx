"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearLocalSessions, clearPaidSessions, readLocalSessions, readPaidSessions } from "@/lib/browser-storage";
import type { AuthResponse, GetMeResponse, User } from "@/types/api";

type AuthMode = "login" | "register";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authOpen: boolean;
  authMode: AuthMode;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  register: (nickname: string, password: string) => Promise<void>;
  login: (nickname: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseAuthResponse(response: Response) {
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.error?.message ?? "请求失败");
  }
  return payload.data as AuthResponse;
}

async function claimAnonymousSessions() {
  const sessionIds = Array.from(readLocalSessions());
  const paidSessionIds = Array.from(readPaidSessions());
  if (sessionIds.length === 0 && paidSessionIds.length === 0) {
    return;
  }

  const response = await fetch("/api/v1/auth/claim-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionIds, paidSessionIds }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.error?.message ?? "认领历史报告失败");
  }

  clearLocalSessions();
  clearPaidSessions();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/auth/me", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error?.message ?? "获取登录状态失败");
      }
      const data = payload.data as GetMeResponse;
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const register = useCallback(async (nickname: string, password: string) => {
    const response = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, password }),
    });
    const data = await parseAuthResponse(response);
    await claimAnonymousSessions();
    setUser(data.user);
    setAuthOpen(false);
  }, []);

  const login = useCallback(async (nickname: string, password: string) => {
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, password }),
    });
    const data = await parseAuthResponse(response);
    await claimAnonymousSessions();
    setUser(data.user);
    setAuthOpen(false);
  }, []);

  const logout = useCallback(async () => {
    const response = await fetch("/api/v1/auth/logout", { method: "POST" });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error?.message ?? "退出登录失败");
    }
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      authOpen,
      authMode,
      openAuth: (mode = "login") => {
        setAuthMode(mode);
        setAuthOpen(true);
      },
      closeAuth: () => setAuthOpen(false),
      register,
      login,
      logout,
      refreshUser,
    }),
    [authMode, authOpen, loading, login, logout, refreshUser, register, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
