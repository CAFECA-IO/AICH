"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/top_nav";
import { Card } from "@/components/ui";
import { useAuth } from "@/lib/auth_context";
import { cafecaErrorMessage, completeCafecaRedirect, type CafecaLoginResult } from "@/lib/cafeca";

/** Return page for the full-page (mobile) CAFECA flow: the wallet appends #cafeca=<result>. */
export default function CafecaCallback() {
  const { adopt, refresh } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    completeCafecaRedirect()
      .then(async (out) => {
        if (!out) {
          router.replace("/login");
          return;
        }
        if (out.purpose === "login") {
          const r = out.result as CafecaLoginResult;
          adopt(r.token, r.user);
          if (r.created && r.user.role === "admin") {
            router.replace("/admin/tokens?welcome=1");
            return;
          }
        } else {
          await refresh();
        }
        router.replace(out.next.startsWith("/") && !out.next.startsWith("//") ? out.next : "/chat");
      })
      .catch((e) => setError(cafecaErrorMessage(e) ?? "已取消登入"));
  }, [adopt, refresh, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm text-center">
        <div className="mb-4 flex justify-center">
          <Logo />
        </div>
        {error ? (
          <>
            <p className="text-sm text-danger">{error}</p>
            <Link href="/login" className="mt-4 inline-block text-sm text-accent">
              回到登入頁
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted">正在驗證 CAFECA 身分…</p>
        )}
      </Card>
    </div>
  );
}
