# API 參考

Base URL：`https://<your-hub>`。錯誤一律為 OpenAI 格式：`{"error": {"message", "type", "code"}}`。

## 1. OpenAI 相容 API（`/v1`）

認證：`Authorization: Bearer sk-hub-…`（或 `x-api-key: sk-hub-…`）。網頁登入的 JWT 亦可使用。

### `POST /v1/chat/completions`

完全相容 OpenAI Chat Completions：`messages`（text / image_url parts、tool_calls、tool 訊息）、`stream`、`stream_options.include_usage`、`temperature`、`top_p`、`max_tokens` / `max_completion_tokens`、`stop`、`tools`、`tool_choice`、`response_format`、`user`。其他未知欄位會原樣轉送給 OpenAI 相容上游。

請求擴充標頭：

| 標頭 | 值 | 作用 |
| --- | --- | --- |
| `X-Hub-Strategy` | `failover` \| `cost` \| `latency` \| `intent` | 覆寫模型預設策略 |
| `X-Hub-Intent` | `code` \| `long_context` \| `reasoning` \| `vision` \| `simple` \| `general` | 跳過意圖分類 |
| `X-Hub-Cache` | `true` \| `false` | 強制啟用 / 略過快取 |

回應標頭：`x-hub-request-id`、`x-hub-strategy`、`x-hub-intent`、`x-hub-provider`、`x-hub-upstream-model`、`x-hub-attempts`、`x-hub-credits`（micro-ISC；串流為 0，實際費用見日誌）、`x-hub-cache`（hit/miss/bypass）、`x-hub-guardrail`（flag 模式）。

### `GET /v1/models`

回傳目前方案（與金鑰允許清單）可用的模型。

### 錯誤碼

| HTTP | code | 說明 |
| --- | --- | --- |
| 400 | `bad_request` / `content_policy_violation` / `upstream_rejected` | 格式錯誤、觸發 Guardrails、上游拒絕（不重試） |
| 401 | `invalid_api_key` | 金鑰無效、撤銷、過期或停用 |
| 402 | `insufficient_quota` | ISC 餘額不足 / 金鑰額度用盡 |
| 403 | `forbidden` | 方案不含此模型或 API 存取；金鑰不允許此模型 |
| 404 | `model_not_found` | 模型不存在 |
| 429 | `rate_limit_exceeded` | 超過 RPM / TPM |
| 502 | `upstream_unavailable` | 所有候選上游皆失敗 |
| 503 | `no_available_upstream` | 無健康上游（斷路器 / 預算 / 無金鑰） |

## 2. 認證（`/auth`）

| 方法 | 路徑 | Body | 回應 |
| --- | --- | --- | --- |
| POST | `/auth/register` | `{email, password(≥8), name?}` | `{token, user}`；贈送註冊額度；第一位註冊者成為管理員 |
| POST | `/auth/login` | `{email, password}` | `{token, user}`；每 email 每 15 分鐘最多 10 次 |
| GET | `/auth/cafeca/config` | — | `{enabled, wallet, origins}` |
| POST | `/auth/cafeca/nonce` | `{domain}` | `{nonce, ticket, wallet, expires_in}` |
| POST | `/auth/cafeca/login` | `{response, ticket}` | `{token, user, created}`；首次登入自動建立帳號（見 [auth.md](auth.md)） |

## 3. 用戶 API（`/api`，需 JWT）

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET / PATCH | `/api/me` | 取得 / 更新 `name`、`zero_data_retention`、`current_password` + `new_password` |
| GET | `/api/plans` | 方案列表（公開） |
| GET | `/api/billing` | `{currency, base, unit}` 計價單位與費用基數（公開） |
| POST | `/api/me/cafeca/nonce` | 綁定用 nonce `{domain}` |
| POST / DELETE | `/api/me/cafeca` | 綁定 `{response, ticket}` / 解除綁定（需有 Email + 密碼） |
| POST | `/api/subscription` | `{plan_id}` 切換方案（付費方案需 `AICH_SELF_SERVICE_PLANS=true`） |
| GET | `/api/models` | 模型、等級、能力、每 1M tokens 的 ISC 價格、是否可用 |
| GET / POST | `/api/keys` | 列出 / 建立金鑰 `{name, credit_limit?, allowed_models?, rpm_limit?, tpm_limit?, expires_in_days?}`（明文金鑰只回傳一次） |
| PATCH / DELETE | `/api/keys/{id}` | 更新設定 / 撤銷 |
| GET | `/api/usage?days=30` | 每日用量、各模型用量、總計 |
| GET | `/api/logs?limit&offset` | 請求日誌（扣款明細） |
| GET | `/api/ledger?limit&offset` | 餘額異動帳本 |
| GET / POST | `/api/provider-keys` | 企業 BYOK 金鑰（`{provider_id, key, label?}`） |
| DELETE | `/api/provider-keys/{id}` | 移除 BYOK 金鑰 |

## 4. 管理 API（`/admin`，需 role=admin 的 JWT）

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/admin/overview?hours=24` | 總計、各供應商（成功率、平均/P95 延遲、TTFT）、各模型、時間序列、用戶數 |
| GET | `/admin/health` | 即時斷路器與 EWMA、金鑰冷卻、各供應商本月花費/預算 |
| POST | `/admin/health/reset` | `{target}` 重設某節點斷路器 |
| POST | `/admin/reload` | 立即重新載入路由設定 |
| GET / POST | `/admin/providers` | 供應商列表 / 新增 `{id, kind, base_url, name?, timeout_ms?, monthly_budget_credits?, config?}` |
| PATCH / DELETE | `/admin/providers/{id}` | 更新 / 刪除 |
| GET / POST | `/admin/providers/{id}/keys` | 金鑰池（只顯示末四碼）/ 新增 `{key, label?, weight?}` |
| POST | `/admin/providers/{id}/test-key` | `{key}` 儲存前測試金鑰（呼叫上游的模型列表，不產生費用） |
| POST | `/admin/provider-keys/{id}/test` | 測試已託管的金鑰（伺服器端解密，金鑰不離開 Gateway） |
| PATCH / DELETE | `/admin/provider-keys/{id}` | `{enabled?, weight?, label?, key?}`（帶 `key` 即輪替密鑰） |
| GET / POST | `/admin/models` | 模型（含路由）/ 新增 |
| PATCH / DELETE | `/admin/models/{id}` | 更新 / 刪除 |
| POST | `/admin/models/{id}/routes` | 新增路由 `{provider_id, upstream_model, priority, input_price, output_price, tags}` |
| PATCH / DELETE | `/admin/routes/{id}` | 更新 / 刪除路由 |
| GET | `/admin/users?q=` | 用戶列表 |
| PATCH | `/admin/users/{id}` | `{plan_id?, role?, status?, name?, zero_data_retention?, grant_plan_credits?}` |
| POST | `/admin/users/{id}/credits` | `{delta, reason}` 加減 ISC 餘額（micro-ISC） |
| GET / PATCH | `/admin/plans`, `/admin/plans/{id}` | 方案設定 |
| GET | `/admin/logs?provider_id&model&user_id&errors_only` | 全平台日誌 |
| GET | `/admin/logs/{id}` | 單筆日誌（含內容，若有記錄） |
| GET / PUT | `/admin/settings`, `/admin/settings/{guardrails\|cache\|billing}` | 風控、快取、計價（`{currency, base}`）設定 |

路由價格欄位 `input_price`／`output_price` 為官方牌價（micro-USD / 1M tokens = USD/1M × 1,000,000），`ratio_bp` 為倍率萬分比；所有金額欄位為 micro-ISC。見 [billing.md](billing.md)。
