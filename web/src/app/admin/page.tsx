"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart } from "@/components/bar_chart";
import { Badge, Button, Card, ErrorNote, PageHeader, Select, Stat, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { creditsToUsd, fmtCompact, fmtMs, fmtNumber } from "@/lib/format";

interface Overview {
  totals: Record<string, number>;
  by_provider: { provider_id: string; requests: number; credits: number; success_rate: number; avg_latency_ms: number; avg_ttft_ms: number | null; p95_latency_ms: number; prompt_tokens: number; completion_tokens: number }[];
  by_model: { model: string; requests: number; credits: number; avg_latency_ms: number }[];
  timeline: { bucket: string; requests: number; errors: number; credits: number }[];
  users: { total: number; paying: number; new_7d: number };
}

interface Health {
  targets: { target: string; state: string; ewma_latency_ms: number | null; ewma_ttft_ms: number | null; successes: number; failures: number; consecutive_failures: number; last_error: string | null }[];
  key_cooldowns: { key_id: string; seconds_left: number; reason: string }[];
  providers: { provider_id: string; enabled: boolean; month_spend: number; monthly_budget: number | null; budget_exceeded: boolean; keys: number }[];
  kv_backend: string;
}

export default function AdminOverview() {
  const [hours, setHours] = useState(24);
  const [ov, setOv] = useState<Overview | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Overview>(`/admin/overview?hours=${hours}`).then(setOv).catch((e) => setError(e.message));
    api<Health>("/admin/health").then(setHealth).catch((e) => setError(e.message));
  }, [hours]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const t = ov?.totals ?? {};
  return (
    <>
      <PageHeader
        title="監控總覽"
        description={`即時健康狀態每 15 秒更新 · 限流/快取後端：${health?.kv_backend ?? "—"}`}
        actions={
          <>
            <Select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              <option value={1}>近 1 小時</option>
              <option value={24}>近 24 小時</option>
              <option value={168}>近 7 天</option>
              <option value={720}>近 30 天</option>
            </Select>
            <Button variant="secondary" onClick={load}>
              重新整理
            </Button>
          </>
        }
      />
      <ErrorNote error={error} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="請求數" value={fmtNumber(t.requests)} sub={`成功率 ${t.success_rate ?? 100}% · 備援 ${fmtNumber(t.failovers)} 次`} />
        <Stat label="Tokens" value={fmtCompact(Number(t.prompt_tokens ?? 0) + Number(t.completion_tokens ?? 0))} sub={`快取命中 ${fmtNumber(t.cache_hits)}`} />
        <Stat label="營收點數" value={fmtCompact(t.credits)} sub={`≈ ${creditsToUsd(t.credits)}`} />
        <Stat label="平均延遲 / TTFT" value={fmtMs(t.avg_latency_ms)} sub={`TTFT ${fmtMs(t.avg_ttft_ms)} · 活躍用戶 ${fmtNumber(t.active_users)}`} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat label="總用戶" value={fmtNumber(ov?.users.total)} />
        <Stat label="付費用戶" value={fmtNumber(ov?.users.paying)} />
        <Stat label="7 天新增" value={fmtNumber(ov?.users.new_7d)} />
      </div>
      <Card className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">每小時請求數</h2>
        <BarChart data={(ov?.timeline ?? []).map((b) => ({ label: b.bucket.slice(5).replace("T", " "), value: Number(b.requests) }))} />
      </Card>

      <h2 className="mt-8 mb-3 font-semibold">供應商表現</h2>
      <Table head={["供應商", "請求", "成功率", "平均延遲", "P95", "TTFT", "Tokens", "點數"]} empty={!ov?.by_provider.length}>
        {ov?.by_provider.map((p) => (
          <tr key={p.provider_id}>
            <td className="px-3 py-2 font-medium">{p.provider_id}</td>
            <td className="px-3 py-2 tabular-nums">{fmtNumber(p.requests)}</td>
            <td className="px-3 py-2">
              <Badge tone={p.success_rate >= 99 ? "success" : p.success_rate >= 95 ? "warning" : "danger"}>{p.success_rate}%</Badge>
            </td>
            <td className="px-3 py-2 tabular-nums">{fmtMs(p.avg_latency_ms)}</td>
            <td className="px-3 py-2 tabular-nums">{fmtMs(p.p95_latency_ms)}</td>
            <td className="px-3 py-2 tabular-nums">{fmtMs(p.avg_ttft_ms)}</td>
            <td className="px-3 py-2 tabular-nums">{fmtCompact(Number(p.prompt_tokens) + Number(p.completion_tokens))}</td>
            <td className="px-3 py-2 tabular-nums">{fmtNumber(p.credits)}</td>
          </tr>
        ))}
      </Table>

      <h2 className="mt-8 mb-3 font-semibold">即時節點健康（斷路器）</h2>
      <Table head={["上游節點", "狀態", "EWMA 延遲", "EWMA TTFT", "成功 / 失敗", "連續失敗", "最近錯誤", ""]} empty={!health?.targets.length}>
        {health?.targets.map((h) => (
          <tr key={h.target}>
            <td className="px-3 py-2 font-mono text-xs">{h.target}</td>
            <td className="px-3 py-2">
              <Badge tone={h.state === "closed" ? "success" : h.state === "open" ? "danger" : "warning"}>{h.state}</Badge>
            </td>
            <td className="px-3 py-2 tabular-nums">{fmtMs(h.ewma_latency_ms)}</td>
            <td className="px-3 py-2 tabular-nums">{fmtMs(h.ewma_ttft_ms)}</td>
            <td className="px-3 py-2 tabular-nums">
              {fmtNumber(h.successes)} / {fmtNumber(h.failures)}
            </td>
            <td className="px-3 py-2 tabular-nums">{h.consecutive_failures}</td>
            <td className="max-w-xs truncate px-3 py-2 text-xs text-danger" title={h.last_error ?? ""}>
              {h.last_error ?? ""}
            </td>
            <td className="px-3 py-2">
              {h.state !== "closed" && (
                <Button variant="ghost" className="text-xs" onClick={() => api("/admin/health/reset", { body: { target: h.target } }).then(load)}>
                  重設
                </Button>
              )}
            </td>
          </tr>
        ))}
      </Table>

      <h2 className="mt-8 mb-3 font-semibold">本月預算與金鑰</h2>
      <Table head={["供應商", "啟用", "共用金鑰", "本月花費（點）", "月預算", "狀態"]}>
        {health?.providers.map((p) => (
          <tr key={p.provider_id}>
            <td className="px-3 py-2 font-medium">{p.provider_id}</td>
            <td className="px-3 py-2">{p.enabled ? "✓" : "—"}</td>
            <td className="px-3 py-2 tabular-nums">{p.keys}</td>
            <td className="px-3 py-2 tabular-nums">{fmtNumber(p.month_spend)}</td>
            <td className="px-3 py-2 tabular-nums">{p.monthly_budget ? fmtNumber(p.monthly_budget) : "不限"}</td>
            <td className="px-3 py-2">
              {p.budget_exceeded ? <Badge tone="danger">預算斷路</Badge> : p.keys === 0 ? <Badge tone="warning">無金鑰</Badge> : <Badge tone="success">正常</Badge>}
            </td>
          </tr>
        ))}
      </Table>
      {!!health?.key_cooldowns.length && (
        <p className="mt-3 text-xs text-muted">
          冷卻中的金鑰：{health.key_cooldowns.map((k) => `${k.key_id.slice(0, 8)}（${k.reason}, ${k.seconds_left}s）`).join("、")}
        </p>
      )}
    </>
  );
}
