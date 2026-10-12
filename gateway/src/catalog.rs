//! In-memory snapshot of routing configuration (providers, keys, models, routes, plans, settings).
//! Reloaded periodically and after every admin mutation; swapped atomically.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::crypto;
use crate::providers::ProviderKind;

#[derive(Debug, Clone)]
pub struct ProviderInfo {
    pub id: String,
    pub kind: ProviderKind,
    pub name: String,
    pub base_url: String,
    pub enabled: bool,
    pub timeout: Duration,
    pub monthly_budget: Option<i64>,
    pub month_spend: i64,
    pub config: Value,
}

impl ProviderInfo {
    pub fn budget_exceeded(&self) -> bool {
        matches!(self.monthly_budget, Some(b) if self.month_spend >= b)
    }
}

#[derive(Debug, Clone)]
pub struct ProviderKey {
    pub id: Uuid,
    pub provider_id: String,
    pub owner_user_id: Option<Uuid>,
    pub secret: String,
    pub weight: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Strategy {
    Failover,
    Cost,
    Latency,
    Intent,
}

impl Strategy {
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "failover" => Some(Self::Failover),
            "cost" => Some(Self::Cost),
            "latency" => Some(Self::Latency),
            "intent" => Some(Self::Intent),
            _ => None,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Failover => "failover",
            Self::Cost => "cost",
            Self::Latency => "latency",
            Self::Intent => "intent",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Route {
    pub id: Uuid,
    pub provider_id: String,
    pub upstream_model: String,
    pub priority: i32,
    /// Official upstream list price, micro-USD per 1M input tokens.
    pub input_price: i64,
    /// Official upstream list price, micro-USD per 1M output tokens.
    pub output_price: i64,
    pub tags: Vec<String>,
    /// Per-route multiplier in basis points (10000 = 1.0).
    pub ratio_bp: i32,
}

#[derive(Debug, Clone)]
pub struct ModelInfo {
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub tier: String,
    pub strategy: Strategy,
    pub context_window: i32,
    pub supports_vision: bool,
    pub supports_tools: bool,
    pub sort_order: i32,
    pub routes: Vec<Route>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Plan {
    pub id: String,
    pub name: String,
    /// Monthly subscription fee in micro-ISC.
    pub monthly_fee: i64,
    pub monthly_credits: i64,
    pub allow_api: bool,
    pub allowed_tiers: Vec<String>,
    pub routing_priority: i32,
    pub default_rpm: i32,
    pub default_tpm: i32,
    pub byok: bool,
    pub sort_order: i32,
    pub features: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardrailSettings {
    #[serde(default = "off")]
    pub mode: String, // off | flag | block
    #[serde(default)]
    pub blocked_terms: Vec<String>,
    #[serde(default = "yes")]
    pub detect_prompt_injection: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheSettings {
    #[serde(default = "yes")]
    pub enabled: bool,
    #[serde(default = "hour")]
    pub ttl_seconds: u64,
}

fn off() -> String {
    "off".into()
}
fn yes() -> bool {
    true
}
fn hour() -> u64 {
    3600
}

impl Default for GuardrailSettings {
    fn default() -> Self {
        Self {
            mode: off(),
            blocked_terms: vec![],
            detect_prompt_injection: true,
        }
    }
}
/// Global pricing: every model's ISC price = official USD list price × route ratio × `base`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingSettings {
    #[serde(default = "isc")]
    pub currency: String,
    /// 費用基數: ISC charged per 1 USD of upstream list price.
    #[serde(default = "one")]
    pub base: f64,
}

fn isc() -> String {
    "ISC".into()
}
fn one() -> f64 {
    1.0
}

impl Default for BillingSettings {
    fn default() -> Self {
        Self {
            currency: isc(),
            base: 1.0,
        }
    }
}

impl BillingSettings {
    /// Base as an integer number of micro-ISC per USD (exact integer billing math).
    pub fn base_micro(&self) -> i128 {
        (self.base.max(0.0) * 1_000_000.0).round() as i128
    }
}

impl Default for CacheSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            ttl_seconds: 3600,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Catalog {
    pub providers: HashMap<String, Arc<ProviderInfo>>,
    pub keys: HashMap<String, Vec<ProviderKey>>,
    pub models: HashMap<String, ModelInfo>,
    pub plans: HashMap<String, Plan>,
    pub guardrails: GuardrailSettings,
    pub cache: CacheSettings,
    pub billing: BillingSettings,
}

impl Catalog {
    pub fn models_sorted(&self) -> Vec<&ModelInfo> {
        let mut v: Vec<&ModelInfo> = self.models.values().collect();
        v.sort_by(|a, b| a.sort_order.cmp(&b.sort_order).then(a.id.cmp(&b.id)));
        v
    }
}

#[derive(sqlx::FromRow)]
struct ProviderRow {
    id: String,
    kind: String,
    name: String,
    base_url: String,
    enabled: bool,
    timeout_ms: i32,
    monthly_budget_credits: Option<i64>,
    config: Value,
}

#[derive(sqlx::FromRow)]
struct KeyRow {
    id: Uuid,
    provider_id: String,
    owner_user_id: Option<Uuid>,
    key_ciphertext: String,
    weight: i32,
}

#[derive(sqlx::FromRow)]
struct ModelRow {
    id: String,
    display_name: String,
    description: String,
    tier: String,
    strategy: String,
    context_window: i32,
    supports_vision: bool,
    supports_tools: bool,
    sort_order: i32,
}

#[derive(sqlx::FromRow)]
struct RouteRow {
    id: Uuid,
    model_id: String,
    provider_id: String,
    upstream_model: String,
    priority: i32,
    input_price: i64,
    output_price: i64,
    tags: Vec<String>,
    ratio_bp: i32,
}

pub async fn load(db: &PgPool, master: &[u8; 32]) -> anyhow::Result<Catalog> {
    let spend: HashMap<String, i64> = sqlx::query_as::<_, (String, i64)>(
        "SELECT provider_id, COALESCE(SUM(credits), 0)::BIGINT FROM request_logs \
         WHERE provider_id IS NOT NULL AND created_at >= date_trunc('month', now()) GROUP BY provider_id",
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .collect();

    let mut providers = HashMap::new();
    for r in sqlx::query_as::<_, ProviderRow>(
        "SELECT id, kind, name, base_url, enabled, timeout_ms, monthly_budget_credits, config FROM providers",
    )
    .fetch_all(db)
    .await?
    {
        let Some(kind) = ProviderKind::parse(&r.kind) else { continue };
        providers.insert(
            r.id.clone(),
            Arc::new(ProviderInfo {
                month_spend: *spend.get(&r.id).unwrap_or(&0),
                id: r.id,
                kind,
                name: r.name,
                base_url: r.base_url,
                enabled: r.enabled,
                timeout: Duration::from_millis(r.timeout_ms.max(1000) as u64),
                monthly_budget: r.monthly_budget_credits,
                config: r.config,
            }),
        );
    }

    let mut keys: HashMap<String, Vec<ProviderKey>> = HashMap::new();
    for r in sqlx::query_as::<_, KeyRow>(
        "SELECT id, provider_id, owner_user_id, key_ciphertext, weight FROM provider_keys WHERE enabled",
    )
    .fetch_all(db)
    .await?
    {
        let is_mock = providers.get(&r.provider_id).map(|p| p.kind == ProviderKind::Mock).unwrap_or(false);
        if r.key_ciphertext.starts_with("plain:") && !is_mock {
            tracing::warn!(key_id = %r.id, "refusing plaintext key for non-mock provider");
            continue;
        }
        match crypto::decrypt_secret(master, &r.key_ciphertext) {
            Ok(secret) => keys.entry(r.provider_id.clone()).or_default().push(ProviderKey {
                id: r.id,
                provider_id: r.provider_id,
                owner_user_id: r.owner_user_id,
                secret,
                weight: r.weight.max(1) as u32,
            }),
            Err(e) => tracing::error!(key_id = %r.id, error = %e, "cannot decrypt provider key"),
        }
    }

    let mut routes: HashMap<String, Vec<Route>> = HashMap::new();
    for r in sqlx::query_as::<_, RouteRow>(
        "SELECT id, model_id, provider_id, upstream_model, priority, input_price, output_price, tags, ratio_bp \
         FROM model_routes WHERE enabled ORDER BY priority, id",
    )
    .fetch_all(db)
    .await?
    {
        routes.entry(r.model_id.clone()).or_default().push(Route {
            id: r.id,
            provider_id: r.provider_id,
            upstream_model: r.upstream_model,
            priority: r.priority,
            input_price: r.input_price,
            output_price: r.output_price,
            tags: r.tags,
            ratio_bp: r.ratio_bp,
        });
    }

    let mut models = HashMap::new();
    for r in sqlx::query_as::<_, ModelRow>(
        "SELECT id, display_name, description, tier, strategy, context_window, supports_vision, supports_tools, sort_order \
         FROM models WHERE enabled",
    )
    .fetch_all(db)
    .await?
    {
        models.insert(
            r.id.clone(),
            ModelInfo {
                routes: routes.remove(&r.id).unwrap_or_default(),
                id: r.id,
                display_name: r.display_name,
                description: r.description,
                tier: r.tier,
                strategy: Strategy::parse(&r.strategy).unwrap_or(Strategy::Failover),
                context_window: r.context_window,
                supports_vision: r.supports_vision,
                supports_tools: r.supports_tools,
                sort_order: r.sort_order,
            },
        );
    }

    let plans = sqlx::query_as::<_, Plan>("SELECT * FROM plans ORDER BY sort_order")
        .fetch_all(db)
        .await?
        .into_iter()
        .map(|p| (p.id.clone(), p))
        .collect();

    let settings: HashMap<String, Value> =
        sqlx::query_as::<_, (String, Value)>("SELECT key, value FROM settings")
            .fetch_all(db)
            .await?
            .into_iter()
            .collect();
    let guardrails = settings
        .get("guardrails")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    let cache = settings
        .get("cache")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let billing = settings
        .get("billing")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    Ok(Catalog {
        providers,
        keys,
        models,
        plans,
        guardrails,
        cache,
        billing,
    })
}
