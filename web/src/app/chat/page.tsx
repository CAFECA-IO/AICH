"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { RequireAuth } from "@/components/require_auth";
import { TopNav } from "@/components/top_nav";
import { Badge, Button, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth_context";
import { loadConversations, saveConversations } from "@/lib/chat_store";
import { streamChat } from "@/lib/chat_stream";
import { uid } from "@/lib/format";
import type { ChatMessage, ChatPart, Conversation, HubModel } from "@/lib/types";

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|html?|css|js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|sql|log|ini|toml|env)$/i;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_BYTES = 512 * 1024;

interface Attachment {
  name: string;
  kind: "image" | "text";
  data: string; // data URL for images, file text for text
}

function messageText(m: ChatMessage): string {
  return typeof m.content === "string" ? m.content : m.content.filter((p) => p.type === "text").map((p) => p.text).join("\n\n");
}

function messageImages(m: ChatMessage): string[] {
  return typeof m.content === "string" ? [] : m.content.filter((p) => p.type === "image_url").map((p) => p.image_url!.url);
}

function readFile(file: File, as: "text" | "dataurl"): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    if (as === "text") r.readAsText(file);
    else r.readAsDataURL(file);
  });
}

function newConversation(model: string): Conversation {
  return { id: uid(), title: "新對話", model, system: "", messages: [], updated_at: Date.now() };
}

