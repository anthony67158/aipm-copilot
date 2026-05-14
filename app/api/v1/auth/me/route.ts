import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { userStore, mapUser } from "@/lib/user-store";
import type { GetMeResponse } from "@/types/api";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      const data: GetMeResponse = { user: null };
      return NextResponse.json({ success: true, data, requestId: crypto.randomUUID() });
    }

    const user = await userStore.getById(userId);
    const data: GetMeResponse = { user: user ? mapUser(user) : null };
    return NextResponse.json({ success: true, data, requestId: crypto.randomUUID() });
  } catch (error) {
    console.error("get me failed:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "获取登录状态失败" }, requestId: crypto.randomUUID() },
      { status: 500 }
    );
  }
}
