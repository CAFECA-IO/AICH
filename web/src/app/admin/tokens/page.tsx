"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, ErrorNote, Input, PageHeader, Toggle } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";

interface Provider {
  id: string;
  kind: string;
  name: string;
  base_url: string;
  enabled: boolean;
  shared_keys: number;
}

interface PKey {
  id: string;
  owner_email: string | null;
  label: string;
  key_last4: string;
  enabled: boolean;
  weight: number;
  created_at: string;
}

interface TestResult {
  ok: boolean;
  latency_ms: number;
  model_count?: number;
  models?: string[];
  status?: number | null;
  message?: string | null;
}

/** Where to get an API key for the built-in providers. */
const CONSOLE: Record<string, { url: string; hint: string }> = {
  openai: { url: "https://platform.openai.com/api-keys", hint: "sk-…" },
  anthropic: { url: "https://console.anthropic.com/settings/keys", hint: "sk-ant-…" },
  gemini: { url: "https://aistudio.google.com/app/apikey", hint: "AIza…" },
  deepseek: { url: "https://platform.deepseek.com/api_keys", hint: "sk-…" },
  mistral: { url: "https://console.mistral.ai/api-keys", hint: "API key" },
};

function TestBadge({ r }: { r: TestResult | undefined }) {
  if (!r) return null;
  return r.ok ? (
    <Badge tone="success">
      可用 · {r.model_count} 個模型 · {r.latency_ms}ms
    </Badge>
  ) : (
    <Badge tone="danger">
      失敗{r.status ? ` ${r.status}` : ""}：{(r.message ?? "").slice(0, 80)}
    </Badge>
  );
}

