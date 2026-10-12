"use client";

import { useEffect, useState } from "react";
import { Badge, ErrorNote, PageHeader, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { currency, fmtCompact } from "@/lib/format";

function fmtUnitPrice(v: number): string {
  return `${v.toLocaleString("en-US", { maximumFractionDigits: v >= 1 ? 4 : 6 })} ${currency()}`;
}
import type { HubModel } from "@/lib/types";

const strategyLabel: Record<string, string> = { failover: "自動備援", cost: "成本優先", latency: "延遲優先", intent: "意圖路由" };

export default function ModelsPage() {
  const [models, setModels] = useState<HubModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ data: HubModel[] }>("/api/models")
      .then((r) => setModels(r.data))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <PageHeader title="模型與價格" description={`以 model 欄位指定 Hub 模型名稱。價格為最便宜可用路由，每 1M tokens 的 ${currency()}；實際扣款依處理請求的路由計算。`} />
      <ErrorNote error={error} />
      <Table head={["Model ID", "說明", "等級", "路由策略", "Context", "能力", `輸入 / 1M`, `輸出 / 1M`, ""]}>
        {models.map((m) => (
          <tr key={m.id} className={m.available ? "" : "opacity-50"}>
            <td className="px-3 py-2 font-mono text-xs">{m.id}</td>
            <td className="px-3 py-2">
              <div className="font-medium">{m.name}</div>
              <div className="text-xs text-muted">{m.description}</div>
            </td>
            <td className="px-3 py-2">
              <Badge tone={m.tier === "premium" ? "accent" : "neutral"}>{m.tier}</Badge>
            </td>
            <td className="px-3 py-2 text-xs">{strategyLabel[m.strategy] ?? m.strategy}</td>
            <td className="px-3 py-2 tabular-nums">{fmtCompact(m.context_window)}</td>
            <td className="whitespace-nowrap px-3 py-2 text-xs">
              {m.supports_vision && "視覺 "}
              {m.supports_tools && "工具"}
            </td>
            <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtUnitPrice(m.price_per_1m_input)}</td>
            <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtUnitPrice(m.price_per_1m_output)}</td>
            <td className="px-3 py-2 text-xs">{m.available ? "" : "需升級"}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
