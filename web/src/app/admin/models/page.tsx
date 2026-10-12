"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, ErrorNote, Input, Label, Modal, PageHeader, Select, Textarea, Toggle } from "@/components/ui";
import { api } from "@/lib/api";

interface Route {
  id: string;
  provider_id: string;
  upstream_model: string;
  priority: number;
  input_price: number;
  output_price: number;
  tags: string[];
  enabled: boolean;
  ratio_bp: number;
}

interface Model {
  id: string;
  display_name: string;
  description: string;
  tier: string;
  strategy: string;
  context_window: number;
  supports_vision: boolean;
  supports_tools: boolean;
  enabled: boolean;
  sort_order: number;
  routes: Route[];
}

const TAGS = ["code", "long_context", "reasoning", "vision", "simple", "general"];
const emptyModel = { id: "", display_name: "", description: "", tier: "basic", strategy: "failover", context_window: "128000", supports_vision: false, supports_tools: true, sort_order: "100" };
const emptyRoute = { provider_id: "", upstream_model: "", priority: "0", input_usd: "", output_usd: "", ratio: "1", tags: [] as string[] };

/** Official list prices: UI in USD / 1M tokens; API stores micro-USD / 1M tokens (×1,000,000). */
const usdToCredits = (v: string) => Math.round(Number(v || 0) * 1_000_000);
const creditsToUsdStr = (c: number) => String(c / 1_000_000);

