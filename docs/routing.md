# 智能路由引擎

程式碼：`gateway/src/routing/`、`gateway/src/handlers/chat.rs`

## 1. 名詞

- **Hub 模型**（`models`）：對外暴露的名稱，例如 `hub-auto`、`hub-claude-sonnet`。設定等級（basic/premium）與預設策略。
- **路由**（`model_routes`）：Hub 模型 → (供應商, 上游模型)，含優先序、售價與標籤。
- **節點（target）**：`provider_id/upstream_model`，健康度與斷路器以節點為單位。

## 2. 規劃流程

```text
routes(model)
  └─ 過濾：供應商停用 / 月預算超過 / 沒有可用金鑰（共用或本人 BYOK）/ 斷路器 open
       └─ 排序（策略）
            └─ 嘗試（最多 N 次，依方案優先級調整）
```

| 策略 | 排序鍵 |
| --- | --- |
| failover | `priority` 由小到大 |
| cost | 預估成本 = prompt_est × input_price + max_tokens(預設 512) × output_price；平手看 priority |
| latency | 節點 EWMA 延遲（串流請求用 TTFT）；未量測者視為 0 → 優先探索 |
| intent | 標籤包含該意圖的路由優先，其餘依 priority 作為後備 |

嘗試次數：`AICH_MAX_ATTEMPTS`（預設 3）；方案 `routing_priority ≥ 100` 再 +1，`< 10` 則 −1（最少 2）。

## 3. 意圖分類（`intent.rs`）

每個請求都會執行，因此是零延遲的啟發式分類（關鍵字 + 結構），支援中英文：

| 意圖 | 判斷 |
| --- | --- |
| vision | 訊息含 `image_url` |
| long_context | 預估 prompt ≥ 24,000 tokens |
| code | 程式碼區塊、語法特徵、程式語言/除錯/重構等關鍵字（含中文） |
| reasoning | 證明、推導、分析、評估、比較、策略、計算等 |
| simple | 摘要、翻譯、分類、擷取、改寫，或非常短的提示 |
| general | 其他 |

可用 `X-Hub-Intent` 直接指定。未來可替換為小模型分類器（見 roadmap），介面不變。

## 4. 自動備援

| 上游結果 | 處理 |
| --- | --- |
| 2xx | 成功；記錄延遲 / TTFT |
| 429 | 該金鑰冷卻（Retry-After，預設 30s，上限 300s）→ 換下一候選 |
| 401 / 403 | 該金鑰暫停 10 分鐘 → 換下一候選 |
| 404、408、409、5xx、逾時、連線錯誤、串流首字前中斷 | 記錄節點失敗 → 換下一候選 |
| 400、413、422 | 請求本身有問題，不重試，原樣回傳 |

串流請求：Gateway 先等待上游第一個 chunk 才開始回應客戶端，因此「首字前」任何失敗都可透明切換；首字後中斷則以 SSE `error` 事件通知並結束。

## 5. 斷路器（`health.rs`）

- 連續失敗 5 次 → **open** 30 秒（期間不派送）。
- 到期 → **half-open**：只放行 1 個探測請求。成功 → closed；失敗 → 再次 open，時間加倍（上限 5 分鐘）。
- 管理後台可手動重設。
- EWMA（α = 0.3）追蹤延遲與 TTFT，提供 latency 策略與監控使用。

## 6. 金鑰池（`keypool.rs`）

- 同一供應商多把金鑰依 `weight` 加權輪替（round-robin）。
- 冷卻中的金鑰自動略過；全部冷卻時該節點本次被略過。
- **BYOK**：企業用戶自己的金鑰優先使用，其他用戶永遠不會用到；自有金鑰全數不可用時退回平台共用池。

## 7. 預算斷路器

供應商可設定 `monthly_budget_credits`。Catalog 每 30 秒彙整本月該供應商的 ISC 營收總和，超過即從候選中移除，並在後台顯示「預算斷路」。
