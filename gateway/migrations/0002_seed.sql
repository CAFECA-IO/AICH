-- Seed data: plans, providers, models and routes.
-- NOTE: prices below are SAMPLE list prices (USD per 1M tokens x 1e6 = credits per 1M tokens).
-- Verify against each provider's current pricing page and adjust in the Admin Portal before launch.

INSERT INTO plans (id, name, monthly_price_cents, monthly_credits, allow_api, allowed_tiers, routing_priority, default_rpm, default_tpm, byok, sort_order, features) VALUES
('free',       'Free',       0,     200000,  FALSE, ARRAY['basic'],            0,   10,   20000,  FALSE, 0, '["每月 200,000 點", "Web UI 聊天", "基礎模型"]'),
('starter',    'Starter',    999,   1000000, FALSE, ARRAY['basic'],            1,   30,   60000,  FALSE, 1, '["每月 1,000,000 點", "Web UI 聊天", "基礎模型轉接", "智能路由"]'),
('pro',        'Pro',        2999,  3500000, TRUE,  ARRAY['basic','premium'],  10,  120,  400000, FALSE, 2, '["每月 3,500,000 點", "全模型開放", "API Key 存取", "高優先級路由"]'),
('enterprise', 'Enterprise', 19900, 30000000, TRUE, ARRAY['basic','premium'],  100, 1200, 4000000, TRUE, 3, '["自訂點數額度", "自訂金鑰池 (BYOK)", "專屬備援通道", "SLA 保障", "零數據留存", "團隊權限控管"]');

INSERT INTO providers (id, kind, name, base_url, enabled, timeout_ms, config) VALUES
('openai',    'openai',    'OpenAI',        'https://api.openai.com/v1',                   TRUE, 120000, '{"stream_usage": true}'),
('anthropic', 'anthropic', 'Anthropic',     'https://api.anthropic.com',                   TRUE, 120000, '{}'),
('gemini',    'gemini',    'Google Gemini', 'https://generativelanguage.googleapis.com',   TRUE, 120000, '{}'),
('deepseek',  'openai',    'DeepSeek',      'https://api.deepseek.com/v1',                 TRUE, 120000, '{"stream_usage": true}'),
('mistral',   'openai',    'Mistral',       'https://api.mistral.ai/v1',                   TRUE, 120000, '{"stream_usage": false}'),
('mock',      'mock',      'Mock (dev/test)','mock://local',                                TRUE, 30000,  '{}');

-- The mock provider needs a (dummy) key so it participates in key-pool logic.
INSERT INTO provider_keys (id, provider_id, label, key_ciphertext, key_last4) VALUES
(gen_random_uuid(), 'mock', 'mock-key', 'plain:mock', 'mock');

INSERT INTO models (id, display_name, description, tier, strategy, context_window, supports_vision, sort_order) VALUES
('hub-auto',          'Hub Auto (Intent)',   '依任務意圖自動派送：程式碼、長文本、推理或一般對話。', 'premium', 'intent',   200000,  TRUE,  0),
('hub-auto-cheap',    'Hub Auto (Cost)',     '自動挑選當下最便宜的健康模型。',                               'basic',   'cost',     128000,  FALSE, 1),
('hub-auto-fast',     'Hub Auto (Latency)',  '自動挑選當下回應最快的節點。',                        'basic',   'latency',  128000,  FALSE, 2),
('hub-gpt-4o',        'GPT-4o',              'OpenAI GPT-4o，故障時備援至 Claude。',                                   'premium', 'failover', 128000,  TRUE,  10),
('hub-gpt-4o-mini',   'GPT-4o mini',         'OpenAI GPT-4o mini，故障時備援至 Gemini Flash。',                        'basic',   'failover', 128000,  TRUE,  11),
('hub-claude-sonnet', 'Claude Sonnet',       'Anthropic Claude Sonnet，故障時備援至 GPT-4o。',                         'premium', 'failover', 200000,  TRUE,  20),
('hub-claude-haiku',  'Claude Haiku',        'Anthropic Claude Haiku，快速且平價。',                                               'basic',   'failover', 200000,  TRUE,  21),
('hub-gemini-pro',    'Gemini Pro',          'Google Gemini Pro，擅長長文件分析。',                         'premium', 'failover', 1000000, TRUE,  30),
('hub-gemini-flash',  'Gemini Flash',        'Google Gemini Flash，快速又便宜。',                                  'basic',   'failover', 1000000, TRUE,  31),
('hub-deepseek-chat', 'DeepSeek Chat',       'DeepSeek 對話模型，程式與通用任務 CP 值高。',           'basic',   'failover', 128000,  FALSE, 40),
('hub-mistral-large', 'Mistral Large',       'Mistral 旗艦模型。',                                               'premium', 'failover', 128000,  FALSE, 50),
('hub-mock',          'Mock Echo',           '開發測試用，原樣回覆輸入內容，無上游成本。',           'basic',   'failover', 32000,   TRUE,  90),
('hub-mock-failover', 'Mock Failover Demo',  '主要路由固定回 500、由備援路由回答，用於展示自動備援。','basic',  'failover', 32000,   TRUE,  91);

