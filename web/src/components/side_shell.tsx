"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TopNav } from "@/components/top_nav";
import { RequireAuth } from "@/components/require_auth";

export interface NavItem {
  href: string;
  label: string;
}

export function SideShell({ items, admin = false, children }: { items: NavItem[]; admin?: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const root = items[0]?.href;
  return (
    <RequireAuth admin={admin}>
      <TopNav />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row">
        <aside className="md:w-52 md:shrink-0">
          <nav className="flex gap-1 overflow-x-auto md:sticky md:top-20 md:flex-col">
            {items.map((i) => {
              const active = i.href === root ? path === i.href : path?.startsWith(i.href);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-text"}`}
                >
                  {i.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </RequireAuth>
  );
}
