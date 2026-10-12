-- AICH v2 initial schema
-- Credits: 1 credit = USD 0.000001. Prices are stored as credits per 1M tokens
-- (numerically equal to "micro-USD per token" => USD/Mtok * 1e6).

CREATE TABLE plans (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    monthly_price_cents   INTEGER NOT NULL DEFAULT 0,
    monthly_credits       BIGINT NOT NULL DEFAULT 0,
    allow_api             BOOLEAN NOT NULL DEFAULT FALSE,
    allowed_tiers         TEXT[] NOT NULL DEFAULT ARRAY['basic'],
    routing_priority      INTEGER NOT NULL DEFAULT 0,
    default_rpm           INTEGER NOT NULL DEFAULT 20,
    default_tpm           INTEGER NOT NULL DEFAULT 40000,
    byok                  BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order            INTEGER NOT NULL DEFAULT 0,
    features              JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE users (
    id                    UUID PRIMARY KEY,
    email                 TEXT NOT NULL UNIQUE,
    password_hash         TEXT NOT NULL,
    name                  TEXT NOT NULL DEFAULT '',
    role                  TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    plan_id               TEXT NOT NULL REFERENCES plans(id),
    plan_renews_at        TIMESTAMPTZ,
    credit_balance        BIGINT NOT NULL DEFAULT 0,
    zero_data_retention   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE credit_ledger (
    id                    BIGSERIAL PRIMARY KEY,
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta                 BIGINT NOT NULL,
    balance_after         BIGINT NOT NULL,
    reason                TEXT NOT NULL,
    ref_id                TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX credit_ledger_user_idx ON credit_ledger (user_id, created_at DESC);

CREATE TABLE api_keys (
    id                    UUID PRIMARY KEY,
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    prefix                TEXT NOT NULL,
    key_hash              TEXT NOT NULL UNIQUE,
    credit_limit          BIGINT,
    credits_used          BIGINT NOT NULL DEFAULT 0,
    allowed_models        TEXT[],
    rpm_limit             INTEGER,
    tpm_limit             INTEGER,
    status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'suspended')),
    expires_at            TIMESTAMPTZ,
    last_used_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX api_keys_user_idx ON api_keys (user_id);

CREATE TABLE providers (
    id                    TEXT PRIMARY KEY,
    kind                  TEXT NOT NULL CHECK (kind IN ('openai', 'anthropic', 'gemini', 'mock')),
    name                  TEXT NOT NULL,
    base_url              TEXT NOT NULL,
    enabled               BOOLEAN NOT NULL DEFAULT TRUE,
    timeout_ms            INTEGER NOT NULL DEFAULT 120000,
    monthly_budget_credits BIGINT,
    config                JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE provider_keys (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id           TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    owner_user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    label                 TEXT NOT NULL DEFAULT '',
    key_ciphertext        TEXT NOT NULL,
    key_last4             TEXT NOT NULL DEFAULT '',
    enabled               BOOLEAN NOT NULL DEFAULT TRUE,
    weight                INTEGER NOT NULL DEFAULT 1,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX provider_keys_provider_idx ON provider_keys (provider_id);

CREATE TABLE models (
    id                    TEXT PRIMARY KEY,
    display_name          TEXT NOT NULL,
    description           TEXT NOT NULL DEFAULT '',
    tier                  TEXT NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic', 'premium')),
    strategy              TEXT NOT NULL DEFAULT 'failover' CHECK (strategy IN ('failover', 'cost', 'latency', 'intent')),
    context_window        INTEGER NOT NULL DEFAULT 128000,
    supports_vision       BOOLEAN NOT NULL DEFAULT FALSE,
    supports_tools        BOOLEAN NOT NULL DEFAULT TRUE,
    enabled               BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order            INTEGER NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE model_routes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id              TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    provider_id           TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    upstream_model        TEXT NOT NULL,
    priority              INTEGER NOT NULL DEFAULT 0,
    input_price           BIGINT NOT NULL DEFAULT 0,   -- credits per 1M input tokens
    output_price          BIGINT NOT NULL DEFAULT 0,   -- credits per 1M output tokens
    tags                  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    enabled               BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX model_routes_model_idx ON model_routes (model_id);

CREATE TABLE request_logs (
    id                    UUID PRIMARY KEY,
    user_id               UUID,
    api_key_id            UUID,
    model                 TEXT NOT NULL,
    provider_id           TEXT,
    upstream_model        TEXT,
    strategy              TEXT,
    intent                TEXT,
    status_code           INTEGER NOT NULL,
    error                 TEXT,
    prompt_tokens         INTEGER NOT NULL DEFAULT 0,
    completion_tokens     INTEGER NOT NULL DEFAULT 0,
    credits               BIGINT NOT NULL DEFAULT 0,
    latency_ms            INTEGER NOT NULL DEFAULT 0,
    ttft_ms               INTEGER,
    attempts              INTEGER NOT NULL DEFAULT 1,
    cached                BOOLEAN NOT NULL DEFAULT FALSE,
    stream                BOOLEAN NOT NULL DEFAULT FALSE,
    request_body          JSONB,
    response_body         JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX request_logs_user_idx ON request_logs (user_id, created_at DESC);
CREATE INDEX request_logs_created_idx ON request_logs (created_at DESC);
CREATE INDEX request_logs_provider_idx ON request_logs (provider_id, created_at DESC);

CREATE TABLE settings (
    key                   TEXT PRIMARY KEY,
    value                 JSONB NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
