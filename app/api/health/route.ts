import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();
  const checks = {
    database: "unknown",
    llmApiKey: Boolean(process.env.OPENAI_API_KEY),
    llmBaseUrl: Boolean(process.env.OPENAI_BASE_URL),
    authSecret: Boolean(process.env.AUTH_SECRET),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const healthy = checks.database === "ok" && checks.llmApiKey && checks.authSecret;

  return NextResponse.json(
    {
      ok: healthy,
      service: "aipm-copilot",
      environment: process.env.NODE_ENV ?? "unknown",
      uptime: process.uptime(),
      latencyMs: Date.now() - startedAt,
      checks,
    },
    { status: healthy ? 200 : 503 },
  );
}
