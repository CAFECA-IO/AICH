/** All money amounts from the gateway are integer micro-ISC: 1 ISC = 1,000,000 units. */
export const MICRO = 1_000_000;

let currencySymbol = "ISC";
/** Set by BillingProvider once /api/billing is loaded (the symbol is configurable by admins). */
export function setCurrencySymbol(c: string) {
  currencySymbol = c || "ISC";
}
export function currency(): string {
  return currencySymbol;
}

/** micro-ISC → "1,234.5678 ISC" (up to 6 decimals, trailing zeros trimmed). */
export function fmtIsc(micro: number | string | null | undefined, withUnit = true): string {
  const v = Number(micro ?? 0) / MICRO;
  const abs = Math.abs(v);
  const digits = abs === 0 ? 0 : abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  const s = v.toLocaleString("en-US", { maximumFractionDigits: digits });
  return withUnit ? `${s} ${currencySymbol}` : s;
}

/** micro-ISC → compact "12.3K ISC" for tight spaces. */
export function fmtIscCompact(micro: number | string | null | undefined): string {
  const v = Number(micro ?? 0) / MICRO;
  const s = Math.abs(v) >= 10_000
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)
    : v.toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) >= 1 ? 2 : 4 });
  return `${s} ${currencySymbol}`;
}

/** ISC amount (decimal string from an input) → integer micro-ISC; undefined when blank/invalid. */
export function iscToMicro(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * MICRO) : undefined;
}

/** micro-ISC → plain decimal string for editing in an input. */
export function microToIscInput(micro: number | null | undefined): string {
  return micro === null || micro === undefined ? "" : String(micro / MICRO);
}

/** Plan fee (micro-ISC) → "9.99 ISC" or "免費". */
export function fmtFee(micro: number): string {
  return micro === 0 ? "免費" : fmtIsc(micro);
}

export function fmtNumber(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("en-US");
}

export function fmtCompact(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v || 0);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fmtMs(ms: number | string | null | undefined): string {
  if (ms === null || ms === undefined || ms === "") return "—";
  const v = Number(ms);
  return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`;
}

export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}
