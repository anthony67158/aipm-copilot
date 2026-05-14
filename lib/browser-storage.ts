"use client";

const PAID_SESSIONS_KEY = "aipm_paid_sessions";
const LOCAL_SESSIONS_KEY = "aipm_local_sessions";

function readSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const value = JSON.parse(raw) as string[];
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, value: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(Array.from(value)));
}

export function readPaidSessions(): Set<string> {
  return readSet(PAID_SESSIONS_KEY);
}

export function markSessionPaid(sessionId: string) {
  const paid = readPaidSessions();
  paid.add(sessionId);
  writeSet(PAID_SESSIONS_KEY, paid);
}

export function readLocalSessions(): Set<string> {
  return readSet(LOCAL_SESSIONS_KEY);
}

export function rememberLocalSession(sessionId: string) {
  const sessions = readLocalSessions();
  sessions.add(sessionId);
  writeSet(LOCAL_SESSIONS_KEY, sessions);
}

export function clearLocalSessions() {
  writeSet(LOCAL_SESSIONS_KEY, new Set());
}

export function clearPaidSessions() {
  writeSet(PAID_SESSIONS_KEY, new Set());
}
