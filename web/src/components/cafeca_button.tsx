"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import {
  cafecaErrorMessage,
  cafecaPopup,
  cafecaRedirect,
  getCafecaConfig,
  loadCafecaSdk,
  preferRedirect,
  type CafecaClient,
  type CafecaPurpose,
} from "@/lib/cafeca";

export function CafecaMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" opacity="0.15" />
      <path d="M8 9.5a4 4 0 0 1 7.2-2.4M8 14.5a4 4 0 0 0 7.2 2.4M8 9.5v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16.5" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

/**
 * "Sign in with CAFECA" button. Preloads the wallet SDK so the popup can open synchronously in
 * the click handler; falls back to a full-page redirect on mobile or when the popup is blocked.
 */
export function CafecaButton({
  purpose,
  label,
  next = "/chat",
  onDone,
  onError,
  variant = "secondary",
  className = "",
}: {
  purpose: CafecaPurpose;
  label: string;
  next?: string;
  onDone: (result: unknown) => void | Promise<void>;
  onError: (message: string | null) => void;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const client = useRef<CafecaClient | null>(null);

  useEffect(() => {
    let alive = true;
    getCafecaConfig().then(async (cfg) => {
      if (!alive) return;
      if (!cfg.enabled || !cfg.wallet) {
        setEnabled(false);
        return;
      }
      try {
        const sdk = await loadCafecaSdk(cfg.wallet);
        client.current = sdk.create({ wallet: cfg.wallet });
        if (alive) setEnabled(true);
      } catch (e) {
        if (alive) {
          setEnabled(false);
          onError((e as Error).message);
        }
      }
    });
    return () => {
      alive = false;
    };
  }, [onError]);

  if (enabled === false) return null;

  function onClick() {
    const c = client.current;
    if (!c) return;
    onError(null);
    setBusy(true);
    const viaRedirect = () => cafecaRedirect(c, purpose, next);
    const run = preferRedirect()
      ? viaRedirect()
      : cafecaPopup(c, purpose).then(onDone, (e: { code?: string }) => (e?.code === "popup_blocked" ? viaRedirect() : Promise.reject(e)));
    run
      .catch((e) => onError(cafecaErrorMessage(e)))
      .finally(() => setBusy(false));
  }

  return (
    <Button type="button" variant={variant} onClick={onClick} disabled={!enabled || busy} className={className}>
      <CafecaMark />
      {busy ? "等待 CAFECA 確認…" : enabled === null ? "載入 CAFECA…" : label}
    </Button>
  );
}
