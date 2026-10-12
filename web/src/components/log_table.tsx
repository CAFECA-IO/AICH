"use client";

import { Badge, Table } from "@/components/ui";
import { fmtDate, fmtMs, fmtNumber } from "@/lib/format";
import type { RequestLog } from "@/lib/types";

export function LogTable({ logs, showUser = false }: { logs: RequestLog[]; showUser?: boolean }) {
  const head = ["時間", ...(showUser ? ["用戶"] : []), "模型", "實際路由", "策略", "狀態", "Tokens (入/出)", "點數", "延遲 / TTFT", "嘗試"];
  return (
    <Table head={head} empty={logs.length === 0}>
      {logs.map((l) => (
        <tr key={l.id} className="align-top">
          <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{fmtDate(l.created_at)}</td>
          {showUser && <td className="px-3 py-2 text-xs">{l.email ?? "—"}</td>}
          <td className="px-3 py-2 font-medium">
            {l.model}
            {l.api_key_name && <div className="text-[11px] font-normal text-muted">key: {l.api_key_name}</div>}
          </td>
          <td className="px-3 py-2 text-xs">{l.provider_id ? `${l.provider_id} / ${l.upstream_model}` : "—"}</td>
          <td className="px-3 py-2 text-xs">
            {l.strategy}
            {l.intent && <div className="text-muted">{l.intent}</div>}
          </td>
          <td className="px-3 py-2">
            <Badge tone={l.status_code < 400 ? "success" : l.status_code === 499 ? "warning" : "danger"}>{l.status_code}</Badge>
            {l.cached && (
              <span className="ml-1">
                <Badge tone="accent">cache</Badge>
              </span>
            )}
            {l.error && <div className="mt-1 max-w-xs truncate text-[11px] text-danger" title={l.error}>{l.error}</div>}
          </td>
          <td className="whitespace-nowrap px-3 py-2 tabular-nums">
            {fmtNumber(l.prompt_tokens)} / {fmtNumber(l.completion_tokens)}
          </td>
          <td className="px-3 py-2 tabular-nums">{fmtNumber(l.credits)}</td>
          <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs">
            {fmtMs(l.latency_ms)} / {fmtMs(l.ttft_ms)}
          </td>
          <td className="px-3 py-2 tabular-nums">{l.attempts}</td>
        </tr>
      ))}
    </Table>
  );
}
