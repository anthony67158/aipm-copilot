import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, setAuthCookie, signAuthToken } from "@/lib/auth";
import { mapUser } from "@/lib/user-store";
import type { AuthRequest, AuthResponse } from "@/types/api";

function validateNickname(nickname: string) {
  const trimmed = nickname.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    return "昵称长度需在 2-20 个字符之间";
  }
  if (!/^[\u4e00-\u9fa5A-Za-z0-9_]+$/.test(trimmed)) {
    return "昵称仅支持中文、英文、数字和下划线";
  }
  return null;
}

function validatePassword(password: string) {
  if (password.length < 6 || password.length > 32) {
    return "密码长度需在 6-32 个字符之间";
  }
  if (!password.trim()) {
    return "密码不能为空";
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AuthRequest>;
    const nickname = body.nickname?.trim() ?? "";
    const password = body.password ?? "";

    const nicknameError = validateNickname(nickname);
    if (nicknameError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: nicknameError }, requestId: crypto.randomUUID() },
        { status: 422 }
      );
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: passwordError }, requestId: crypto.randomUUID() },
        { status: 422 }
      );
    }

    const exists = await prisma.user.findUnique({ where: { nickname } });
    if (exists) {
      return NextResponse.json(
        { success: false, error: { code: "CONFLICT", message: "该昵称已被使用" }, requestId: crypto.randomUUID() },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        id: `user_${crypto.randomUUID()}`,
        nickname,
        passwordHash,
        authProvider: "password",
        status: "ACTIVE",
        lastLoginAt: new Date(),
      },
    });

    const token = await signAuthToken({ userId: user.id, nickname: user.nickname });
    await setAuthCookie(token);

    const data: AuthResponse = { user: mapUser(user) };
    return NextResponse.json({ success: true, data, requestId: crypto.randomUUID() });
  } catch (error) {
    console.error("register failed:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "注册失败，请稍后重试" }, requestId: crypto.randomUUID() },
      { status: 500 }
    );
  }
}
