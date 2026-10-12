export interface Plan {
  id: string;
  name: string;
  /** micro-ISC */
  monthly_fee: number;
  /** micro-ISC granted every month */
  monthly_credits: number;
  allow_api: boolean;
  allowed_tiers: string[];
  routing_priority: number;
  default_rpm: number;
  default_tpm: number;
  byok: boolean;
  sort_order: number;
  features: string[];
}

export interface User {
  id: string;
  email: string | null;
  name: string;
  role: "user" | "admin";
  status: string;
  plan: Plan | null;
  credit_balance: number;
  zero_data_retention: boolean;
  cafeca_account: string | null;
  cafeca_handle: string | null;
  has_password: boolean;
}

export interface HubModel {
  id: string;
  name: string;
  description: string;
  tier: "basic" | "premium";
  strategy: string;
  context_window: number;
  supports_vision: boolean;
  supports_tools: boolean;
  available: boolean;
  /** ISC per 1M tokens (cheapest route) */
  price_per_1m_input: number;
  price_per_1m_output: number;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  credit_limit: number | null;
  credits_used: number;
  allowed_models: string[] | null;
  rpm_limit: number | null;
  tpm_limit: number | null;
  status: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface RequestLog {
  id: string;
  email?: string;
  model: string;
  provider_id: string | null;
  upstream_model: string | null;
  strategy: string | null;
  intent: string | null;
  status_code: number;
  error: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  credits: number;
  latency_ms: number;
  ttft_ms: number | null;
  attempts: number;
  cached: boolean;
  stream: boolean;
  created_at: string;
  api_key_name?: string | null;
}

export interface ChatPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatPart[];
  meta?: {
    model?: string;
    provider?: string;
    upstream?: string;
    intent?: string;
    attempts?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    error?: string;
  };
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  updated_at: number;
}
