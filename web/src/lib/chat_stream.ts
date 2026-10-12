import { authHeaders, GW_PREFIX, parseError } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

export interface StreamMeta {
  provider?: string;
  upstream?: string;
  intent?: string;
  attempts?: string;
  strategy?: string;
}

export interface StreamHandlers {
  onMeta?: (m: StreamMeta) => void;
  onDelta: (text: string) => void;
  onUsage?: (u: { prompt_tokens: number; completion_tokens: number }) => void;
}

/** Streams an OpenAI-compatible chat completion through the gateway and parses SSE frames. */
export async function streamChat(
  body: { model: string; messages: Pick<ChatMessage, "role" | "content">[]; temperature?: number },
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${GW_PREFIX}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ ...body, stream: true, stream_options: { include_usage: true } }),
    signal,
  });
  if (!res.ok || !res.body) throw await parseError(res);
  handlers.onMeta?.({
    provider: res.headers.get("x-hub-provider") ?? undefined,
    upstream: res.headers.get("x-hub-upstream-model") ?? undefined,
    intent: res.headers.get("x-hub-intent") ?? undefined,
    attempts: res.headers.get("x-hub-attempts") ?? undefined,
    strategy: res.headers.get("x-hub-strategy") ?? undefined,
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      if (data === "[DONE]") return;
      let json: {
        choices?: { delta?: { content?: string } }[];
        usage?: { prompt_tokens: number; completion_tokens: number };
        error?: { message?: string };
      };
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error) throw new Error(json.error.message ?? "stream error");
      const t = json.choices?.[0]?.delta?.content;
      if (t) handlers.onDelta(t);
      if (json.usage) handlers.onUsage?.(json.usage);
    }
  }
}
