"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { CafecaButton } from "@/components/cafeca_button";
import { Logo } from "@/components/top_nav";
import { Button, Card, ErrorNote, Input, Label } from "@/components/ui";
import { useAuth } from "@/lib/auth_context";
import type { CafecaLoginResult } from "@/lib/cafeca";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login, register, adopt } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const nextParam = params.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/chat";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const onCafeca = useCallback(
    (r: unknown) => {
      const res = r as CafecaLoginResult;
      adopt(res.token, res.user);
      router.replace(next);
    },
    [adopt, router, next],
  );

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo />
          <h1 className="text-lg font-semibold">{mode === "login" ? "登入 AICH" : "建立帳號"}</h1>
          <p className="text-center text-xs text-muted">
            {mode === "register" ? "註冊即贈送免費點數，可立即在網頁上使用基礎模型。" : "使用 CAFECA 數位身分，以 Passkey 一鍵登入，免帳號密碼。"}
          </p>
        </div>

        <CafecaButton
          purpose="login"
          label={mode === "login" ? "以 CAFECA 登入" : "以 CAFECA 建立帳號"}
          next={next}
          onDone={onCafeca}
          onError={setError}
          variant="primary"
          className="w-full"
        />
        <p className="mt-2 text-center text-[11px] text-muted">
          首次使用會自動建立 AICH 帳號。還沒有 CAFECA？
          <a className="text-accent" href="https://cafeca.io" target="_blank" rel="noreferrer">
            {" "}
            前往 cafeca.io 建立
          </a>
        </p>

        <div className="my-5 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-border" />
          或使用 Email
          <span className="h-px flex-1 bg-border" />
        </div>

        {!showEmail ? (
          <Button variant="ghost" className="w-full border border-border" onClick={() => setShowEmail(true)}>
            {mode === "login" ? "以 Email 與密碼登入" : "以 Email 註冊"}
          </Button>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div>
                <Label>名稱</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
            )}
            <div>
              <Label>Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
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
            <Button type="submit" disabled={busy} variant="secondary" className="w-full">
              {busy ? "處理中…" : mode === "login" ? "登入" : "註冊"}
            </Button>
          </form>
        )}
        <div className="mt-4">
          <ErrorNote error={error} />
        </div>
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
