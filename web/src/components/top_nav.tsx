"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth_context";
import { fmtIsc, fmtIscCompact } from "@/lib/format";

const links = [
  { href: "/chat", label: "聊天" },
  { href: "/dashboard", label: "控制台" },
  { href: "/docs", label: "開發文件" },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-xs font-bold text-accent-fg">AI</span>
      <span>AICH</span>
    </Link>
  );
}

export function TopNav() {
  const { user, logout } = useAuth();
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-4">
        <Logo />
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-md px-2.5 py-1.5 ${path?.startsWith(l.href) ? "bg-surface-2 font-medium" : "text-muted hover:text-text"}`}
            >
              {l.label}
            </Link>
          ))}
          {user?.role === "admin" && (
            <Link href="/admin" className={`whitespace-nowrap rounded-md px-2.5 py-1.5 ${path?.startsWith("/admin") ? "bg-surface-2 font-medium" : "text-muted hover:text-text"}`}>
              管理後台
            </Link>
          )}
        </nav>
        {user ? (
          <div className="flex shrink-0 items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline" title={`餘額 ${fmtIsc(user.credit_balance)}`}>
              {fmtIscCompact(user.credit_balance)} · {user.plan?.name}
            </span>
            <button onClick={logout} className="whitespace-nowrap rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-text">
              登出
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2 text-sm">
            <Link href="/login" className="whitespace-nowrap rounded-md px-3 py-1.5 text-muted hover:text-text">
              登入
            </Link>
            <Link href="/register" className="whitespace-nowrap rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg">
              免費開始
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
