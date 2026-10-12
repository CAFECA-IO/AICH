# 點數與計費

## 1. 單位

- **1 Credit（點）= US$0.000001**。
- 路由價格以「點 / 1M tokens」保存，數值等於「USD / 1M tokens × 1,000,000」。例如 US$3 / 1M → `3000000`。後台 UI 直接以 USD/1M 輸入，自動換算。

## 2. 扣點公式

```
credits = ceil( (prompt_tokens × input_price + completion_tokens × output_price) / 1,000,000 )
```

| 範例 | 價格（USD/1M 入·出） | 1,000 輸入 tokens | 1,000 輸出 tokens |
| --- | --- | --- | --- |
| 旗艦（Claude Sonnet 級） | 3 · 15 | 3,000 點 | 15,000 點 |
| 平價（Gemini Flash 舊價） | 0.075 · 0.3 | 75 點 | 300 點 |

- Token 數優先使用上游回報的 usage（Anthropic 的 cache tokens 計入輸入；Gemini 的 thinking tokens 計入輸出）；上游沒回報時以估算值計費。
- **以實際服務的路由價格計費**：備援到另一條路由時，依該路由價格。
- 快取命中：0 點。失敗請求：0 點。串流中途客戶端斷線：依已生成內容計費。

## 3. 帳務流程

| 事件 | 寫入 |
| --- | --- |
| 每次請求 | `users.credit_balance` 扣減、`api_keys.credits_used` 累加、`request_logs.credits` |
| 註冊贈點、方案開通、每月續期、管理員調整 | `credit_ledger`（delta、balance_after、reason） |

- 請求前檢查：餘額 ≤ 0 → 402；金鑰 `credits_used ≥ credit_limit` → 402。為避免額外延遲，不預先凍結額度，單一請求可能讓餘額小幅透支（下次請求即被擋下）。
- 每月續期：背景工作每小時檢查 `plan_renews_at ≤ now()` 的用戶，發放方案點數並把續期日 +1 個月（同一 SQL 更新，避免重複發放）。

## 4. 方案（可於後台調整）

| 方案 | 月費 | 每月點數 | API | 模型等級 | 預設 RPM / TPM | 路由優先級 | BYOK |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Free | $0 | 200,000 | ✗ | basic | 10 / 20K | 0 | ✗ |
| Starter | $9.99 | 1,000,000 | ✗ | basic | 30 / 60K | 1 | ✗ |
| Pro | $29.99 | 3,500,000 | ✓ | basic + premium | 120 / 400K | 10 | ✗ |
| Enterprise | $199+ | 30,000,000 | ✓ | basic + premium | 1,200 / 4M | 100 | ✓ |

## 5. 定價與毛利

- 種子資料中的路由售價為**範例牌價**，上線前請以各供應商官方價目表核對並加上平台加成。
- 營收報表：管理後台「監控總覽」的「營收點數」為用戶被扣的點數；上游成本可依供應商帳單對照 `request_logs` 的 token 數計算（roadmap：在路由上新增進價欄位，直接產出毛利報表）。

## 6. 付款整合（roadmap）

目前方案由管理員或業務調整（`PATCH /admin/users/{id}`）。下一階段整合 Stripe / 綠界：Checkout → Webhook → 更新 `plan_id` 與發放點數，並支援點數加購包。