function ProviderCard({ p, onChanged }: { p: Provider; onChanged: () => void }) {
  const [keys, setKeys] = useState<PKey[]>([]);
  const [cooldowns, setCooldowns] = useState<{ key_id: string; seconds_left: number; reason: string }[]>([]);
  const [secret, setSecret] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftTest, setDraftTest] = useState<TestResult | undefined>();
  const [tests, setTests] = useState<Record<string, TestResult>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ data: PKey[]; cooldowns: typeof cooldowns }>(`/admin/providers/${p.id}/keys`)
      .then((r) => {
        setKeys(r.data.filter((k) => !k.owner_email));
        setCooldowns(r.cooldowns);
      })
      .catch((e) => setError(e.message));
  }, [p.id]);
  useEffect(load, [load]);

  async function testAndSave(force = false) {
    setBusy(true);
    setError(null);
    try {
      if (!force) {
        const r = await api<TestResult>(`/admin/providers/${p.id}/test-key`, { body: { key: secret } });
        setDraftTest(r);
        if (!r.ok) return;
      }
      await api(`/admin/providers/${p.id}/keys`, { body: { key: secret, label } });
      setSecret("");
      setLabel("");
      setDraftTest(undefined);
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function testStored(k: PKey) {
    setTests((t) => ({ ...t, [k.id]: { ok: false, latency_ms: 0, message: "測試中…" } }));
    try {
      const r = await api<TestResult>(`/admin/provider-keys/${k.id}/test`, { body: {} });
      setTests((t) => ({ ...t, [k.id]: r }));
      load();
    } catch (e) {
      setTests((t) => ({ ...t, [k.id]: { ok: false, latency_ms: 0, message: (e as Error).message } }));
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const vendor = CONSOLE[p.id];
  const active = keys.filter((k) => k.enabled).length;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{p.name}</h2>
            <Badge>{p.kind}</Badge>
            {active > 0 ? <Badge tone="success">已託管 {active} 把</Badge> : <Badge tone="warning">尚未託管</Badge>}
            {!p.enabled && <Badge tone="danger">供應商已停用</Badge>}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted">{p.base_url}</div>
        </div>
        {vendor && (
          <a href={vendor.url} target="_blank" rel="noreferrer" className="text-xs text-accent">
            取得 API Key ↗
          </a>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
        <Input
          type="password"
          autoComplete="off"
          placeholder={`貼上 ${p.name} API Key（${vendor?.hint ?? "API key"}）`}
          value={secret}
          onChange={(e) => {
            setSecret(e.target.value);
            setDraftTest(undefined);
          }}
        />
        <Input placeholder="標籤（選填）" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button onClick={() => testAndSave(false)} disabled={!secret.trim() || busy}>
          {busy ? "測試中…" : "測試並託管"}
        </Button>
      </div>
      {draftTest && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <TestBadge r={draftTest} />
          {!draftTest.ok && (
            <button className="text-muted underline" onClick={() => testAndSave(true)}>
              仍要儲存
            </button>
          )}
        </div>
      )}
      <ErrorNote error={error} />

      {keys.length > 0 && (
        <div className="mt-4 divide-y divide-border rounded-lg border border-border">
          {keys.map((k) => {
            const cd = cooldowns.find((c) => c.key_id === k.id);
            return (
              <div key={k.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-xs">••••{k.key_last4}</span>
                  {k.label && <span className="ml-2 text-muted">{k.label}</span>}
                  <span className="ml-2 text-xs text-muted">{fmtDate(k.created_at)}</span>
                  {cd && (
                    <span className="ml-2">
                      <Badge tone="warning">
                        冷卻 {cd.seconds_left}s（{cd.reason === "rate_limited" ? "限流" : "驗證失敗"}）
                      </Badge>
                    </span>
                  )}
                  {tests[k.id] && (
                    <div className="mt-1">
                      <TestBadge r={tests[k.id]} />
                    </div>
                  )}
                </div>
                <Button variant="ghost" className="text-xs" onClick={() => testStored(k)}>
                  測試
                </Button>
                <Toggle checked={k.enabled} onChange={(v) => act(() => api(`/admin/provider-keys/${k.id}`, { method: "PATCH", body: { enabled: v } }))} />
                <Button
                  variant="ghost"
                  className="text-xs text-danger"
                  onClick={() => confirm(`移除 ••••${k.key_last4}？`) && act(() => api(`/admin/provider-keys/${k.id}`, { method: "DELETE" }))}
                >
                  移除
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function TokensAdmin() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ data: Provider[] }>("/admin/providers")
      .then((r) => setProviders(r.data.filter((p) => p.kind !== "mock")))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const hosted = providers.filter((p) => p.shared_keys > 0).length;
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the one-time ?welcome flag after hydration
    setWelcome(new URLSearchParams(window.location.search).has("welcome"));
  }, []);

  return (
    <>
      <PageHeader
        title="AI Token 託管"
        description="把各家 AI 服務的 API Key 交給 AICH 託管：金鑰以 AES-256-GCM 加密保存、只顯示末四碼；同一家可放多把，自動輪替並在限流時冷卻。"
        actions={
          <Link href="/admin/providers" className="text-sm text-accent">
            進階：新增其他 OpenAI 相容服務 →
          </Link>
        }
      />
      <ErrorNote error={error} />
      {welcome && (
        <Card className="mb-4 border-accent/40 bg-accent-soft">
          <div className="text-sm">
            <b>歡迎！你是這個 AICH 的第一位用戶，已自動成為管理員。</b>
            <div className="mt-1 text-muted">兩步完成設定：① 在下方託管至少一家 AI 服務的 API Key；② 到「ISC 計價」設定費用基數。之後註冊的用戶都是一般用戶。</div>
          </div>
        </Card>
      )}
      <Card className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <span>
          已託管 <b>{hosted}</b> / {providers.length} 家供應商
        </span>
        {hosted === 0 && <span className="text-muted">先託管至少一家，用戶才能開始使用模型（測試只會列出模型，不會產生費用）。</span>}
        <span className="flex-1" />
        <Link href="/admin/pricing" className="text-accent">
          設定 ISC 計價 →
        </Link>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {providers.map((p) => (
          <ProviderCard key={p.id} p={p} onChanged={load} />
        ))}
      </div>
    </>
  );
}
