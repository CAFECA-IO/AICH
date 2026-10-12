"use client";

import { useCallback, useEffect, useState } from "react";
import { CafecaButton, CafecaMark } from "@/components/cafeca_button";
import { Badge, Button, Card, ErrorNote, Input, Label, PageHeader, Select, Table, Toggle } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth_context";
import { shortAccount } from "@/lib/cafeca";
import { fmtDate, fmtFee, fmtIsc } from "@/lib/format";
import type { Plan } from "@/lib/types";

interface OwnKey {
  id: string;
  provider_id: string;
  label: string;
  key_last4: string;
  enabled: boolean;
  created_at: string;
}

const BYOK_PROVIDERS = ["openai", "anthropic", "gemini", "deepseek", "mistral"];

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [pw, setPw] = useState({ current: "", next: "" });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ownKeys, setOwnKeys] = useState<OwnKey[]>([]);
  const [newKey, setNewKey] = useState({ provider_id: "openai", key: "", label: "" });

  const loadOwn = useCallback(() => {
    if (user?.plan?.byok) api<{ data: OwnKey[] }>("/api/provider-keys").then((r) => setOwnKeys(r.data));
  }, [user?.plan?.byok]);

  useEffect(() => {
    api<{ data: Plan[] }>("/api/plans").then((r) => setPlans(r.data));
    loadOwn();
  }, [loadOwn]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setError(null);
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="帳號與方案" />
      <div className="mb-4 space-y-2">
        <ErrorNote error={error} />
        {msg && <div className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{msg}</div>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">個人資料</h2>
          <div className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input value={user?.email ?? "—（以 CAFECA 登入）"} disabled />
            </div>
            <div>
              <Label>名稱</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button onClick={() => act(() => api("/api/me", { method: "PATCH", body: { name } }), "已更新名稱")}>儲存</Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">隱私</h2>
          <Toggle
            checked={!!user?.zero_data_retention}
            onChange={(v) => act(() => api("/api/me", { method: "PATCH", body: { zero_data_retention: v } }), v ? "已啟用零數據留存" : "已關閉零數據留存")}
            label="零數據留存（Zero Data Retention）"
          />
          <p className="mt-3 text-sm text-muted">
            啟用後，AICH 只做數據流轉：不記錄你的 Prompt 與回應內容、不寫入快取，也絕不用於模型訓練。用量統計（token 數、費用、延遲）仍會保留以供計費。
          </p>
        </Card>

        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <CafecaMark /> CAFECA 數位身分
          </h2>
          {user?.cafeca_account ? (
            <>
              <p className="mb-3 text-sm text-muted">已綁定，可用 Passkey 一鍵登入。</p>
              <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                {user.cafeca_handle && <div className="font-medium">@{user.cafeca_handle}</div>}
                <div className="font-mono text-xs text-muted" title={user.cafeca_account}>
                  {shortAccount(user.cafeca_account)}
                </div>
              </div>
              {user.email && user.has_password ? (
                <Button
                  variant="ghost"
                  className="mt-3 text-danger"
                  onClick={() => confirm("解除綁定後將無法以 CAFECA 登入此帳號，確定？") && act(() => api("/api/me/cafeca", { method: "DELETE" }), "已解除 CAFECA 綁定")}
                >
                  解除綁定
                </Button>
              ) : (
                <p className="mt-3 text-xs text-muted">此帳號以 CAFECA 建立，CAFECA 是唯一的登入方式。</p>
              )}
            </>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted">綁定 CAFECA 後即可用 Passkey 登入，不必再輸入密碼。身分合約地址會作為你的唯一識別。</p>
              <CafecaButton
                purpose="link"
                label="綁定 CAFECA"
                next="/dashboard/settings"
                onDone={async () => {
                  setMsg("已綁定 CAFECA");
                  await refresh();
                }}
                onError={setError}
              />
            </>
          )}
        </Card>

        {user?.has_password && (
        <Card>
          <h2 className="mb-4 font-semibold">變更密碼</h2>
          <div className="space-y-3">
            <div>
              <Label>目前密碼</Label>
              <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
            </div>
            <div>
              <Label hint="至少 8 個字元">新密碼</Label>
              <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
            </div>
            <Button
              onClick={() =>
                act(async () => {
                  await api("/api/me", { method: "PATCH", body: { current_password: pw.current, new_password: pw.next } });
                  setPw({ current: "", next: "" });
                }, "密碼已更新")
              }
              disabled={!pw.current || pw.next.length < 8}
            >
              更新密碼
            </Button>
          </div>
        </Card>
        )}

        <Card>
          <h2 className="mb-1 font-semibold">訂閱方案</h2>
          <p className="mb-4 text-sm text-muted">
            目前：<b>{user?.plan?.name}</b>，餘額 {fmtIsc(user?.credit_balance)}。方案額度每月自動發放。
          </p>
          <div className="space-y-2">
            {plans.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${p.id === user?.plan?.id ? "border-accent bg-accent-soft" : "border-border"}`}>
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {p.name} <span className="text-muted">· {fmtFee(p.monthly_fee)}{p.monthly_fee ? "/月" : ""}</span>
                  </div>
                  <div className="text-xs text-muted">
                    每月 {fmtIsc(p.monthly_credits)} · {p.allow_api ? "含 API" : "僅 Web UI"} · {p.allowed_tiers.join(" + ")} 模型
                  </div>
                </div>
                {p.id === user?.plan?.id ? (
                  <Badge tone="accent">目前方案</Badge>
                ) : p.id === "enterprise" ? (
                  <a className="text-xs text-accent" href="mailto:sales@cafeca.com.tw?subject=AICH%20Enterprise">
                    聯絡業務
                  </a>
                ) : (
                  <Button variant="secondary" className="text-xs" onClick={() => act(() => api("/api/subscription", { body: { plan_id: p.id } }), `已切換至 ${p.name}`)}>
                    切換
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {user?.plan?.byok && (
        <Card className="mt-6">
          <h2 className="mb-1 font-semibold">自訂金鑰池（BYOK）</h2>
          <p className="mb-4 text-sm text-muted">企業方案可加入自己的上游金鑰。路由時優先使用你的金鑰，失效或限流時自動退回平台共用金鑰池。金鑰以 AES-256-GCM 加密保存。</p>
          <div className="mb-4 grid gap-2 sm:grid-cols-[10rem_1fr_10rem_auto]">
            <Select value={newKey.provider_id} onChange={(e) => setNewKey({ ...newKey, provider_id: e.target.value })}>
              {BYOK_PROVIDERS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
            <Input type="password" placeholder="上游 API Key" value={newKey.key} onChange={(e) => setNewKey({ ...newKey, key: e.target.value })} />
            <Input placeholder="標籤（選填）" value={newKey.label} onChange={(e) => setNewKey({ ...newKey, label: e.target.value })} />
            <Button
              disabled={!newKey.key}
              onClick={() =>
                act(async () => {
                  await api("/api/provider-keys", { body: newKey });
                  setNewKey({ ...newKey, key: "", label: "" });
                  loadOwn();
                }, "已加入金鑰")
              }
            >
              加入
            </Button>
          </div>
          <Table head={["供應商", "標籤", "金鑰", "建立時間", ""]} empty={ownKeys.length === 0}>
            {ownKeys.map((k) => (
              <tr key={k.id}>
                <td className="px-3 py-2">{k.provider_id}</td>
                <td className="px-3 py-2">{k.label || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">••••{k.key_last4}</td>
                <td className="px-3 py-2 text-xs text-muted">{fmtDate(k.created_at)}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    className="text-danger"
                    onClick={() =>
                      act(async () => {
                        await api(`/api/provider-keys/${k.id}`, { method: "DELETE" });
                        loadOwn();
                      }, "已移除金鑰")
                    }
                  >
                    移除
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
