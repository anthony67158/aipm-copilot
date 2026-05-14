import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SiteShell } from "@/components/site-shell";
import { AuthProvider } from "@/components/auth/auth-provider";
import { AuthDialog } from "@/components/auth/auth-dialog";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AIPM Copilot | AI 产品经理求职教练",
  description: "想转岗 AI 产品经理？上传简历和 JD，获得投递决策、能力诊断、AIPM 语言改写和面试预测题。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={plusJakartaSans.className}>
        <AuthProvider>
          <SiteShell>{children}</SiteShell>
          <AuthDialog />
        </AuthProvider>
      </body>
    </html>
  );
}
