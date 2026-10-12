// "Sign in with CAFECA" client glue.
// The official browser SDK (cafeca-connect.js) is loaded from the CAFECA wallet; it only transports
// the request/response. The gateway verifies the passkey signature (ERC-1271) — never trust the
// response in the browser.

import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export type CafecaPurpose = "login" | "link";

export interface CafecaSignInResponse {
  v: 1;
  type: "cafeca:auth";
  account: string;
  chainId: number;
  message: { nonce: string; [k: string]: unknown };
  signature: string;
  [k: string]: unknown;
}

interface CafecaClient {
  signIn(o: { nonce: () => Promise<{ nonce: string }>; statement?: string; claims?: string[] }): Promise<CafecaSignInResponse>;
  redirect(o: { nonce: string; redirectUri: string; statement?: string; claims?: string[] }): Promise<void>;
}

interface CafecaConnectGlobal {
  create(o: { wallet: string }): CafecaClient;
  handleRedirect(): { response?: CafecaSignInResponse; error?: Error & { code?: string } } | null;
}

declare global {
  interface Window {
    CafecaConnect?: CafecaConnectGlobal;
  }
}

export interface CafecaConfig {
  enabled: boolean;
  wallet?: string;
}

interface NonceResult {
  nonce: string;
  ticket: string;
  wallet: string;
}

export interface CafecaLoginResult {
  token: string;
  user: User;
  created: boolean;
}

const STATEMENT = "登入 AICH AI Computing Hub";
const CLAIMS = ["handle"];
const PENDING_KEY = "aich_cafeca_pending";
export const CALLBACK_PATH = "/login/cafeca";

let configPromise: Promise<CafecaConfig> | null = null;
let sdkPromise: Promise<CafecaConnectGlobal> | null = null;

export function getCafecaConfig(): Promise<CafecaConfig> {
  configPromise ??= api<CafecaConfig>("/auth/cafeca/config").catch(() => {
    configPromise = null;
    return { enabled: false };
  });
  return configPromise;
}

export function loadCafecaSdk(wallet: string): Promise<CafecaConnectGlobal> {
  if (typeof window !== "undefined" && window.CafecaConnect) return Promise.resolve(window.CafecaConnect);
  sdkPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = new URL("/sdk/cafeca-connect.js", wallet).href;
    s.async = true;
    s.onload = () => (window.CafecaConnect ? resolve(window.CafecaConnect) : reject(new Error("CAFECA SDK 載入失敗")));
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error("無法載入 CAFECA SDK，請確認網路連線"));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

/** Popups are unreliable on phones and in in-app browsers; use a full-page redirect there. */
export function preferRedirect(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|Line\/|FBAN|FBAV|Instagram/i.test(navigator.userAgent);
}

function nonceEndpoint(purpose: CafecaPurpose) {
  return purpose === "login" ? "/auth/cafeca/nonce" : "/api/me/cafeca/nonce";
}

function verifyEndpoint(purpose: CafecaPurpose) {
  return purpose === "login" ? "/auth/cafeca/login" : "/api/me/cafeca";
}

async function requestNonce(purpose: CafecaPurpose): Promise<NonceResult> {
  return api<NonceResult>(nonceEndpoint(purpose), { body: { domain: window.location.origin } });
}

/**
 * Popup flow. MUST be called synchronously from a click handler (the SDK opens the popup first,
 * then fetches the nonce), and `client` must already be created.
 */
export async function cafecaPopup(client: CafecaClient, purpose: CafecaPurpose): Promise<unknown> {
  let ticket = "";
  const response = await client.signIn({
    nonce: async () => {
      const r = await requestNonce(purpose);
      ticket = r.ticket;
      return { nonce: r.nonce };
    },
    statement: STATEMENT,
    claims: CLAIMS,
  });
  return api(verifyEndpoint(purpose), { body: { response, ticket } });
}

interface Pending {
  nonce: string;
  ticket: string;
  purpose: CafecaPurpose;
  next: string;
  at: number;
}

/** Full-page redirect flow (mobile). Navigates away; the result is handled on CALLBACK_PATH. */
export async function cafecaRedirect(client: CafecaClient, purpose: CafecaPurpose, next: string): Promise<void> {
  const r = await requestNonce(purpose);
  const pending: Pending = { nonce: r.nonce, ticket: r.ticket, purpose, next, at: Date.now() };
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    throw new Error("瀏覽器不允許暫存登入狀態，請關閉無痕模式或改用電腦登入");
  }
  await client.redirect({ nonce: r.nonce, redirectUri: new URL(CALLBACK_PATH, window.location.origin).href, statement: STATEMENT, claims: CLAIMS });
}

/** On CALLBACK_PATH: read the wallet's result from the URL fragment and verify it with the gateway. */
export async function completeCafecaRedirect(): Promise<{ purpose: CafecaPurpose; next: string; result: unknown } | null> {
  const cfg = await getCafecaConfig();
  if (!cfg.enabled || !cfg.wallet) throw new Error("此站未啟用 CAFECA 登入");
  const sdk = await loadCafecaSdk(cfg.wallet);
  const out = sdk.handleRedirect();
  if (!out) return null;
  let pending: Pending | null = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    pending = null;
  }
  if (out.error) throw out.error;
  if (!out.response || !pending || pending.nonce !== out.response.message?.nonce) {
    throw new Error("找不到對應的登入請求，請重新登入");
  }
  const result = await api(verifyEndpoint(pending.purpose), { body: { response: out.response, ticket: pending.ticket } });
  return { purpose: pending.purpose, next: pending.next, result };
}

export function cafecaErrorMessage(e: unknown): string | null {
  const err = e as { code?: string; message?: string };
  switch (err?.code) {
    case "closed":
    case "access_denied":
      return null; // user cancelled; stay quiet
    case "popup_blocked":
      return "瀏覽器擋下了 CAFECA 視窗，請允許彈出視窗後再試一次";
    case "timeout":
      return "登入逾時，請再試一次";
    default:
      return err?.message ?? String(e);
  }
}

export function shortAccount(a: string | null | undefined): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export type { CafecaClient };
