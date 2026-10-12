"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ErrorNote, Input, Label, Modal, PageHeader, Select, Table, Toggle } from "@/components/ui";
import { api } from "@/lib/api";
import { currency, fmtDate, fmtIsc, iscToMicro, microToIscInput } from "@/lib/format";

interface Provider {
  id: string;
  kind: string;
  name: string;
  base_url: string;
  enabled: boolean;
  timeout_ms: number;
  monthly_budget_credits: number | null;
  config: Record<string, unknown>;
  shared_keys: number;
  byok_keys: number;
  month_spend: number;
}

interface PKey {
  id: string;
  owner_email: string | null;
  label: string;
  key_last4: string;
  enabled: boolean;
  weight: number;
  created_at: string;
}

const KIND_DEFAULT_URL: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com",
  mock: "mock://local",
};

const emptyForm = { id: "", kind: "openai", name: "", base_url: KIND_DEFAULT_URL.openai, timeout_ms: "120000", monthly_budget_credits: "", stream_usage: true };

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<null | { mode: "new" | "edit"; form: typeof emptyForm }>(null);
  const [keysFor, setKeysFor] = useState<Provider | null>(null);
  const [keys, setKeys] = useState<PKey[]>([]);
  const [cooldowns, setCooldowns] = useState<{ key_id: string; seconds_left: number; reason: string }[]>([]);
  const [newKey, setNewKey] = useState({ key: "", label: "", weight: "1" });

  const load = useCallback(() => {
    api<{ data: Provider[] }>("/admin/providers")
      .then((r) => setProviders(r.data))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const loadKeys = useCallback((p: Provider) => {
    api<{ data: PKey[]; cooldowns: typeof cooldowns }>(`/admin/providers/${p.id}/keys`).then((r) => {
      setKeys(r.data);
      setCooldowns(r.cooldowns);
    });
  }, []);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save() {
    if (!edit) return;
    const f = edit.form;
    const body = {
      kind: f.kind,
      name: f.name || f.id,
      base_url: f.base_url,
      timeout_ms: Number(f.timeout_ms) || 120000,
      monthly_budget_credits: iscToMicro(f.monthly_budget_credits) ?? null,
      config: { stream_usage: f.stream_usage },
    };
    await run(async () => {
      if (edit.mode === "new") await api("/admin/providers", { body: { id: f.id, ...body } });
      else await api(`/admin/providers/${f.id}`, { method: "PATCH", body });
      setEdit(null);
    });
  }

  return (
    <>
      <PageHeader
        title="供應商與金鑰池"
        description="上游金鑰以 AES-256-GCM 加密保存，只顯示末四碼。多把金鑰會依權重輪替，遇到 429 自動冷卻、401/403 暫停 10 分鐘。"
        actions={<Button onClick={() => setEdit({ mode: "new", form: { ...emptyForm } })}>新增供應商</Button>}
      />
      <ErrorNote error={error} />
      <Table head={["ID", "類型", "Base URL", "狀態", "金鑰（共用/BYOK）", "本月營收 / 預算", ""]}>
        {providers.map((p) => (
          <tr key={p.id}>
            <td className="px-3 py-2">
              <div className="font-medium">{p.id}</div>
              <div className="text-xs text-muted">{p.name}</div>
            </td>
            <td className="px-3 py-2">
              <Badge>{p.kind}</Badge>
            </td>
            <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-xs" title={p.base_url}>
              {p.base_url}
            </td>
            <td className="px-3 py-2">
              <Toggle checked={p.enabled} onChange={(v) => run(() => api(`/admin/providers/${p.id}`, { method: "PATCH", body: { enabled: v } }))} />
            </td>
            <td className="px-3 py-2 tabular-nums">
              {p.shared_keys === 0 ? <Badge tone="warning">0</Badge> : p.shared_keys} / {p.byok_keys}
            </td>
            <td className="px-3 py-2 tabular-nums text-xs">
              {fmtIsc(p.month_spend)} / {p.monthly_budget_credits ? fmtIsc(p.monthly_budget_credits) : "不限"}
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-right">
              <Button
                variant="ghost"
                className="text-xs"
                onClick={() => {
                  setKeysFor(p);
                  loadKeys(p);
                }}
              >
                金鑰
              </Button>
              <Button
                variant="ghost"
                className="text-xs"
                onClick={() =>
                  setEdit({
                    mode: "edit",
                    form: {
                      id: p.id,
                      kind: p.kind,
                      name: p.name,
                      base_url: p.base_url,
                      timeout_ms: String(p.timeout_ms),
                      monthly_budget_credits: microToIscInput(p.monthly_budget_credits),
                      stream_usage: p.config?.stream_usage !== false,
                    },
                  })
                }
              >
                編輯
              </Button>
              <Button
                variant="ghost"
                className="text-xs text-danger"
                onClick={() => confirm(`刪除供應商 ${p.id}？相關路由與金鑰也會一併刪除。`) && run(() => api(`/admin/providers/${p.id}`, { method: "DELETE" }))}
              >
                刪除
              </Button>
            </td>
          </tr>
        ))}
      </Table>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.mode === "new" ? "新增供應商" : `編輯 ${edit?.form.id}`}>
        {edit && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ID</Label>
                <Input value={edit.form.id} disabled={edit.mode === "edit"} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, id: e.target.value } })} placeholder="例如 groq" />
              </div>
              <div>
                <Label hint="API 協定">類型</Label>
                <Select
                  className="w-full"
                  value={edit.form.kind}
                  onChange={(e) => setEdit({ ...edit, form: { ...edit.form, kind: e.target.value, base_url: edit.mode === "new" ? KIND_DEFAULT_URL[e.target.value] : edit.form.base_url } })}
                >
                  <option value="openai">openai（含相容服務）</option>
                  <option value="anthropic">anthropic</option>
                  <option value="gemini">gemini</option>
                  <option value="mock">mock</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>顯示名稱</Label>
              <Input value={edit.form.name} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, name: e.target.value } })} />
            </div>
            <div>
              <Label>Base URL</Label>
              <Input value={edit.form.base_url} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, base_url: e.target.value } })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>逾時 (ms)</Label>
                <Input inputMode="numeric" value={edit.form.timeout_ms} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, timeout_ms: e.target.value } })} />
              </div>
              <div>
                <Label hint={`${currency()}，留空不限`}>月預算斷路器</Label>
                <Input inputMode="decimal" value={edit.form.monthly_budget_credits} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, monthly_budget_credits: e.target.value } })} />
              </div>
            </div>
            {edit.form.kind === "openai" && (
              <Toggle checked={edit.form.stream_usage} onChange={(v) => setEdit({ ...edit, form: { ...edit.form, stream_usage: v } })} label="串流時要求 usage（stream_options.include_usage）" />
            )}
            <ErrorNote error={error} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEdit(null)}>
                取消
              </Button>
              <Button onClick={save}>儲存</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!keysFor} onClose={() => setKeysFor(null)} title={`${keysFor?.id} 金鑰池`}>
        {keysFor && (
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_6rem_4rem] gap-2">
              <Input type="password" placeholder="上游 API Key" value={newKey.key} onChange={(e) => setNewKey({ ...newKey, key: e.target.value })} />
              <Input placeholder="標籤" value={newKey.label} onChange={(e) => setNewKey({ ...newKey, label: e.target.value })} />
              <Input placeholder="權重" inputMode="numeric" value={newKey.weight} onChange={(e) => setNewKey({ ...newKey, weight: e.target.value })} />
            </div>
            <Button
              disabled={!newKey.key}
              onClick={() =>
                run(async () => {
                  await api(`/admin/providers/${keysFor.id}/keys`, { body: { key: newKey.key, label: newKey.label, weight: Number(newKey.weight) || 1 } });
                  setNewKey({ key: "", label: "", weight: "1" });
                  loadKeys(keysFor);
                })
              }
            >
              加入金鑰
            </Button>
            <div className="divide-y divide-border rounded-lg border border-border">
              {keys.map((k) => {
                const cd = cooldowns.find((c) => c.key_id === k.id);
                return (
                  <div key={k.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <div className="flex-1">
                      <div>
                        <span className="font-mono text-xs">••••{k.key_last4}</span> {k.label && <span className="text-muted">· {k.label}</span>}
                        {k.owner_email && (
                          <span className="ml-1">
                            <Badge tone="accent">BYOK {k.owner_email}</Badge>
                          </span>
                        )}
                        {cd && (
                          <span className="ml-1">
                            <Badge tone="warning">
                              冷卻 {cd.seconds_left}s（{cd.reason}）
                            </Badge>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted">
                        權重 {k.weight} · {fmtDate(k.created_at)}
                      </div>
                    </div>
                    <Toggle
                      checked={k.enabled}
                      onChange={(v) =>
                        run(async () => {
                          await api(`/admin/provider-keys/${k.id}`, { method: "PATCH", body: { enabled: v } });
                          loadKeys(keysFor);
                        })
                      }
                    />
                    <Button
                      variant="ghost"
                      className="text-xs text-danger"
                      onClick={() =>
                        confirm("刪除此金鑰？") &&
                        run(async () => {
                          await api(`/admin/provider-keys/${k.id}`, { method: "DELETE" });
                          loadKeys(keysFor);
                        })
                      }
                    >
                      刪除
                    </Button>
                  </div>
                );
              })}
              {keys.length === 0 && <div className="px-3 py-4 text-center text-sm text-muted">尚未設定金鑰，此供應商的路由會被略過。</div>}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
