"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, ErrorNote, Input, Label, Modal, PageHeader, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth_context";
import { currency, fmtDate, fmtIsc, iscToMicro } from "@/lib/format";
import type { ApiKey, HubModel } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/v1";

export default function KeysPage() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [models, setModels] = useState<HubModel[]>([]);
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", credit_limit: "", rpm_limit: "", tpm_limit: "", expires_in_days: "", allowed: [] as string[] });

  const load = useCallback(() => {
    api<{ data: ApiKey[] }>("/api/keys")
      .then((r) => setKeys(r.data))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    api<{ data: HubModel[] }>("/api/models").then((r) => setModels(r.data.filter((m) => m.available)));
  }, [load]);

  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

  async function create() {
    setError(null);
    try {
      const r = await api<{ key: string }>("/api/keys", {
        body: {
          name: form.name,
          credit_limit: iscToMicro(form.credit_limit),
          rpm_limit: num(form.rpm_limit),
          tpm_limit: num(form.tpm_limit),
          expires_in_days: num(form.expires_in_days),
          allowed_models: form.allowed.length ? form.allowed : undefined,
        },
      });
      setCreated(r.key);
      setOpen(false);
      setForm({ name: "", credit_limit: "", rpm_limit: "", tpm_limit: "", expires_in_days: "", allowed: [] });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function setStatus(k: ApiKey, status: "active" | "revoked") {
    if (status === "revoked" && !confirm(`確定要撤銷「${k.name}」？使用此金鑰的應用將立即失效。`)) return;
    try {
      if (status === "revoked") await api(`/api/keys/${k.id}`, { method: "DELETE" });
      else await api(`/api/keys/${k.id}`, { method: "PATCH", body: { status } });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const allowApi = user?.plan?.allow_api;

  return (
    <>
      <PageHeader
        title="API 金鑰"
        description="以 OpenAI 相容格式串接 AICH。可為每把金鑰設定額度上限、速率與允許的模型。"
        actions={<Button onClick={() => setOpen(true)} disabled={!allowApi}>建立金鑰</Button>}
      />
      {!allowApi && (
        <Card className="mb-4 border-warning/40 bg-warning/5 text-sm">目前的 {user?.plan?.name} 方案不含 API 存取，升級到 Pro 即可建立 API 金鑰。</Card>
      )}
      <ErrorNote error={error} />
      {created && (
        <Card className="mb-4 border-success/40">
          <div className="text-sm font-medium">金鑰已建立 — 請立即複製保存，之後不會再顯示。</div>
          <div className="mt-2 flex gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-xs">{created}</code>
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(created)}>
              複製
            </Button>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">{`curl ${BASE}/chat/completions \\
  -H "Authorization: Bearer ${created}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"hub-auto","messages":[{"role":"user","content":"Hello"}]}'`}</pre>
          <button className="mt-2 text-xs text-muted" onClick={() => setCreated(null)}>
            我已保存，關閉
          </button>
        </Card>
      )}
      <Table head={["名稱", "金鑰", "狀態", "已用 / 上限", "RPM / TPM", "允許模型", "最後使用", ""]} empty={keys.length === 0}>
        {keys.map((k) => (
          <tr key={k.id}>
            <td className="px-3 py-2 font-medium">{k.name}</td>
            <td className="px-3 py-2 font-mono text-xs">{k.prefix}</td>
            <td className="px-3 py-2">
              <Badge tone={k.status === "active" ? "success" : "danger"}>{k.status}</Badge>
            </td>
            <td className="px-3 py-2 tabular-nums">
              {fmtIsc(k.credits_used)} / {k.credit_limit ? fmtIsc(k.credit_limit) : "∞"}
            </td>
            <td className="px-3 py-2 tabular-nums">
              {k.rpm_limit ?? "方案預設"} / {k.tpm_limit ?? "方案預設"}
            </td>
            <td className="px-3 py-2 text-xs">{k.allowed_models?.join(", ") || "全部"}</td>
            <td className="px-3 py-2 text-xs text-muted">{fmtDate(k.last_used_at)}</td>
            <td className="px-3 py-2 text-right">
              {k.status === "active" && (
                <Button variant="ghost" className="text-danger" onClick={() => setStatus(k, "revoked")}>
                  撤銷
                </Button>
              )}
            </td>
          </tr>
        ))}
      </Table>

      <Modal open={open} onClose={() => setOpen(false)} title="建立 API 金鑰">
        <div className="space-y-3">
          <div>
            <Label>名稱</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：production-backend" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label hint={`${currency()}，可留空`}>額度上限</Label>
              <Input inputMode="decimal" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
            </div>
            <div>
              <Label hint="天，可留空">有效期</Label>
              <Input inputMode="numeric" value={form.expires_in_days} onChange={(e) => setForm({ ...form, expires_in_days: e.target.value })} />
            </div>
            <div>
              <Label hint={`≤ ${user?.plan?.default_rpm}`}>RPM 上限</Label>
              <Input inputMode="numeric" value={form.rpm_limit} onChange={(e) => setForm({ ...form, rpm_limit: e.target.value })} />
            </div>
            <div>
              <Label hint={`≤ ${user?.plan?.default_tpm}`}>TPM 上限</Label>
              <Input inputMode="numeric" value={form.tpm_limit} onChange={(e) => setForm({ ...form, tpm_limit: e.target.value })} />
            </div>
          </div>
          <div>
            <Label hint="不選 = 全部">允許的模型</Label>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {models.map((m) => {
                const on = form.allowed.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setForm({ ...form, allowed: on ? form.allowed.filter((x) => x !== m.id) : [...form.allowed, m.id] })}
                    className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"}`}
                  >
                    {m.id}
                  </button>
                );
              })}
            </div>
          </div>
          <ErrorNote error={error} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={create}>建立</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