function ChatApp() {
  const { refresh } = useAuth();
  const [models, setModels] = useState<HubModel[]>([]);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSystem, setShowSystem] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const available = useMemo(() => models.filter((m) => m.available), [models]);
  const active = convs.find((c) => c.id === activeId) ?? null;
  const activeModel = models.find((m) => m.id === active?.model);

  useEffect(() => {
    const stored = loadConversations();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from browser storage once
    setConvs(stored);
    setActiveId(stored[0]?.id ?? null);
    api<{ data: HubModel[] }>("/api/models")
      .then((r) => setModels(r.data))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (convs.length) saveConversations(convs);
  }, [convs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active?.messages.length, busy]);

  const defaultModel = available.find((m) => m.id === "hub-auto")?.id ?? available.find((m) => m.id === "hub-auto-cheap")?.id ?? available[0]?.id ?? "hub-mock";

  const update = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConvs((list) => list.map((c) => (c.id === id ? { ...fn(c), updated_at: Date.now() } : c)).sort((a, b) => b.updated_at - a.updated_at));
  }, []);

  function startNew() {
    const c = newConversation(active?.model && available.some((m) => m.id === active.model) ? active.model : defaultModel);
    setConvs((l) => [c, ...l]);
    setActiveId(c.id);
    setSidebarOpen(false);
    setError(null);
  }

  function remove(id: string) {
    setConvs((l) => {
      const next = l.filter((c) => c.id !== id);
      if (next.length === 0) saveConversations([]);
      return next;
    });
    if (activeId === id) setActiveId(null);
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const out: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (f.type.startsWith("image/")) {
        if (f.size > MAX_IMAGE_BYTES) {
          setError(`${f.name} 超過 5MB 上限`);
          continue;
        }
        out.push({ name: f.name, kind: "image", data: await readFile(f, "dataurl") });
      } else if (f.type.startsWith("text/") || TEXT_EXT.test(f.name) || f.type === "application/json") {
        if (f.size > MAX_TEXT_BYTES) {
          setError(`${f.name} 超過 512KB 上限`);
          continue;
        }
        out.push({ name: f.name, kind: "text", data: await readFile(f, "text") });
      } else {
        setError(`不支援的檔案類型：${f.name}（支援圖片與文字/程式碼檔）`);
      }
    }
    setAttachments((a) => [...a, ...out]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function run(conv: Conversation, history: ChatMessage[]) {
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const assistant: ChatMessage = { role: "assistant", content: "", meta: { model: conv.model } };
    update(conv.id, (c) => ({ ...c, messages: [...history, assistant] }));
    let text = "";
    const meta: NonNullable<ChatMessage["meta"]> = { model: conv.model };
    const flush = () => update(conv.id, (c) => ({ ...c, messages: [...history, { role: "assistant", content: text, meta: { ...meta } }] }));
    try {
      const payload = [
        ...(conv.system.trim() ? [{ role: "system" as const, content: conv.system.trim() }] : []),
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ];
      await streamChat(
        { model: conv.model, messages: payload },
        {
          onMeta: (m) => Object.assign(meta, { provider: m.provider, upstream: m.upstream, intent: m.intent, attempts: m.attempts }),
          onDelta: (t) => {
            text += t;
            flush();
          },
          onUsage: (u) => Object.assign(meta, { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens }),
        },
        controller.signal,
      );
      flush();
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        meta.error = (e as Error).message;
        flush();
        setError((e as Error).message);
      } else {
        flush();
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      void refresh();
    }
  }

  async function send() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    let conv = active;
    if (!conv) {
      conv = newConversation(defaultModel);
      setConvs((l) => [conv!, ...l]);
      setActiveId(conv.id);
    }
    const textBlocks = attachments.filter((a) => a.kind === "text").map((a) => `--- ${a.name} ---\n${a.data}`);
    const fullText = [text, ...textBlocks].filter(Boolean).join("\n\n");
    const images = attachments.filter((a) => a.kind === "image");
    const content: ChatMessage["content"] = images.length
      ? ([{ type: "text", text: fullText || "請描述這張圖片" }, ...images.map((i) => ({ type: "image_url", image_url: { url: i.data } }))] as ChatPart[])
      : fullText;
    const userMsg: ChatMessage = { role: "user", content };
    const history = [...conv.messages, userMsg];
    if (conv.messages.length === 0) {
      const title = (text || attachments[0]?.name || "新對話").slice(0, 40);
      update(conv.id, (c) => ({ ...c, title }));
    }
    setInput("");
    setAttachments([]);
    await run({ ...conv }, history);
  }

  function regenerate() {
    if (!active || busy) return;
    const msgs = [...active.messages];
    while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
    if (msgs.length) void run(active, msgs);
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <aside
        className={`${sidebarOpen ? "flex" : "hidden"} absolute inset-y-14 left-0 z-30 w-72 flex-col border-r border-border bg-surface md:static md:flex md:w-64`}
      >
        <div className="p-3">
          <Button onClick={startNew} className="w-full">
            ＋ 新對話
          </Button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {convs.map((c) => (
            <div
              key={c.id}
              className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${c.id === activeId ? "bg-accent-soft text-accent" : "hover:bg-surface-2"}`}
              onClick={() => {
                setActiveId(c.id);
                setSidebarOpen(false);
              }}
            >
              <span className="flex-1 truncate">{c.title}</span>
              <button
                className="hidden text-xs text-muted hover:text-danger group-hover:block"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(c.id);
                }}
                aria-label="刪除對話"
              >
                ✕
              </button>
            </div>
          ))}
          {convs.length === 0 && <p className="px-2 py-4 text-xs text-muted">對話只保存在這個瀏覽器中。</p>}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
          <button className="rounded-md px-2 py-1 text-sm md:hidden" onClick={() => setSidebarOpen((v) => !v)} aria-label="對話列表">
            ☰
          </button>
          <Select
            value={active?.model ?? defaultModel}
            onChange={(e) => {
              if (active) update(active.id, (c) => ({ ...c, model: e.target.value }));
              else {
                const c = newConversation(e.target.value);
                setConvs((l) => [c, ...l]);
                setActiveId(c.id);
              }
            }}
            className="max-w-[16rem]"
          >
            {available.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.strategy !== "failover" ? `· ${m.strategy}` : ""}
              </option>
            ))}
          </Select>
          {activeModel && <span className="hidden text-xs text-muted lg:inline">{activeModel.description}</span>}
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => setShowSystem((v) => !v)} className="text-xs">
            系統提示詞{active?.system ? " ●" : ""}
          </Button>
        </div>
        {showSystem && (
          <div className="border-b border-border bg-surface-2 p-3">
            <Textarea
              rows={3}
              placeholder="例如：你是一位資深的 Rust 工程師，回答請使用繁體中文。"
              value={active?.system ?? ""}
              onChange={(e) => active && update(active.id, (c) => ({ ...c, system: e.target.value }))}
              disabled={!active}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
            {(!active || active.messages.length === 0) && (
              <div className="py-16 text-center">
                <h2 className="text-2xl font-semibold">今天想做什麼？</h2>
                <p className="mt-2 text-sm text-muted">選擇模型，或使用 Hub Auto 讓 AICH 依任務自動挑選最適合的模型。</p>
              </div>
            )}
            {active?.messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl bg-accent-soft px-4 py-2.5 text-sm whitespace-pre-wrap">
                    {messageImages(m).map((src, j) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={j} src={src} alt="附件" className="mb-2 max-h-48 rounded-lg" />
                    ))}
                    {messageText(m)}
                  </div>
                ) : (
                  <div>
                    {messageText(m) ? <Markdown text={messageText(m)} /> : busy && i === active.messages.length - 1 ? <span className="animate-pulse text-muted">▍</span> : null}
                    {m.meta && (m.meta.provider || m.meta.error) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted">
                        {m.meta.provider && (
                          <Badge>
                            {m.meta.provider} / {m.meta.upstream}
                          </Badge>
                        )}
                        {m.meta.intent && <Badge tone="accent">intent: {m.meta.intent}</Badge>}
                        {m.meta.attempts && m.meta.attempts !== "1" && <Badge tone="warning">failover ×{Number(m.meta.attempts) - 1}</Badge>}
                        {m.meta.completion_tokens !== undefined && (
                          <Badge>
                            {m.meta.prompt_tokens} → {m.meta.completion_tokens} tokens
                          </Badge>
                        )}
                        {m.meta.error && <Badge tone="danger">{m.meta.error}</Badge>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {active && active.messages.length > 0 && !busy && active.messages[active.messages.length - 1].role === "assistant" && (
              <div>
                <button onClick={regenerate} className="text-xs text-muted hover:text-text">
                  ↻ 重新生成
                </button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-border bg-surface p-3">
          <div className="mx-auto max-w-3xl">
            {error && <div className="mb-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">{error}</div>}
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs">
                    {a.kind === "image" ? "🖼" : "📄"} {a.name}
                    <button onClick={() => setAttachments((l) => l.filter((_, j) => j !== i))} className="text-muted hover:text-danger" aria-label="移除附件">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            {attachments.some((a) => a.kind === "image") && activeModel && !activeModel.supports_vision && (
              <div className="mb-2 text-xs text-warning">目前的模型可能不支援圖片，建議切換到支援視覺的模型（例如 GPT-4o、Claude、Gemini）。</div>
            )}
            <div className="flex items-end gap-2">
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
              <Button variant="secondary" onClick={() => fileRef.current?.click()} aria-label="附加檔案" title="附加圖片或文字檔">
                📎
              </Button>
              <Textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="輸入訊息，Enter 送出，Shift+Enter 換行"
                className="max-h-48 min-h-[42px] resize-none"
              />
              {busy ? (
                <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
                  停止
                </Button>
              ) : (
                <Button onClick={() => void send()} disabled={!input.trim() && attachments.length === 0}>
                  送出
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function ChatPage() {
  return (
    <RequireAuth>
      <TopNav />
      <ChatApp />
    </RequireAuth>
  );
}
