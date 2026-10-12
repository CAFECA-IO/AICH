"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, ErrorNote, Input, Label, PageHeader, Table } from "@/components/ui";
import { api } from "@/lib/api";

interface Route {
  id: string;
  provider_id: string;
  upstream_model: string;
  input_price: number; // µUSD per 1M tokens (official list price)
  output_price: number;
  ratio_bp: number;
  enabled: boolean;
}
interface Model {
  id: string;
  display_name: string;
  tier: string;
  enabled: boolean;
  routes: Route[];
}
interface Billing {
  currency: string;
  base: number;
}

const usd = (micro: number) => micro / 1_000_000;
const iscPerM = (micro: number, ratioBp: number, base: number) => usd(micro) * (ratioBp / 10_000) * base;
const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 2 : v >= 1 ? 4 : 6 });

/** Example workload used for the "typical request" column. */
const SAMPLE_IN = 1_000;
const SAMPLE_OUT = 500;

export default function PricingAdmin() {
  const [models, setModels] = useState<Model[]>([]);
  const [saved, setSaved] = useState<Billing>({ currency: "ISC", base: 1 });
  const [draft, setDraft] = useState({ currency: "ISC", base: "1" });
  const [ratios, setRatios] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ billing?: Billing }>("/admin/settings").then((s) => {
      const b = s.billing ?? { currency: "ISC", base: 1 };
      setSaved(b);
      setDraft({ currency: b.currency, base: String(b.base) });
    });
    api<{ data: Model[] }>("/admin/models")
      .then((r) => setModels(r.data))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const draftBase = Number(draft.base);
  const baseValid = Number.isFinite(draftBase) && draftBase > 0;
  const previewBase = baseValid ? draftBase : saved.base;
  const changed = baseValid && (draftBase !== saved.base || draft.currency.trim() !== saved.currency);

  const rows = useMemo(
    () =>
      models
        .filter((m) => m.enabled)
        .flatMap((m) => m.routes.filter((r) => r.enabled).map((r) => ({ m, r })))
        .filter(({ r }) => r.provider_id !== "mock"),
    [models],
  );

  async function saveBilling() {
    setError(null);
    setMsg(null);
    try {
      await api("/admin/settings/billing", { method: "PUT", body: { currency: draft.currency.trim(), base: draftBase } });
      setMsg(`已更新：費用基數 ${draftBase}，所有模型價格已同步調整`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveRatio(r: Route) {
    const v = Number(ratios[r.id]);
    if (!Number.isFinite(v) || v <= 0) {
      setError("倍率必須是大於 0 的數字");
      return;
    }
    setError(null);
    try {
      await api(`/admin/routes/${r.id}`, { method: "PATCH", body: { ratio_bp: Math.round(v * 10_000) } });
      setRatios((x) => {
        const n = { ...x };
        delete n[r.id];
        return n;
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const cur = draft.currency.trim() || "ISC";

  return (
    <>
      <PageHeader
        title={`${saved.currency} 計價`}
        description="每個模型保留各家官方收費比例（USD / 1M tokens），乘上統一的費用基數換算成 ISC。調整基數即可一次調整整體收費。"
      />
      <div className="mb-4 space-y-2">
        <ErrorNote error={error} />
        {msg && <div className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{msg}</div>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card>
          <h2 className="mb-4 font-semibold">費用基數</h2>
          <div className="space-y-3">
            <div>
              <Label hint="1 USD 官方價格 = ? ISC">基數</Label>
              <Input inputMode="decimal" value={draft.base} onChange={(e) => setDraft({ ...draft, base: e.target.value })} />
            </div>
            <div>
              <Label hint="顯示用代號">計價單位</Label>
              <Input value={draft.currency} maxLength={12} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} />
            </div>
            <div className="rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted">
              <div className="font-mono text-text">
                費用 = (輸入 tokens × 輸入價 + 輸出 tokens × 輸出價) ÷ 1,000,000 × 倍率 × 基數
              </div>
              <div className="mt-2">
                輸入價、輸出價是各模型的官方牌價（USD / 1M tokens），在「模型映射」中設定。倍率預設 1，可針對個別路由加成或折扣。
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={saveBilling} disabled={!changed}>
                儲存並套用
              </Button>
              {changed && (
                <Badge tone="warning">
                  預覽中：{saved.base} → {previewBase}（×{fmt(previewBase / saved.base)}）
                </Badge>
              )}
            </div>
          </div>
        </Card>

        <Card className="text-sm">
          <h2 className="mb-2 font-semibold">試算</h2>
          <p className="text-muted">
            以基數 <b className="text-text">{previewBase}</b> 計算：官方價 US$1 的用量收 <b className="text-text">{fmt(previewBase)} {cur}</b>。下表「一次請求」以輸入 {SAMPLE_IN.toLocaleString()} + 輸出{" "}
            {SAMPLE_OUT.toLocaleString()} tokens 估算。
          </p>
        </Card>
      </div>

      <h2 className="mt-8 mb-3 font-semibold">各模型價格（{cur} / 1M tokens）</h2>
      <Table head={["Hub 模型", "路由", "官方價 輸入 / 輸出 (USD)", "倍率", `輸入 (${cur})`, `輸出 (${cur})`, "一次請求"]} empty={rows.length === 0}>
        {rows.map(({ m, r }) => {
          const ratioBp = ratios[r.id] !== undefined && Number(ratios[r.id]) > 0 ? Math.round(Number(ratios[r.id]) * 10_000) : r.ratio_bp;
          const inP = iscPerM(r.input_price, ratioBp, previewBase);
          const outP = iscPerM(r.output_price, ratioBp, previewBase);
          const sample = (SAMPLE_IN * inP + SAMPLE_OUT * outP) / 1_000_000;
          return (
            <tr key={r.id}>
              <td className="px-3 py-2">
                <div className="font-mono text-xs font-medium">{m.id}</div>
                <div className="text-xs text-muted">{m.display_name}</div>
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {r.provider_id} / {r.upstream_model}
              </td>
              <td className="px-3 py-2 tabular-nums text-xs">
                ${fmt(usd(r.input_price))} / ${fmt(usd(r.output_price))}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <Input
                    className="w-20"
                    inputMode="decimal"
                    value={ratios[r.id] ?? String(r.ratio_bp / 10_000)}
                    onChange={(e) => setRatios({ ...ratios, [r.id]: e.target.value })}
                  />
                  {ratios[r.id] !== undefined && Number(ratios[r.id]) * 10_000 !== r.ratio_bp && (
                    <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => saveRatio(r)}>
                      儲存
                    </Button>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 tabular-nums">{fmt(inP)}</td>
              <td className="px-3 py-2 tabular-nums">{fmt(outP)}</td>
              <td className="px-3 py-2 tabular-nums text-xs text-muted">{fmt(sample)}</td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
