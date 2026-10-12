-- 1) "First person to sign in becomes admin": the optional env-bootstrapped admin does not count.
ALTER TABLE users ADD COLUMN is_bootstrap BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET is_bootstrap = TRUE
 WHERE id IN (SELECT user_id FROM credit_ledger WHERE reason = 'admin_bootstrap');

-- 2) ISC pricing.
-- All balances / charges / limits are stored as integer micro-ISC (1 ISC = 1,000,000 units):
--   users.credit_balance, api_keys.credit_limit/credits_used, request_logs.credits,
--   credit_ledger.delta, plans.monthly_credits, plans.monthly_fee, providers.monthly_budget_credits.
-- model_routes.input_price / output_price are each model's OFFICIAL upstream list price in
-- micro-USD per 1M tokens (i.e. USD/1M × 1,000,000) — the "收費比例" between models.
-- Charge (ISC) = (prompt × input_price + completion × output_price) / 1e6 [USD] × ratio × base
--   base  = settings.billing.base  — ISC per 1 USD of upstream list price (費用基數, global)
--   ratio = model_routes.ratio_bp / 10000 — optional per-route adjustment (default 1.0)
ALTER TABLE plans RENAME COLUMN monthly_price_cents TO monthly_fee;
ALTER TABLE plans ALTER COLUMN monthly_fee TYPE BIGINT;
UPDATE plans SET monthly_fee = monthly_fee * 10000;  -- 1/100 units → micro units (9.99 stays 9.99)
-- Credit amounts are now rendered from monthly_credits, so drop the hard-coded "每月 … 點" lines.
UPDATE plans SET features = COALESCE(
  (SELECT jsonb_agg(f) FROM jsonb_array_elements(features) f WHERE f #>> '{}' NOT LIKE '每月%點'), '[]'::jsonb);

ALTER TABLE model_routes ADD COLUMN ratio_bp INTEGER NOT NULL DEFAULT 10000 CHECK (ratio_bp > 0);

INSERT INTO settings (key, value) VALUES ('billing', '{"currency": "ISC", "base": 1}')
ON CONFLICT (key) DO NOTHING;
