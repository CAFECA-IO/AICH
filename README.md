# AICH — AI Computing Hub

**AI 算力轉接與模型路由平台。** 一把金鑰、一套 OpenAI 相容 API，即可使用 OpenAI、Anthropic、Google Gemini、DeepSeek、Mistral 等所有主流模型；平台負責智能路由、自動備援、金鑰池管理與統一的 ISC 計價（官方收費比例 × 費用基數）。

```text
[Web UI / 第三方 App / OpenAI SDK]
              │  OpenAI-compatible  (/v1/chat/completions, SSE)
              ▼
   ┌──────────────────────────┐
   │   AICH Gateway (Rust)    │  鑑權 · RPM/TPM 限流 · Guardrails · 快取
   │   Smart Routing Engine   │  failover / cost / latency / intent
   │   Key Pool · Circuit Br. │  金鑰輪替 · 冷卻 · 斷路器 · 預算斷路
   │   ISC Billing · Logs     │  ISC 計價 · 帳本 · 非同步日誌
   └────────────┬─────────────┘
        ┌───────┼──────────┬───────────┐
        ▼       ▼          ▼           ▼
     OpenAI  Anthropic   Gemini   DeepSeek / Mistral / 任何 OpenAI 相容服務
```

## 專案結構

| 路徑 | 說明 |
| --- | --- |
| `gateway/` | Rust（axum + tokio + sqlx）高效能 API Gateway 與路由引擎，含資料庫 migrations |
| `web/` | Next.js 16 前台與後台：聊天 WebUI、開發者控制台、管理後台 |
| `docs/` | 產品規劃、架構、API、路由、計費、安全、路線圖文件 |
| `docker-compose.yml` | 單機部署：Postgres + Redis + Gateway + Web |

## 快速開始（Docker）

```bash
./scripts/init_env.sh          # 建立 .env 並自動產生 AICH_MASTER_KEY、AICH_JWT_SECRET
docker compose up -d --build
```

- Web UI：<http://localhost:3000>。**第一位登入的人（CAFECA 或 Email）自動成為管理員**，並被帶到「AI Token 託管」頁貼上各家 API Key；接著到「ISC 計價」設定費用基數。之後註冊的都是一般用戶
- OpenAI 相容 API：`http://localhost:8080/v1`

不需要任何上游金鑰也能試用：內建 `mock` 供應商提供 `hub-mock`（回聲）與 `hub-mock-failover`（展示自動備援）兩個模型。

## 一鍵啟動（npm run swarm）

從原始碼編譯並啟動整套服務，**只對外開一個埠 10016**：

```bash
npm run swarm          # 首次會自動產生 .env 密鑰、啟動 Postgres/Redis、編譯 Gateway 與 Web
npm run swarm:down     # 停止 swarm 啟動的 Postgres/Redis 容器
```

- Web UI：<http://localhost:10016>；OpenAI 相容 API：`http://localhost:10016/v1`（Web 代理至內部 Gateway `127.0.0.1:10017`）
- 需求：Node.js 22+、Rust（cargo）、Docker（只用來跑 Postgres `127.0.0.1:10018` 與 Redis `127.0.0.1:10019`）。已有資料庫時在 `.env` 設定 `DATABASE_URL`（與選用的 `REDIS_URL`）即可不用 Docker
- 原始碼沒變時會略過 Web 重新編譯；`npm run swarm -- --no-build` 直接沿用既有編譯結果
- 可調整：`SWARM_PORT`、`SWARM_HOST`、`SWARM_GATEWAY_PORT`、`SWARM_PG_PORT`、`SWARM_REDIS_PORT`；從其他網址存取（例如區網 IP 或網域）時設定 `SWARM_PUBLIC_URL=https://hub.example.com`，它會成為文件中的 API 位址並加入 CAFECA 登入允許來源

## 本機開發

需求：Rust（stable）、Node.js 22、PostgreSQL 16、Redis 7（選用，未設定時退回記憶體）。

```bash
# Gateway
cd gateway
export DATABASE_URL=postgres://aich:aich@localhost:5432/aich
export AICH_MASTER_KEY=$(openssl rand -hex 32) AICH_JWT_SECRET=$(openssl rand -base64 48)
export AICH_ADMIN_EMAIL=admin@aich.local AICH_ADMIN_PASSWORD=admin12345
cargo run                      # 啟動時自動執行 migrations 並建立管理員

# Web
cd web
cp .env.sample .env.local      # GATEWAY_URL=http://localhost:8080
npm install && npm run dev     # http://localhost:3000
```

## 使用方式

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8080/v1", api_key="sk-hub-...")
client.chat.completions.create(model="hub-auto", messages=[{"role": "user", "content": "Hello"}])
```

- `hub-auto`：意圖路由（程式碼 / 長文本 / 推理 / 視覺 / 簡單任務）
- `hub-auto-cheap`：成本優先；`hub-auto-fast`：延遲優先
- `hub-gpt-4o`、`hub-claude-sonnet`、`hub-gemini-pro` …：固定模型 + 跨供應商備援
- 標頭 `X-Hub-Strategy` / `X-Hub-Intent` / `X-Hub-Cache` 可逐請求覆寫行為，回應標頭會告訴你實際路由結果。詳見 [docs/api.md](docs/api.md)。

## 測試

```bash
cd gateway && cargo test                 # 單元測試：轉換器、SSE、路由、斷路器、金鑰池、計費…
CAFECA_MOCK=1 ./scripts/e2e.sh           # 對執行中的 gateway 跑端對端測試（mock 供應商 + 假 CAFECA 錢包）
python3 scripts/fake_upstreams.py 9100   # 模擬 OpenAI/Anthropic/Gemini 線路格式，用於驗證 adapter
cd web && npm run lint && npm run typecheck && npm run build
```

CI（`.github/workflows/test.yaml`）會執行上述全部檢查。

## 文件

- [產品規劃 PRD](docs/prd.md)
- [登入：Sign in with CAFECA](docs/auth.md)
- [系統架構](docs/architecture.md)
- [API 參考](docs/api.md)
- [智能路由引擎](docs/routing.md)
- [ISC 計價](docs/billing.md)
- [安全、風控與合規](docs/security.md)
- [開發路線圖](docs/roadmap.md)

## License

MIT
