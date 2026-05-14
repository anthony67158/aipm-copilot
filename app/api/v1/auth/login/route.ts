import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setAuthCookie, signAuthToken, verifyPassword } from "@/lib/auth";
import { mapUser } from "@/lib/user-store";
import type { AuthRequest, AuthResponse } from "@/types/api";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AuthRequest>;
    const nickname = body.nickname?.trim() ?? "";
    const password = body.password ?? "";

    if (!nickname || !password) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "请输入昵称和密码" }, requestId: crypto.randomUUID() },
        { status: 422 }
      );
    }

    const user = await prisma.user.findUnique({ where: { nickname } });
    if (!user?.passwordHash) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "昵称或密码错误" }, requestId: crypto.randomUUID() },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "昵称或密码错误" }, requestId: crypto.randomUUID() },
        { status: 401 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await signAuthToken({ userId: updatedUser.id, nickname: updatedUser.nickname });
    await setAuthCookie(token);

    const data: AuthResponse = { user: mapUser(updatedUser) };
    return NextResponse.json({ success: true, data, requestId: crypto.randomUUID() });
  } catch (error) {
    console.error("login failed:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "登录失败，请稍后重试" }, requestId: crypto.randomUUID() },
      { status: 500 }
    );
  }
}
