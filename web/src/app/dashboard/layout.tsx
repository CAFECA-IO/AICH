import { SideShell } from "@/components/side_shell";

const items = [
  { href: "/dashboard", label: "總覽" },
  { href: "/dashboard/keys", label: "API 金鑰" },
  { href: "/dashboard/usage", label: "用量與帳務" },
  { href: "/dashboard/models", label: "模型與價格" },
  { href: "/dashboard/settings", label: "帳號與方案" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <SideShell items={items}>{children}</SideShell>;
}
