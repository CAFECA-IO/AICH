// Browser-side client for the AICH gateway. All calls go through the same-origin `/gw` proxy
// (see src/app/gw/[...path]/route.ts) so the gateway URL stays a server-side setting.

export const GW_PREFIX = "/gw";
const TOKEN_KEY = "aich_token";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json", ...(extra ?? {}) };
  const t = getToken();
  if (t) h.authorization = `Bearer ${t}`;
  return h;
}

async function parseError(res: Response): Promise<ApiError> {
  let message = res.statusText || `HTTP ${res.status}`;
  let code: string | undefined;
  try {
    const body = await res.json();
    message = body?.error?.message ?? message;
    code = body?.error?.code;
  } catch {
    /* non-JSON error */
  }
  return new ApiError(res.status, message, code);
}

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const res = await fetch(`${GW_PREFIX}${path}`, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: authHeaders(),
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init?.signal,
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await parseError(res);
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
      setToken(null);
      window.dispatchEvent(new Event("aich:logout"));
    }
    throw err;
  }
  return (await res.json()) as T;
}

export { parseError };
