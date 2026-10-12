import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth_context";
import { BillingProvider } from "@/lib/billing_context";

export const metadata: Metadata = {
  title: "AICH · AI Computing Hub",
  description: "一把金鑰，通用全網 AI 模型：統一 API、智能路由、自動備援與統一的 ISC 計價。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen">
        <AuthProvider>
          <BillingProvider>{children}</BillingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