export default function ModelsAdmin() {
  const [models, setModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mEdit, setMEdit] = useState<null | { mode: "new" | "edit"; f: typeof emptyModel }>(null);
  const [rEdit, setREdit] = useState<null | { model: string; id?: string; f: typeof emptyRoute }>(null);

  const load = useCallback(() => {
    api<{ data: Model[] }>("/admin/models")
      .then((r) => setModels(r.data))
      .catch((e) => setError(e.message));
    api<{ data: { id: string }[] }>("/admin/providers").then((r) => setProviders(r.data.map((p) => p.id)));
  }, []);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  async function saveModel() {
    if (!mEdit) return;
    const f = mEdit.f;
    const body = {
      display_name: f.display_name || f.id,
      description: f.description,
      tier: f.tier,
      strategy: f.strategy,
      context_window: Number(f.context_window) || 128000,
      supports_vision: f.supports_vision,
      supports_tools: f.supports_tools,
      sort_order: Number(f.sort_order) || 0,
    };
    const ok = await run(() => (mEdit.mode === "new" ? api("/admin/models", { body: { id: f.id, ...body } }) : api(`/admin/models/${f.id}`, { method: "PATCH", body })));
    if (ok) setMEdit(null);
  }

  async function saveRoute() {
    if (!rEdit) return;
    const f = rEdit.f;
    const body = {
      provider_id: f.provider_id,
      upstream_model: f.upstream_model,
      priority: Number(f.priority) || 0,
      input_price: usdToCredits(f.input_usd),
      output_price: usdToCredits(f.output_usd),
      ratio_bp: Math.max(1, Math.round(Number(f.ratio || 1) * 10_000)),
      tags: f.tags,
    };
    const ok = await run(() => (rEdit.id ? api(`/admin/routes/${rEdit.id}`, { method: "PATCH", body }) : api(`/admin/models/${rEdit.model}/routes`, { body })));
    if (ok) setREdit(null);
  }

  return (
    <>
      <PageHeader
        title="動態模型映射"
        description="對外暴露的 Hub 模型 → 後端實際模型。每個 Hub 模型可設定多條路由，搭配策略決定派送順序；價格填各家官方牌價（USD / 1M tokens），系統以「倍率 × 費用基數」換算成 ISC（見「ISC 計價」）。"
        actions={<Button onClick={() => setMEdit({ mode: "new", f: { ...emptyModel } })}>新增模型</Button>}
      />
      <ErrorNote error={error} />
      <div className="space-y-4">
        {models.map((m) => (
          <Card key={m.id} className={m.enabled ? "" : "opacity-60"}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{m.id}</span>
                  <Badge tone={m.tier === "premium" ? "accent" : "neutral"}>{m.tier}</Badge>
                  <Badge>{m.strategy}</Badge>
                  {m.supports_vision && <Badge>vision</Badge>}
                </div>
                <div className="mt-1 text-sm text-muted">
                  {m.display_name} — {m.description}
                </div>
              </div>
              <Toggle checked={m.enabled} onChange={(v) => run(() => api(`/admin/models/${m.id}`, { method: "PATCH", body: { enabled: v } }))} />
              <Button
                variant="ghost"
                className="text-xs"
                onClick={() =>
                  setMEdit({
                    mode: "edit",
                    f: {
                      id: m.id,
                      display_name: m.display_name,
                      description: m.description,
                      tier: m.tier,
                      strategy: m.strategy,
                      context_window: String(m.context_window),
                      supports_vision: m.supports_vision,
                      supports_tools: m.supports_tools,
                      sort_order: String(m.sort_order),
                    },
                  })
                }
              >
                編輯
              </Button>
              <Button variant="ghost" className="text-xs text-danger" onClick={() => confirm(`刪除模型 ${m.id}？`) && run(() => api(`/admin/models/${m.id}`, { method: "DELETE" }))}>
                刪除
              </Button>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1">優先序</th>
                    <th>供應商 / 上游模型</th>
                    <th>官方 輸入 $/1M</th>
                    <th>官方 輸出 $/1M</th>
                    <th>倍率</th>
                    <th>標籤</th>
                    <th>啟用</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {m.routes.map((r) => (
                    <tr key={r.id}>
                      <td className="py-1.5 tabular-nums">{r.priority}</td>
                      <td className="font-mono text-xs">
                        {r.provider_id} / {r.upstream_model}
                      </td>
                      <td className="tabular-nums">{creditsToUsdStr(r.input_price)}</td>
                      <td className="tabular-nums">{creditsToUsdStr(r.output_price)}</td>
                      <td className="tabular-nums text-xs text-muted">×{r.ratio_bp / 10_000}</td>
                      <td className="text-xs">{r.tags.join(", ")}</td>
                      <td>
                        <Toggle checked={r.enabled} onChange={(v) => run(() => api(`/admin/routes/${r.id}`, { method: "PATCH", body: { enabled: v } }))} />
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <Button
                          variant="ghost"
                          className="text-xs"
                          onClick={() =>
                            setREdit({
                              model: m.id,
                              id: r.id,
                              f: {
                                provider_id: r.provider_id,
                                upstream_model: r.upstream_model,
                                priority: String(r.priority),
                                input_usd: creditsToUsdStr(r.input_price),
                                output_usd: creditsToUsdStr(r.output_price),
                                ratio: String(r.ratio_bp / 10_000),
                                tags: r.tags,
                              },
                            })
                          }
                        >
                          編輯
                        </Button>
                        <Button variant="ghost" className="text-xs text-danger" onClick={() => confirm("刪除此路由？") && run(() => api(`/admin/routes/${r.id}`, { method: "DELETE" }))}>
                          刪除
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button variant="secondary" className="mt-2 text-xs" onClick={() => setREdit({ model: m.id, f: { ...emptyRoute, provider_id: providers[0] ?? "" } })}>
                ＋ 新增路由
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={!!mEdit} onClose={() => setMEdit(null)} title={mEdit?.mode === "new" ? "新增 Hub 模型" : `編輯 ${mEdit?.f.id}`}>
        {mEdit && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Model ID</Label>
                <Input value={mEdit.f.id} disabled={mEdit.mode === "edit"} placeholder="hub-xxx" onChange={(e) => setMEdit({ ...mEdit, f: { ...mEdit.f, id: e.target.value } })} />
              </div>
              <div>
                <Label>顯示名稱</Label>
                <Input value={mEdit.f.display_name} onChange={(e) => setMEdit({ ...mEdit, f: { ...mEdit.f, display_name: e.target.value } })} />
              </div>
            </div>
            <div>
              <Label>說明</Label>
              <Textarea rows={2} value={mEdit.f.description} onChange={(e) => setMEdit({ ...mEdit, f: { ...mEdit.f, description: e.target.value } })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>等級</Label>
                <Select className="w-full" value={mEdit.f.tier} onChange={(e) => setMEdit({ ...mEdit, f: { ...mEdit.f, tier: e.target.value } })}>
                  <option value="basic">basic（所有方案）</option>
                  <option value="premium">premium（Pro 以上）</option>
                </Select>
              </div>
              <div>
                <Label>路由策略</Label>
                <Select className="w-full" value={mEdit.f.strategy} onChange={(e) => setMEdit({ ...mEdit, f: { ...mEdit.f, strategy: e.target.value } })}>
                  <option value="failover">failover 自動備援</option>
                  <option value="cost">cost 成本優先</option>
                  <option value="latency">latency 延遲優先</option>
                  <option value="intent">intent 意圖路由</option>
                </Select>
              </div>
              <div>
                <Label>Context window</Label>
                <Input inputMode="numeric" value={mEdit.f.context_window} onChange={(e) => setMEdit({ ...mEdit, f: { ...mEdit.f, context_window: e.target.value } })} />
              </div>
              <div>
                <Label>排序</Label>
                <Input inputMode="numeric" value={mEdit.f.sort_order} onChange={(e) => setMEdit({ ...mEdit, f: { ...mEdit.f, sort_order: e.target.value } })} />
              </div>
            </div>
            <div className="flex gap-6">
              <Toggle checked={mEdit.f.supports_vision} onChange={(v) => setMEdit({ ...mEdit, f: { ...mEdit.f, supports_vision: v } })} label="支援圖片" />
              <Toggle checked={mEdit.f.supports_tools} onChange={(v) => setMEdit({ ...mEdit, f: { ...mEdit.f, supports_tools: v } })} label="支援工具呼叫" />
            </div>
            <ErrorNote error={error} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setMEdit(null)}>
                取消
              </Button>
              <Button onClick={saveModel}>儲存</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!rEdit} onClose={() => setREdit(null)} title={rEdit?.id ? "編輯路由" : `新增路由到 ${rEdit?.model}`}>
        {rEdit && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>供應商</Label>
                <Select className="w-full" value={rEdit.f.provider_id} onChange={(e) => setREdit({ ...rEdit, f: { ...rEdit.f, provider_id: e.target.value } })}>
                  {providers.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>上游模型名稱</Label>
                <Input value={rEdit.f.upstream_model} placeholder="gpt-4o" onChange={(e) => setREdit({ ...rEdit, f: { ...rEdit.f, upstream_model: e.target.value } })} />
              </div>
              <div>
                <Label hint="小 = 優先">優先序</Label>
                <Input inputMode="numeric" value={rEdit.f.priority} onChange={(e) => setREdit({ ...rEdit, f: { ...rEdit.f, priority: e.target.value } })} />
              </div>
              <div>
                <Label hint="預設 1，可加成或折扣">倍率</Label>
                <Input inputMode="decimal" value={rEdit.f.ratio} onChange={(e) => setREdit({ ...rEdit, f: { ...rEdit.f, ratio: e.target.value } })} />
              </div>
              <div>
                <Label hint="官方牌價 USD / 1M tokens">輸入價</Label>
                <Input inputMode="decimal" value={rEdit.f.input_usd} onChange={(e) => setREdit({ ...rEdit, f: { ...rEdit.f, input_usd: e.target.value } })} />
              </div>
              <div>
                <Label hint="官方牌價 USD / 1M tokens">輸出價</Label>
                <Input inputMode="decimal" value={rEdit.f.output_usd} onChange={(e) => setREdit({ ...rEdit, f: { ...rEdit.f, output_usd: e.target.value } })} />
              </div>
            </div>
            <div>
              <Label hint="意圖路由用">標籤</Label>
              <div className="flex flex-wrap gap-1.5">
                {TAGS.map((t) => {
                  const on = rEdit.f.tags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setREdit({ ...rEdit, f: { ...rEdit.f, tags: on ? rEdit.f.tags.filter((x) => x !== t) : [...rEdit.f.tags, t] } })}
                      className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"}`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <ErrorNote error={error} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setREdit(null)}>
                取消
              </Button>
              <Button onClick={saveRoute} disabled={!rEdit.f.provider_id || !rEdit.f.upstream_model}>
                儲存
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
