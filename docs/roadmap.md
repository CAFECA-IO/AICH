# 開發路線圖

## v2.0 MVP（本次交付）✅

- Rust Gateway：OpenAI 相容 `/v1/chat/completions`（含 SSE 串流、tools、vision、JSON mode）與 `/v1/models`
- Provider adapters：OpenAI 相容（OpenAI / DeepSeek / Mistral / Groq / xAI / OpenRouter / vLLM…）、Anthropic Messages、Google Gemini、Mock
- 智能路由：failover / cost / latency / intent；串流首字前備援；斷路器；EWMA 延遲
- 金鑰池：AES-256-GCM 加密、加權輪替、429/401 冷卻、企業 BYOK
- 計費：通用點數、方案、每月發放、帳本、金鑰額度
- 風控：RPM/TPM、濫用自動停用、Guardrails、零數據留存、登入限流
- 快取：精確比對回應快取（Redis / 記憶體）
- Web：聊天 WebUI、開發者控制台（金鑰、用量、模型、方案、BYOK）、管理後台（監控、供應商/金鑰、模型映射、用戶、日誌、方案與風控）
- 測試：32 個單元測試、41 項端對端測試、上游線路格式模擬器；CI；Docker Compose

## v2.1 商業化（建議 4–6 週）

- [ ] 金流整合（Stripe / 綠界）：Checkout、Webhook、點數加購包、發票
- [ ] 路由進價欄位與毛利報表
- [ ] 成本 / 預算警報通知（Email、Slack Webhook）
- [ ] 主金鑰輪替 CLI、KMS 直連（AWS KMS / GCP KMS / Vault Transit）
- [ ] 團隊 / 組織：成員邀請、角色權限、共用點數池、組織層級 API 金鑰
- [ ] `request_logs` 月分區與保留政策

## v2.2 能力擴充

- [ ] 語意快取：Embeddings + Qdrant，可設定相似度門檻與範圍（用戶 / 組織 / 全域）
- [ ] `/v1/embeddings`、`/v1/images/generations`、`/v1/audio/*`
- [ ] Anthropic 原生 `/v1/messages` 入口（讓 Claude Code 等工具直接接入）
- [ ] OpenAI Responses API 相容
- [ ] 小模型意圖分類器（可選，取代啟發式）
- [ ] Prompt caching 透傳（Anthropic cache_control、OpenAI cached tokens 計價）

## v2.3 規模與可靠度

- [ ] OpenTelemetry traces / Prometheus metrics
- [ ] 斷路器與健康度跨實例共享（Redis）選項
- [ ] 多區域部署、就近路由
- [ ] 外部內容審核模型整合
- [ ] SLA 報表與企業專屬備援通道（專用金鑰池 + 專用路由）

## 已知限制

- 串流在首字之後中斷無法備援（業界共通限制）。
- 意圖分類為啟發式，可用 `X-Hub-Intent` 覆寫。
- Token 預估（限流、無 usage 時計費）為近似值。
- 種子資料價格為範例，需上線前核對。
