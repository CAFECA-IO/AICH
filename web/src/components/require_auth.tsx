"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth_context";

export function RequireAuth({ admin = false, children }: { admin?: boolean; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }, [loading, user, router]);
  if (loading || !user) return <div className="p-10 text-center text-sm text-muted">載入中…</div>;
  if (admin && user.role !== "admin") return <div className="p-10 text-center text-sm text-muted">此頁面僅限管理員。</div>;
  return <>{children}</>;
}
