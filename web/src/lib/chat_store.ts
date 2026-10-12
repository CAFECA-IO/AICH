// Conversations are kept in the browser (per device). The gateway never needs to store chat
// history, which keeps the zero-data-retention promise simple.
import type { Conversation } from "@/lib/types";

const KEY = "aich_conversations_v1";

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Conversation[]) : [];
    return Array.isArray(list) ? list.sort((a, b) => b.updated_at - a.updated_at) : [];
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    // Quota exceeded (large images): drop image payloads from older conversations and retry once.
    try {
      const slim = list.slice(0, 50).map((c, i) =>
        i < 5
          ? c
          : {
              ...c,
              messages: c.messages.map((m) =>
                typeof m.content === "string" ? m : { ...m, content: m.content.filter((p) => p.type === "text") },
              ),
            },
      );
      localStorage.setItem(KEY, JSON.stringify(slim));
    } catch {
      /* give up silently; chat still works in memory */
    }
  }
}
