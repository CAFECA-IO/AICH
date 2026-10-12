"use client";

import { useEffect, useState } from "react";
import { LogTable } from "@/components/log_table";
import { Button, ErrorNote, Input, PageHeader, Toggle } from "@/components/ui";
import { api } from "@/lib/api";
import type { RequestLog } from "@/lib/types";

const PAGE = 100;

export default function LogsAdmin() {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [filters, setFilters] = useState({ provider_id: "", model: "", errors_only: false });
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offset), errors_only: String(filters.errors_only) });
    if (filters.provider_id) qs.set("provider_id", filters.provider_id);
    if (filters.model) qs.set("model", filters.model);
    const t = setTimeout(() => {
      api<{ data: RequestLog[] }>(`/admin/logs?${qs}`)
        .then((r) => setLogs(r.data))
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [filters, offset]);

  return (
    <>
      <PageHeader title="請求日誌" description="日誌以非同步批次寫入，不影響請求延遲。啟用零數據留存的用戶不會記錄內容。" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input className="w-44" placeholder="供應商 ID" value={filters.provider_id} onChange={(e) => { setOffset(0); setFilters({ ...filters, provider_id: e.target.value }); }} />
        <Input className="w-44" placeholder="Hub 模型" value={filters.model} onChange={(e) => { setOffset(0); setFilters({ ...filters, model: e.target.value }); }} />
        <Toggle checked={filters.errors_only} onChange={(v) => { setOffset(0); setFilters({ ...filters, errors_only: v }); }} label="只看錯誤" />
      </div>
      <ErrorNote error={error} />
      <LogTable logs={logs} showUser />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
          上一頁
        </Button>
        <Button variant="secondary" disabled={logs.length < PAGE} onClick={() => setOffset(offset + PAGE)}>
          下一頁
        </Button>
      </div>
    </>
  );
}
