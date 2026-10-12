"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ErrorNote, Input, Label, Modal, PageHeader, Select, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtNumber } from "@/lib/format";
import type { Plan } from "@/lib/types";

interface AdminUserRow {
  id: string;
  email: string | null;
  name: string;
  cafeca_account: string | null;
  cafeca_handle: string | null;
  role: string;
  status: string;
  plan_id: string;
  plan_renews_at: string | null;
  credit_balance: number;
  zero_data_retention: boolean;
  created_at: string;
  active_keys: number;
  credits_30d: number;
}

export default function UsersAdmin() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [credit, setCredit] = useState<null | { user: AdminUserRow; delta: string; reason: string }>(null);

  const load = useCallback(() => {
    api<{ data: AdminUserRow[] }>(`/admin/users?limit=200&q=${encodeURIComponent(q)}`)
      .then((r) => setUsers(r.data))
      .catch((e) => setError(e.message));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    api<{ data: Plan[] }>("/api/plans").then((r) => setPlans(r.data));
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/admin/users/${id}`, { method: "PATCH", body });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="用戶管理" description="調整方案（會發放該方案的當月點數）、角色、停權與點數加減。" actions={<Input placeholder="搜尋 email / 名稱 / CAFECA" value={q} onChange={(e) => setQ(e.target.value)} className="w-60" />} />
      <ErrorNote error={error} />
      <Table head={["用戶", "方案", "角色", "狀態", "點數餘額", "30 天消耗", "金鑰", "ZDR", "註冊", ""]} empty={users.length === 0}>
        {users.map((u) => (
          <tr key={u.id}>
            <td className="px-3 py-2">
              <div className="font-medium">{u.email ?? (u.cafeca_handle ? `@${u.cafeca_handle}` : u.name)}</div>
              <div className="text-xs text-muted">
                {u.name}
                {u.cafeca_account && (
                  <span className="ml-1 font-mono" title={u.cafeca_account}>
                    · CAFECA {u.cafeca_account.slice(0, 6)}…{u.cafeca_account.slice(-4)}
                  </span>
                )}
              </div>
            </td>
            <td className="px-3 py-2">
              <Select value={u.plan_id} onChange={(e) => confirm(`將 ${u.email ?? u.name} 改為 ${e.target.value} 方案並發放點數？`) && patch(u.id, { plan_id: e.target.value })}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </td>
            <td className="px-3 py-2">
              <Select value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </Select>
            </td>
            <td className="px-3 py-2">
              <button onClick={() => patch(u.id, { status: u.status === "active" ? "suspended" : "active" })}>
                <Badge tone={u.status === "active" ? "success" : "danger"}>{u.status}</Badge>
              </button>
            </td>
            <td className={`px-3 py-2 tabular-nums ${u.credit_balance < 0 ? "text-danger" : ""}`}>{fmtNumber(u.credit_balance)}</td>
            <td className="px-3 py-2 tabular-nums">{fmtNumber(u.credits_30d)}</td>
            <td className="px-3 py-2 tabular-nums">{u.active_keys}</td>
            <td className="px-3 py-2">{u.zero_data_retention ? "✓" : ""}</td>
            <td className="px-3 py-2 text-xs text-muted">{fmtDate(u.created_at)}</td>
            <td className="px-3 py-2">
              <Button variant="ghost" className="text-xs" onClick={() => setCredit({ user: u, delta: "", reason: "" })}>
                加減點數
              </Button>
            </td>
          </tr>
        ))}
      </Table>
      <Modal open={!!credit} onClose={() => setCredit(null)} title={`調整點數：${credit?.user.email ?? credit?.user.name}`}>
        {credit && (
          <div className="space-y-3">
            <div>
              <Label hint="負數為扣除">點數</Label>
              <Input inputMode="numeric" value={credit.delta} onChange={(e) => setCredit({ ...credit, delta: e.target.value })} placeholder="1000000" />
            </div>
            <div>
              <Label>原因</Label>
              <Input value={credit.reason} onChange={(e) => setCredit({ ...credit, reason: e.target.value })} placeholder="例如：客訴補償、儲值" />
            </div>
            <ErrorNote error={error} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCredit(null)}>
                取消
              </Button>
              <Button
                disabled={!Number(credit.delta)}
                onClick={async () => {
                  try {
                    await api(`/admin/users/${credit.user.id}/credits`, { body: { delta: Number(credit.delta), reason: credit.reason } });
                    setCredit(null);
                    load();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                確認
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
