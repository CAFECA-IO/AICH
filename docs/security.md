# 安全、風控與合規

## 1. 祕密管理

| 項目 | 作法 |
| --- | --- |
| 上游供應商金鑰 | AES-256-GCM 加密（`v1:` + base64(nonce‖ciphertext)），每筆隨機 nonce；API 只回傳末四碼 |
| 主金鑰 `AICH_MASTER_KEY` | 32 bytes，由環境變數注入。正式環境請由 AWS KMS / GCP KMS / HashiCorp Vault 產生並以 secret 注入，勿寫入映像或版控 |
| 用戶 API 金鑰 | `sk-hub-` + 40 字元亂數；資料庫只存 SHA-256 雜湊；明文只在建立時顯示一次 |
| 用戶密碼 | Argon2id（CAFECA 使用者沒有密碼） |
| CAFECA 登入 | Passkey 簽署的 EIP-712 訊息，以 ERC-1271 鏈上驗證；nonce 單次使用並綁定瀏覽器 ticket（見 [auth.md](auth.md)） |
| Web Session | HS256 JWT（7 天），`AICH_JWT_SECRET` ≥ 32 字元 |

`.env` 不可提交版控（已列入 `.gitignore`）；以 `./scripts/init_env.sh` 產生祕密。

主金鑰輪替：以新主金鑰重新加密 `provider_keys.key_ciphertext`（roadmap 提供 CLI）；過渡期間可在後台對每把上游金鑰「重新貼上」完成輪替。

## 2. 管理員

- **第一位登入的人自動成為管理員**（Enterprise 方案）。判斷在資料庫交易中以 advisory lock 序列化，兩個人同時註冊也只會有一位管理員。
- 選用的 `AICH_ADMIN_EMAIL`／`AICH_ADMIN_PASSWORD` 會在啟動時建立「備援管理員」（`is_bootstrap`），它不會佔掉「第一位管理員」的位置。
- 部署後請儘快完成第一次登入，避免他人搶先註冊成為管理員；正式環境可先以防火牆限制存取，完成首次登入後再開放。
- 管理員可在「用戶管理」把其他人設為管理員或降級。

## 3. 零數據留存（Zero Data Retention）

- 用戶在「帳號與方案」自行開啟；管理員也可替企業用戶設定。
- 開啟後：不寫入 request/response 內容、不使用回應快取。只保留計費所需的 metadata（模型、token 數、點數、延遲、狀態碼）。
- 全域預設 `AICH_LOG_BODIES=false`：即使未開啟 ZDR，也不記錄內容；需要除錯時才在特定環境開啟。
- 對話紀錄只存在用戶瀏覽器（localStorage），伺服器不保存聊天歷史。
- 平台不將任何資料用於訓練；上游供應商請選用其不訓練 / ZDR 的企業方案。

## 4. Guardrails

- 模式：`off`（預設）、`flag`（放行，回應標頭 `x-hub-guardrail` 標記並寫入日誌）、`block`（400 `content_policy_violation`）。
- 規則：管理員設定的敏感詞（不分大小寫）、Prompt Injection 樣式（中英文：「ignore previous instructions」「忽略之前的指示」等）。
- 只檢查 user / tool 訊息。可擴充為呼叫外部審核模型（roadmap）。

## 5. 濫用與異常流量防禦

| 機制 | 細節 |
| --- | --- |
| RPM / TPM | 每把金鑰（網頁則每位用戶）每分鐘視窗；預設值依方案，金鑰可再收緊但不可超過方案上限 |
| 自動停用 | 10 分鐘內被限流 300 次的金鑰自動設為 `suspended`（用戶無法自行解除，需聯絡管理員） |
| 登入保護 | 每 email 每 15 分鐘最多 10 次登入嘗試 |
| 請求大小 | `AICH_MAX_BODY_BYTES`（預設 20MB） |
| 帳號停權 | 管理員可停權用戶，所有金鑰與 Session 立即失效 |

## 6. 網路與部署建議

- Gateway 前方放置 TLS 終止的負載平衡器 / WAF；`/admin/*` 可再以 IP 白名單限制。
- `AICH_CORS_ORIGINS` 在正式環境設定為實際網域。
- Postgres 與 Redis 不對外開放；Redis 設定密碼與 `maxmemory-policy allkeys-lru`。
- 映像以非 root 使用者（uid 10001）執行。

## 7. 稽核

- `request_logs`：每筆請求的用戶、金鑰、模型、實際路由、狀態、token、點數、延遲、嘗試次數。
- `credit_ledger`：所有非用量的點數異動，`ref_id` 記錄操作的管理員 email。
