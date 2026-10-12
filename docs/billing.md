# ISC 計價

AICH 所有收費（用量、訂閱月費、餘額、金鑰額度、供應商預算）都以 **ISC** 計價。計價單位代號可在後台修改（預設 `ISC`）。

## 1. 計價公式：官方收費比例 × 費用基數

每條模型路由保存該模型的**官方牌價**（USD / 1M tokens，輸入與輸出分開），也就是各家模型之間的收費比例。平台再設定一個全域的**費用基數**（base），代表官方價格每 1 USD 收多少 ISC：

```
費用 (ISC) = (輸入 tokens × 輸入價 + 輸出 tokens × 輸出價) ÷ 1,000,000 × 倍率 × 基數
```

| 參數 | 設定位置 | 說明 |
| --- | --- | --- |
| 輸入價 / 輸出價 | 管理後台 →「模型映射」→ 路由 | 官方牌價 USD / 1M tokens（資料庫存為 ×1,000,000 的整數） |
| 倍率 | 「ISC 計價」表格或路由編輯 | 個別路由的加成或折扣，預設 1（存為萬分比 `ratio_bp`，10000 = 1.0） |
| 基數 | 管理後台 →「ISC 計價」 | 全域，1 USD 官方價格 = 基數 ISC。**改一個數字即可等比例調整所有模型價格** |

例：基數 32 時，Claude Sonnet（$3 / $15）每 1M 輸入 tokens 收 96 ISC、輸出 480 ISC；Gemini Flash（$0.30 / $2.50）收 9.6 / 80 ISC。兩者的比例永遠與官方一致。

- 「ISC 計價」頁可先輸入新基數預覽所有模型的新價格，確認後再套用；套用後立即生效（不需重啟）。
- Token 數優先採用上游回報的 usage（Anthropic 的 cache tokens 計入輸入；Gemini 的 thinking tokens 計入輸出），上游沒回報時以估算值計費。
- 以**實際處理請求的路由**計價：自動備援切到另一家時，依該路由的價格收費。
- 快取命中與失敗的請求不收費；串流中途客戶端斷線時，依已生成內容收費。
- 成本優先路由的排序使用「官方價 × 倍率」（基數對所有模型相同，不影響排序）。

## 2. 單位與精度

- 所有金額以整數 **micro-ISC**（百萬分之一 ISC）保存與計算，計費時無條件進位到 1 micro-ISC，避免浮點誤差。
- API 欄位 `credit_balance`、`credits`、`credit_limit`、`credits_used`、`monthly_credits`、`monthly_fee`、`monthly_budget_credits`、`delta` 皆為 micro-ISC；回應標頭 `x-hub-credits` 亦同。
- `GET /api/billing` 回傳 `{currency, base, unit: 1000000}`，前端以此顯示價格。
- **餘額是 ISC，不是美元**：調整基數會改變之後每次請求的 ISC 費用，不會改變任何人既有的 ISC 餘額。

## 3. 方案

| 方案 | 月費 | 每月額度 | API | 模型等級 | 預設 RPM / TPM | 路由優先級 | BYOK |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Free | 免費 | 0.2 ISC | ✗ | basic | 10 / 20K | 0 | ✗ |
| Starter | 9.99 ISC | 1 ISC | ✗ | basic | 30 / 60K | 1 | ✗ |
| Pro | 29.99 ISC | 3.5 ISC | ✓ | basic + premium | 120 / 400K | 10 | ✗ |
| Enterprise | 199 ISC | 30 ISC | ✓ | basic + premium | 1,200 / 4M | 100 | ✓ |

以上為預設值（基數 1 時相當於原本的美元定價）。設定基數後，請在「方案與風控設定」同步調整月費與每月額度。註冊贈送額度由 `AICH_SIGNUP_BONUS_CREDITS`（micro-ISC，預設 200,000 = 0.2 ISC）設定。

## 4. 帳務流程

| 事件 | 寫入 |
| --- | --- |
| 每次請求 | `users.credit_balance` 扣減、`api_keys.credits_used` 累加、`request_logs.credits` |
| 註冊贈送、方案開通、每月續期、管理員調整 | `credit_ledger`（delta、balance_after、reason） |

- 請求前檢查：餘額 ≤ 0 → 402；金鑰已用額度 ≥ 上限 → 402。不預先凍結額度，單一請求可能讓餘額小幅透支，下一次請求即被擋下。
- 每月續期：背景工作每小時檢查 `plan_renews_at ≤ now()` 的用戶，發放方案額度並把續期日加一個月（同一個 SQL 更新，不會重複發放）。

## 5. 待辦

- ISC 儲值與鏈上結算（例如透過 CAFECA 簽章通道付款），以及點數加購包。
- 進價欄位（實際採購成本）與毛利報表。
