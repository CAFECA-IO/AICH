import { TopNav } from "@/components/top_nav";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/v1";

function Code({ children }: { children: string }) {
  return <pre className="my-3 overflow-x-auto rounded-xl border border-border bg-surface p-4 text-xs leading-relaxed">{children}</pre>;
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-12 mb-3 scroll-mt-20 text-xl font-semibold">
      {children}
    </h2>
  );
}

const headers = [
  ["X-Hub-Strategy", "請求", "覆寫路由策略：failover | cost | latency | intent"],
  ["X-Hub-Intent", "請求", "直接指定意圖：code | long_context | reasoning | vision | simple | general"],
  ["X-Hub-Cache", "請求", "true / false：強制啟用或略過回應快取（預設僅 temperature=0 時啟用）"],
  ["x-hub-provider / x-hub-upstream-model", "回應", "實際處理請求的供應商與上游模型"],
  ["x-hub-attempts", "回應", "嘗試次數；大於 1 代表觸發了自動備援"],
  ["x-hub-credits", "回應", "本次扣除點數（串流請求請看 usage 區塊）"],
  ["x-hub-cache", "回應", "hit | miss | bypass"],
  ["x-hub-request-id", "回應", "請求 ID，可在用量日誌中查詢"],
];

const errors = [
  ["400", "content_policy_violation / bad_request", "請求格式錯誤或觸發內容防護"],
  ["401", "invalid_api_key", "金鑰無效、已撤銷或過期"],
  ["402", "insufficient_quota", "點數不足或金鑰額度用盡"],
  ["403", "forbidden", "方案不含此模型 / API 存取，或金鑰不允許此模型"],
  ["404", "model_not_found", "模型名稱不存在"],
  ["429", "rate_limit_exceeded", "超過 RPM / TPM 上限；持續超限的金鑰會被自動停用"],
  ["502", "upstream_unavailable", "所有候選上游都失敗"],
  ["503", "no_available_upstream", "沒有健康的上游（斷路器開啟或預算用盡）"],
];

export default function DocsPage() {
  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold">開發者文件</h1>
        <p className="mt-3 text-muted">
          AICH 完全相容 OpenAI Chat Completions API。把 SDK 的 Base URL 換成 <code className="rounded bg-surface-2 px-1">{BASE}</code>、API Key 換成在控制台建立的
          <code className="rounded bg-surface-2 px-1">sk-hub-…</code>，就能使用所有模型。
        </p>

        <H2 id="quickstart">快速開始</H2>
        <h3 className="font-medium">Python（openai SDK）</h3>
        <Code>{`from openai import OpenAI

client = OpenAI(base_url="${BASE}", api_key="sk-hub-...")

stream = client.chat.completions.create(
    model="hub-auto",
    messages=[{"role": "user", "content": "用 Rust 寫一個 LRU cache"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")`}</Code>
        <h3 className="font-medium">Node.js</h3>
        <Code>{`import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${BASE}", apiKey: process.env.AICH_API_KEY });
const r = await client.chat.completions.create({
  model: "hub-claude-sonnet",
  messages: [{ role: "user", content: "Explain SSE in one paragraph" }],
});
console.log(r.choices[0].message.content);`}</Code>
        <h3 className="font-medium">cURL</h3>
        <Code>{`curl ${BASE}/chat/completions \\
  -H "Authorization: Bearer $AICH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "X-Hub-Strategy: cost" \\
  -d '{"model":"hub-auto-cheap","messages":[{"role":"user","content":"Summarize: ..."}]}'`}</Code>

        <H2 id="models">模型命名</H2>
        <p className="text-sm text-muted">
          使用 <code>GET /v1/models</code> 取得你的方案可用的模型。<code>hub-auto</code>（意圖路由）、<code>hub-auto-cheap</code>（成本優先）、<code>hub-auto-fast</code>（延遲優先）是虛擬模型，會依策略挑選實際上游；
          其他如 <code>hub-gpt-4o</code>、<code>hub-claude-sonnet</code> 對應固定模型並設有備援。完整清單與價格請見控制台的「模型與價格」。
        </p>

        <H2 id="features">支援的功能</H2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>串流（SSE），含 <code>stream_options.include_usage</code></li>
          <li>Function / Tool calling（自動轉換為 Anthropic tool_use 與 Gemini functionCall）</li>
          <li>圖片輸入（<code>image_url</code>，支援 data URL 與 https URL）</li>
          <li>
            <code>response_format</code> JSON 模式、<code>stop</code>、<code>temperature</code>、<code>top_p</code>、<code>max_tokens</code> / <code>max_completion_tokens</code>
          </li>
          <li>
            也接受 <code>x-api-key</code> 標頭作為金鑰
          </li>
        </ul>

        <H2 id="headers">AICH 擴充標頭</H2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-border">
              {headers.map((h) => (
                <tr key={h[0]}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{h[0]}</td>
                  <td className="px-3 py-2 text-xs text-muted">{h[1]}</td>
                  <td className="px-3 py-2 text-xs">{h[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H2 id="billing">點數計費</H2>
        <p className="text-sm text-muted">
          1 點 = US$0.000001。每個上游路由都有「每百萬 tokens 點數」的輸入與輸出價格，扣點 = ⌈(輸入 tokens × 輸入價 + 輸出 tokens × 輸出價) ÷ 1,000,000⌉。
          例如輸入價 3,000,000（= US$3 / 1M tokens）時，輸入 1,000 tokens 扣 3,000 點。快取命中不扣點。
        </p>

        <H2 id="errors">錯誤碼</H2>
        <p className="mb-2 text-sm text-muted">錯誤採用 OpenAI 格式：{`{"error": {"message", "type", "code"}}`}</p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-border">
              {errors.map((e) => (
                <tr key={e[0] + e[1]}>
                  <td className="px-3 py-2 font-mono text-xs">{e[0]}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e[1]}</td>
                  <td className="px-3 py-2 text-xs">{e[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
