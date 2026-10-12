"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/top_nav";
import { Button, Card, ErrorNote, Input, Label } from "@/components/ui";
import { useAuth } from "@/lib/auth_context";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name);
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo />
          <h1 className="text-lg font-semibold">{mode === "login" ? "登入 AICH" : "建立帳號"}</h1>
          {mode === "register" && <p className="text-center text-xs text-muted">註冊即贈送免費點數，可立即在網頁上使用基礎模型。</p>}
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && (
            <div>
              <Label>名稱</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
          )}
          <div>
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <Label hint={mode === "register" ? "至少 8 個字元" : undefined}>密碼</Label>
            <Input
              type="password"
              required
              minLength={mode === "register" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          <ErrorNote error={error} />
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "處理中…" : mode === "login" ? "登入" : "註冊"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          {mode === "login" ? (
            <>
              還沒有帳號？ <Link className="text-accent" href="/register">免費註冊</Link>
            </>
          ) : (
            <>
              已經有帳號？ <Link className="text-accent" href="/login">登入</Link>
            </>
          )}
        </p>
      </Card>
    </div>
  );
}
