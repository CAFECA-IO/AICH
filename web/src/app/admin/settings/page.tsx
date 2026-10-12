"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, ErrorNote, Input, Label, PageHeader, Select, Table, Textarea, Toggle } from "@/components/ui";
import { api } from "@/lib/api";
import { currency, fmtNumber, MICRO } from "@/lib/format";
import type { Plan } from "@/lib/types";

interface Guardrails {
  mode: "off" | "flag" | "block";
  blocked_terms: string[];
  detect_prompt_injection: boolean;
}
interface CacheCfg {
  enabled: boolean;
  ttl_seconds: number;
}

export default function SettingsAdmin() {
  const [g, setG] = useState<Guardrails>({ mode: "off", blocked_terms: [], detect_prompt_injection: true });
  const [terms, setTerms] = useState("");
  const [cache, setCache] = useState<CacheCfg>({ enabled: true, ttl_seconds: 3600 });
  const [plans, setPlans] = useState<(Plan & { users: number })[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ guardrails?: Guardrails; cache?: CacheCfg }>("/admin/settings").then((s) => {
      if (s.guardrails) {
        setG(s.guardrails);
        setTerms(s.guardrails.blocked_terms.join("\n"));
      }
      if (s.cache) setCache(s.cache);
    });
    api<{ data: (Plan & { users: number })[] }>("/admin/plans").then((r) => setPlans(r.data));
  }, []);
  useEffect(load, [load]);

  async function save(fn: () => Promise<unknown>, ok: string) {
    setError(null);
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function setPlan(id: string, patch: Partial<Plan>) {
    setPlans((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  return (
    <>
      <PageHeader title="方案與風控設定" description="ISC 費用基數請到「ISC 計價」頁設定。" />
      <div className="mb-4 space-y-2">
        <ErrorNote error={error} />
        {msg && <div className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{msg}</div>}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 font-semibold">內容安全防護（Guardrails）</h2>
          <p className="mb-4 text-sm text-muted">檢查用戶輸入中的敏感詞與 Prompt Injection 樣式。flag 模式放行但標記於回應標頭與日誌。</p>
          <div className="space-y-3">
            <div>
              <Label>模式</Label>
              <Select value={g.mode} onChange={(e) => setG({ ...g, mode: e.target.value as Guardrails["mode"] })}>
                <option value="off">off 關閉</option>
                <option value="flag">flag 標記</option>
                <option value="block">block 阻擋</option>
              </Select>
            </div>
            <Toggle checked={g.detect_prompt_injection} onChange={(v) => setG({ ...g, detect_prompt_injection: v })} label="偵測 Prompt Injection" />
            <div>
              <Label hint="每行一個">敏感詞</Label>
              <Textarea rows={5} value={terms} onChange={(e) => setTerms(e.target.value)} />
            </div>
            <Button
              onClick={() =>
                save(
                  () => api("/admin/settings/guardrails", { method: "PUT", body: { ...g, blocked_terms: terms.split("\n").map((t) => t.trim()).filter(Boolean) } }),
                  "已更新 Guardrails",
                )
              }
            >
              儲存
            </Button>
          </div>
        </Card>
        <Card>
          <h2 className="mb-1 font-semibold">回應快取</h2>
          <p className="mb-4 text-sm text-muted">
            完全相同的非串流請求（temperature=0，或帶 X-Hub-Cache: true）直接回傳快取，不收費。快取以用戶為範圍隔離；啟用零數據留存的用戶不快取。
          </p>
          <div className="space-y-3">
            <Toggle checked={cache.enabled} onChange={(v) => setCache({ ...cache, enabled: v })} label="啟用快取" />
            <div>
              <Label>TTL（秒）</Label>
              <Input inputMode="numeric" value={cache.ttl_seconds} onChange={(e) => setCache({ ...cache, ttl_seconds: Number(e.target.value) || 0 })} />
            </div>
            <Button onClick={() => save(() => api("/admin/settings/cache", { method: "PUT", body: cache }), "已更新快取設定")}>儲存</Button>
          </div>
        </Card>
      </div>

      <h2 className="mt-8 mb-3 font-semibold">訂閱方案</h2>
      <Table head={["方案", `月費 (${currency()})`, `每月額度 (${currency()})`, "API", "模型等級", "預設 RPM", "預設 TPM", "路由優先級", "BYOK", "用戶數", ""]}>
        {plans.map((p) => (
          <tr key={p.id}>
            <td className="px-3 py-2 font-medium">{p.name}</td>
            <td className="px-3 py-2">
              <Input className="w-24" inputMode="decimal" value={p.monthly_fee / MICRO} onChange={(e) => setPlan(p.id, { monthly_fee: Math.round(Number(e.target.value) * MICRO) })} />
            </td>
            <td className="px-3 py-2">
              <Input className="w-28" inputMode="decimal" value={p.monthly_credits / MICRO} onChange={(e) => setPlan(p.id, { monthly_credits: Math.round(Number(e.target.value) * MICRO) })} />
            </td>
            <td className="px-3 py-2">
              <Toggle checked={p.allow_api} onChange={(v) => setPlan(p.id, { allow_api: v })} />
            </td>
            <td className="px-3 py-2">
              <Select value={p.allowed_tiers.join(",")} onChange={(e) => setPlan(p.id, { allowed_tiers: e.target.value.split(",") })}>
                <option value="basic">basic</option>
                <option value="basic,premium">basic + premium</option>
              </Select>
            </td>
            <td className="px-3 py-2">
              <Input className="w-20" inputMode="numeric" value={p.default_rpm} onChange={(e) => setPlan(p.id, { default_rpm: Number(e.target.value) })} />
            </td>
            <td className="px-3 py-2">
              <Input className="w-28" inputMode="numeric" value={p.default_tpm} onChange={(e) => setPlan(p.id, { default_tpm: Number(e.target.value) })} />
            </td>
            <td className="px-3 py-2">
              <Input className="w-20" inputMode="numeric" value={p.routing_priority} onChange={(e) => setPlan(p.id, { routing_priority: Number(e.target.value) })} />
            </td>
            <td className="px-3 py-2">
              <Toggle checked={p.byok} onChange={(v) => setPlan(p.id, { byok: v })} />
            </td>
            <td className="px-3 py-2 tabular-nums">{fmtNumber(p.users)}</td>
            <td className="px-3 py-2">
              <Button
                variant="secondary"
                className="text-xs"
                onClick={() =>
                  save(
                    () =>
                      api(`/admin/plans/${p.id}`, {
                        method: "PATCH",
                        body: {
                          monthly_fee: p.monthly_fee,
                          monthly_credits: p.monthly_credits,
                          allow_api: p.allow_api,
                          allowed_tiers: p.allowed_tiers,
                          default_rpm: p.default_rpm,
                          default_tpm: p.default_tpm,
                          routing_priority: p.routing_priority,
                          byok: p.byok,
                        },
                      }),
                    `已更新 ${p.name} 方案`,
                  )
                }
              >
                儲存
              </Button>
            </td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-xs text-muted">路由優先級：≥100 多一次備援嘗試；≥10 標準；&lt;10 減少嘗試次數（最少 2 次）。</p>
    </>
  );
}
