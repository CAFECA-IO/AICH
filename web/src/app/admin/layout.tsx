import { SideShell } from "@/components/side_shell";

const items = [
  { href: "/admin", label: "監控總覽" },
  { href: "/admin/tokens", label: "AI Token 託管" },
  { href: "/admin/pricing", label: "ISC 計價" },
  { href: "/admin/providers", label: "供應商（進階）" },
  { href: "/admin/models", label: "模型映射" },
  { href: "/admin/users", label: "用戶管理" },
  { href: "/admin/logs", label: "請求日誌" },
  { href: "/admin/settings", label: "方案與風控設定" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SideShell items={items} admin>
      {children}
    </SideShell>
  );
}
