"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart } from "@/components/bar_chart";
import { Card, ErrorNote, PageHeader, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth_context";
import { creditsToUsd, fmtCompact, fmtMs, fmtNumber } from "@/lib/format";

interface Usage {
  daily: { day: string; requests: number; credits: number; prompt_tokens: number; completion_tokens: number }[];
  by_model: { model: string; requests: number; credits: number; prompt_tokens: number; completion_tokens: number; avg_latency_ms: number }[];
  totals: { requests: number; tokens: number; credits: number; success_rate: number; cache_hits: number };
}

export default function Overview() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Usage>("/api/usage?days=30")
      .then(setUsage)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader title={`嗨，${user?.name || user?.email || "你好"}`} description="過去 30 天的使用概況" />
      <ErrorNote error={error} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="點數餘額" value={fmtCompact(user?.credit_balance)} sub={`≈ ${creditsToUsd(user?.credit_balance)}`} />
        <Stat label="目前方案" value={user?.plan?.name ?? "—"} sub={<Link className="text-accent" href="/dashboard/settings">管理方案 →</Link>} />
        <Stat label="30 天請求數" value={fmtNumber(usage?.totals.requests)} sub={`成功率 ${usage?.totals.success_rate ?? 100}% · 快取命中 ${fmtNumber(usage?.totals.cache_hits)}`} />
        <Stat label="30 天消耗點數" value={fmtCompact(usage?.totals.credits)} sub={`${fmtCompact(usage?.totals.tokens)} tokens`} />
      </div>
      <Card className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">每日點數消耗</h2>
        <BarChart data={(usage?.daily ?? []).map((d) => ({ label: d.day.slice(5), value: Number(d.credits) }))} unit=" 點" />
      </Card>
      <Card className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">各模型用量</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1.5">模型</th>
                <th>請求</th>
                <th>輸入 tokens</th>
                <th>輸出 tokens</th>
                <th>點數</th>
                <th>平均延遲</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {usage?.by_model.map((m) => (
                <tr key={m.model}>
                  <td className="py-2 font-medium">{m.model}</td>
                  <td>{fmtNumber(m.requests)}</td>
                  <td>{fmtNumber(m.prompt_tokens)}</td>
                  <td>{fmtNumber(m.completion_tokens)}</td>
                  <td>{fmtNumber(m.credits)}</td>
                  <td>{fmtMs(m.avg_latency_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {usage && usage.by_model.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">
              還沒有用量。到 <Link className="text-accent" href="/chat">聊天</Link> 試試看，或建立 API 金鑰串接你的應用。
            </p>
          )}
        </div>
      </Card>
    </>
  );
}
