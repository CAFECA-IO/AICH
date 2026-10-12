"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { setCurrencySymbol } from "@/lib/format";

export interface BillingInfo {
  /** Display symbol, e.g. "ISC". */
  currency: string;
  /** 費用基數: ISC per 1 USD of upstream list price. */
  base: number;
}

const BillingContext = createContext<BillingInfo>({ currency: "ISC", base: 1 });

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<BillingInfo>({ currency: "ISC", base: 1 });
  useEffect(() => {
    api<BillingInfo>("/api/billing")
      .then((b) => {
        setCurrencySymbol(b.currency);
        setInfo(b);
      })
      .catch(() => undefined);
  }, []);
  // Re-key children when the symbol changes so every formatted amount re-renders.
  return (
    <BillingContext.Provider value={info}>
      <div key={info.currency} className="contents">
        {children}
      </div>
    </BillingContext.Provider>
  );
}

export function useBilling(): BillingInfo {
  return useContext(BillingContext);
}
