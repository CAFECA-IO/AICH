"use client";

import { useEffect, useState } from "react";
import { LogTable } from "@/components/log_table";
import { Button, ErrorNote, PageHeader, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtNumber } from "@/lib/format";
import type { RequestLog } from "@/lib/types";

interface LedgerRow {
  id: number;
  delta: number;
  balance_after: number;
  reason: string;
  created_at: string;
}

const PAGE = 50;

export default function UsagePage() {
  const [tab, setTab] = useState<"logs" | "ledger">("logs");
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const path = tab === "logs" ? "/api/logs" : "/api/ledger";
    api<{ data: never[] }>(`${path}?limit=${PAGE}&offset=${offset}`)
      .then((r) => (tab === "logs" ? setLogs(r.data) : setLedger(r.data)))
      .catch((e) => setError(e.message));
  }, [tab, offset]);

  return (
    <>
      <PageHeader title="用量與帳務" description="每一筆請求的路由結果與扣點明細，以及點數加值紀錄。" />
      <div className="mb-4 flex gap-1">
        {(["logs", "ledger"] as const).map((t) => (
          <Button key={t} variant={tab === t ? "primary" : "secondary"} onClick={() => { setTab(t); setOffset(0); }}>
            {t === "logs" ? "請求日誌 / 扣點明細" : "點數異動"}
          </Button>
        ))}
      </div>
      <ErrorNote error={error} />
      {tab === "logs" ? (
        <LogTable logs={logs} />
      ) : (
        <Table head={["時間", "異動", "餘額", "原因"]} empty={ledger.length === 0}>
          {ledger.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 text-xs text-muted">{fmtDate(r.created_at)}</td>
              <td className={`px-3 py-2 tabular-nums ${r.delta >= 0 ? "text-success" : "text-danger"}`}>
                {r.delta >= 0 ? "+" : ""}
                {fmtNumber(r.delta)}
              </td>
              <td className="px-3 py-2 tabular-nums">{fmtNumber(r.balance_after)}</td>
              <td className="px-3 py-2 text-xs">{r.reason}</td>
            </tr>
          ))}
        </Table>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
          上一頁
        </Button>
        <Button variant="secondary" disabled={(tab === "logs" ? logs.length : ledger.length) < PAGE} onClick={() => setOffset(offset + PAGE)}>
          下一頁
        </Button>
      </div>
    </>
  );
}