INSERT INTO model_routes (id, model_id, provider_id, upstream_model, priority, input_price, output_price, tags) VALUES
-- hub-auto (intent)
(gen_random_uuid(), 'hub-auto', 'deepseek',  'deepseek-chat',     0, 280000,  420000,   ARRAY['code','general','simple']),
(gen_random_uuid(), 'hub-auto', 'anthropic', 'claude-sonnet-4-5', 1, 3000000, 15000000, ARRAY['code','reasoning']),
(gen_random_uuid(), 'hub-auto', 'gemini',    'gemini-2.5-pro',    2, 1250000, 10000000, ARRAY['long_context','reasoning']),
(gen_random_uuid(), 'hub-auto', 'openai',    'gpt-4o',            3, 2500000, 10000000, ARRAY['general','vision']),
(gen_random_uuid(), 'hub-auto', 'gemini',    'gemini-2.5-flash',  4, 300000,  2500000,  ARRAY['simple','long_context','vision']),
-- hub-auto-cheap (cost)
(gen_random_uuid(), 'hub-auto-cheap', 'deepseek', 'deepseek-chat',    0, 280000, 420000,  ARRAY['general']),
(gen_random_uuid(), 'hub-auto-cheap', 'gemini',   'gemini-2.5-flash', 1, 300000, 2500000, ARRAY['general']),
(gen_random_uuid(), 'hub-auto-cheap', 'openai',   'gpt-4o-mini',      2, 150000, 600000,  ARRAY['general']),
-- hub-auto-fast (latency)
(gen_random_uuid(), 'hub-auto-fast', 'gemini',    'gemini-2.5-flash', 0, 300000,  2500000, ARRAY['general']),
(gen_random_uuid(), 'hub-auto-fast', 'openai',    'gpt-4o-mini',      1, 150000,  600000,  ARRAY['general']),
(gen_random_uuid(), 'hub-auto-fast', 'anthropic', 'claude-haiku-4-5', 2, 1000000, 5000000, ARRAY['general']),
-- direct models with failover
(gen_random_uuid(), 'hub-gpt-4o',        'openai',    'gpt-4o',            0, 2500000, 10000000, ARRAY[]::TEXT[]),
(gen_random_uuid(), 'hub-gpt-4o',        'anthropic', 'claude-sonnet-4-5', 1, 3000000, 15000000, ARRAY[]::TEXT[]),
(gen_random_uuid(), 'hub-gpt-4o-mini',   'openai',    'gpt-4o-mini',       0, 150000,  600000,   ARRAY[]::TEXT[]),
(gen_random_uuid(), 'hub-gpt-4o-mini',   'gemini',    'gemini-2.5-flash',  1, 300000,  2500000,  ARRAY[]::TEXT[]),
(gen_random_uuid(), 'hub-claude-sonnet', 'anthropic', 'claude-sonnet-4-5', 0, 3000000, 15000000, ARRAY[]::TEXT[]),
(gen_random_uuid(), 'hub-claude-sonnet', 'openai',    'gpt-4o',            1, 2500000, 10000000, ARRAY[]::TEXT[]),
(gen_random_uuid(), 'hub-claude-haiku',  'anthropic', 'claude-haiku-4-5',  0, 1000000, 5000000,  ARRAY[]::TEXT[]),
(gen_random_uuid(), 'hub-gemini-pro',    'gemini',    'gemini-2.5-pro',    0, 1250000, 10000000, ARRAY[]::TEXT[]),
(gen_random_uuid(), 'hub-gemini-flash',  'gemini',    'gemini-2.5-flash',  0, 300000,  2500000,  ARRAY[]::TEXT[]),
(gen_random_uuid(), 'hub-deepseek-chat', 'deepseek',  'deepseek-chat',     0, 280000,  420000,   ARRAY[]::TEXT[]),
(gen_random_uuid(), 'hub-mistral-large', 'mistral',   'mistral-large-latest', 0, 2000000, 6000000, ARRAY[]::TEXT[]),
-- mock
(gen_random_uuid(), 'hub-mock',          'mock', 'mock-echo', 0, 1000, 2000, ARRAY['general']),
(gen_random_uuid(), 'hub-mock-failover', 'mock', 'fail-500',  0, 1000, 2000, ARRAY['general']),
(gen_random_uuid(), 'hub-mock-failover', 'mock', 'mock-echo', 1, 1000, 2000, ARRAY['general']);

INSERT INTO settings (key, value) VALUES
('guardrails', '{"mode": "off", "blocked_terms": [], "detect_prompt_injection": true}'),
('cache', '{"enabled": true, "ttl_seconds": 3600}');
