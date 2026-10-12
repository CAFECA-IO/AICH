"use client";

import { useEffect, useState } from "react";
import { TopNav } from "@/components/top_nav";
import { Badge, Card, LinkButton } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtCompact, fmtPrice } from "@/lib/format";
import type { Plan } from "@/lib/types";

const features = [
  { title: "統一入口", body: "完全相容 OpenAI API。只要改 Base URL 與 API Key，既有程式碼不用改就能切換 OpenAI、Anthropic、Gemini、DeepSeek、Mistral 等模型。" },
  { title: "智能路由", body: "依任務類型、預算與即時延遲，自動把請求派送到最合適的模型與節點。" },
  { title: "自動備援", body: "供應商回傳 5xx、逾時或限流時，秒級切換到備用模型；斷路器自動隔離故障節點。" },
  { title: "通用點數", body: "1 點 = US$0.000001。所有模型的輸入/輸出 Token 統一換算成點數，一份帳單看懂全部用量。" },
  { title: "金鑰池與輪替", body: "多把上游金鑰加權輪替，遇到限流自動冷卻；企業方案可帶自己的金鑰池（BYOK）。" },
  { title: "隱私與風控", body: "零數據留存選項、RPM/TPM 限流、異常流量自動封鎖、敏感詞與 Prompt Injection 防護。" },
];

const strategies = [
  ["自動備援 Failover", "主要模型錯誤或逾時時依優先序切換備用模型", "企業級高可用需求"],
  ["成本優先 Cost", "估算每個候選的成本，挑最便宜的健康節點", "預算敏感、摘要分類等簡單任務"],
  ["延遲優先 Latency", "依即時 EWMA 延遲 / TTFT 挑最快的節點", "即時對話、客服系統"],
  ["意圖路由 Intent", "辨識程式碼、長文本、推理、視覺等意圖再派送", "複雜多樣化的開發需求"],
];

export default function Home() {
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => {
    api<{ data: Plan[] }>("/api/plans")
      .then((r) => setPlans(r.data))
      .catch(() => setPlans([]));
  }, []);

  return (
    <>
      <TopNav />
      <main>
        <section className="mx-auto max-w-5xl px-4 pb-16 pt-20 text-center">
          <Badge tone="accent">AI Computing Hub</Badge>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">一鍵訂閱，全網 AI 模型通用</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            不用再分別維護 OpenAI、Anthropic、Google、Mistral、DeepSeek 的帳號與金鑰。AICH 以單一入口、統一 API 與智能路由，讓你專心打造產品。
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <LinkButton href="/register">免費開始</LinkButton>
            <LinkButton href="/docs" variant="secondary">
              查看 API 文件
            </LinkButton>
          </div>
          <pre className="mx-auto mt-10 max-w-2xl overflow-x-auto rounded-xl border border-border bg-surface p-4 text-left text-xs leading-relaxed">
            {`from openai import OpenAI

client = OpenAI(base_url="https://<your-hub>/v1", api_key="sk-hub-...")
resp = client.chat.completions.create(
    model="hub-auto",            # 或 hub-claude-sonnet、hub-gemini-pro …
    messages=[{"role": "user", "content": "幫我重構這段程式碼"}],
)`}
          </pre>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title}>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted">{f.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16">
          <h2 className="mb-4 text-2xl font-semibold">四種路由策略</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2">策略</th>
                  <th className="px-4 py-2">運作邏輯</th>
                  <th className="px-4 py-2">適用場景</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {strategies.map((s) => (
                  <tr key={s[0]}>
                    <td className="px-4 py-3 font-medium">{s[0]}</td>
                    <td className="px-4 py-3 text-muted">{s[1]}</td>
                    <td className="px-4 py-3 text-muted">{s[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-4 pb-24">
          <h2 className="mb-1 text-2xl font-semibold">方案與價格</h2>
          <p className="mb-6 text-sm text-muted">訂閱月費 + 通用點數。1 點 = US$0.000001。</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <Card key={p.id} className={p.id === "pro" ? "border-accent ring-2 ring-accent/20" : ""}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.id === "pro" && <Badge tone="accent">最受歡迎</Badge>}
                </div>
                <div className="mt-3 text-3xl font-bold">
                  {p.id === "enterprise" ? `${fmtPrice(p.monthly_price_cents)}+` : fmtPrice(p.monthly_price_cents)}
                  {p.monthly_price_cents > 0 && <span className="text-sm font-normal text-muted"> / 月</span>}
                </div>
                <div className="mt-1 text-sm text-muted">每月 {fmtCompact(p.monthly_credits)} 點</div>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-success">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
            {plans.length === 0 && <p className="text-sm text-muted">方案資料載入中（請確認 Gateway 已啟動）。</p>}
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-8 text-center text-xs text-muted">© {new Date().getFullYear()} CAFECA · AICH AI Computing Hub</footer>
    </>
  );
}
