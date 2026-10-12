//! Admin Portal API (`/admin/*`): providers & key vault, model mapping, users, plans,
//! monitoring and settings. All endpoints require a session with role=admin.

use axum::extract::{Path, Query, State};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use super::util::{
    as_json_array, as_json_object, clamp_limit, dynamic_insert, dynamic_update, obj, Field,
};
use crate::auth::AdminUser;
use crate::billing;
use crate::crypto;
use crate::error::{ApiError, ApiResult};
use crate::providers::ProviderKind;
use crate::state::AppState;

async fn reload(st: &AppState) -> ApiResult<()> {
    st.reload_catalog().await.map_err(ApiError::from)
}

fn valid_slug(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

// ---- monitoring ------------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct Hours {
    hours: Option<i32>,
}

pub async fn overview(
    State(st): State<AppState>,
    _a: AdminUser,
    Query(q): Query<Hours>,
) -> ApiResult<Json<Value>> {
    let hours = q.hours.unwrap_or(24).clamp(1, 24 * 90);
    let totals: Value = sqlx::query_scalar(&as_json_object(
        "SELECT count(*) AS requests, COALESCE(sum(prompt_tokens), 0) AS prompt_tokens, COALESCE(sum(completion_tokens), 0) AS completion_tokens, \
                COALESCE(sum(credits), 0) AS credits, COALESCE(round(100.0 * avg(CASE WHEN status_code < 400 THEN 1 ELSE 0 END), 2), 100) AS success_rate, \
                COALESCE(round(avg(latency_ms)), 0) AS avg_latency_ms, COALESCE(round(avg(ttft_ms)), 0) AS avg_ttft_ms, \
                count(*) FILTER (WHERE cached) AS cache_hits, count(*) FILTER (WHERE attempts > 1) AS failovers, \
                count(DISTINCT user_id) AS active_users \
         FROM request_logs WHERE created_at >= now() - make_interval(hours => $1)",
    ))
    .bind(hours)
    .fetch_one(&st.db)
    .await?;
    let by_provider: Value = sqlx::query_scalar(&as_json_array(
        "SELECT provider_id, count(*) AS requests, sum(prompt_tokens) AS prompt_tokens, sum(completion_tokens) AS completion_tokens, \
                sum(credits) AS credits, round(100.0 * avg(CASE WHEN status_code < 400 THEN 1 ELSE 0 END), 2) AS success_rate, \
                round(avg(latency_ms)) AS avg_latency_ms, round(avg(ttft_ms)) AS avg_ttft_ms, \
                round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)) AS p95_latency_ms \
         FROM request_logs WHERE created_at >= now() - make_interval(hours => $1) AND provider_id IS NOT NULL \
         GROUP BY provider_id ORDER BY count(*) DESC",
    ))
    .bind(hours)
    .fetch_one(&st.db)
    .await?;
    let by_model: Value = sqlx::query_scalar(&as_json_array(
        "SELECT model, count(*) AS requests, sum(credits) AS credits, round(avg(latency_ms)) AS avg_latency_ms \
         FROM request_logs WHERE created_at >= now() - make_interval(hours => $1) GROUP BY model ORDER BY count(*) DESC LIMIT 20",
    ))
    .bind(hours)
    .fetch_one(&st.db)
    .await?;
    // Hourly buckets up to 2 days, daily beyond; empty buckets are filled with zeros.
    let unit = if hours <= 48 { "hour" } else { "day" };
    let timeline: Value = sqlx::query_scalar(&as_json_array(&format!(
        "SELECT to_char(b.bucket, 'YYYY-MM-DD\"T\"HH24:00') AS bucket, count(l.id) AS requests, \
                count(l.id) FILTER (WHERE l.status_code >= 400) AS errors, COALESCE(sum(l.credits), 0) AS credits \
         FROM generate_series(date_trunc('{unit}', now() - make_interval(hours => $1)), date_trunc('{unit}', now()), interval '1 {unit}') AS b(bucket) \
         LEFT JOIN request_logs l ON date_trunc('{unit}', l.created_at) = b.bucket AND l.created_at >= now() - make_interval(hours => $1) \
         GROUP BY b.bucket ORDER BY b.bucket"
    )))
    .bind(hours)
    .fetch_one(&st.db)
    .await?;
    let users: Value = sqlx::query_scalar(&as_json_object(
        "SELECT count(*) AS total, count(*) FILTER (WHERE plan_id <> 'free') AS paying, \
                count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS new_7d FROM users",
    ))
    .fetch_one(&st.db)
    .await?;
    Ok(Json(
        json!({"hours": hours, "totals": totals, "by_provider": by_provider, "by_model": by_model, "timeline": timeline, "users": users}),
    ))
}

pub async fn health(State(st): State<AppState>, _a: AdminUser) -> Json<Value> {
    let c = st.catalog.load();
    let mut budgets: Vec<Value> = c
        .providers
        .values()
        .map(|p| {
            json!({
                "provider_id": p.id, "enabled": p.enabled, "month_spend": p.month_spend, "monthly_budget": p.monthly_budget,
                "budget_exceeded": p.budget_exceeded(),
                "keys": c.keys.get(&p.id).map(|k| k.len()).unwrap_or(0),
            })
        })
        .collect();
    budgets.sort_by(|a, b| a["provider_id"].as_str().cmp(&b["provider_id"].as_str()));
    Json(json!({
        "targets": st.health.snapshot(),
        "key_cooldowns": st.keypool.snapshot(),
        "providers": budgets,
        "kv_backend": st.kv.backend(),
    }))
}

#[derive(Deserialize)]
pub struct ResetHealth {
    target: String,
}

pub async fn reset_health(
    State(st): State<AppState>,
    _a: AdminUser,
    Json(b): Json<ResetHealth>,
) -> Json<Value> {
    st.health.reset(&b.target);
    Json(json!({"ok": true}))
}

pub async fn reload_catalog(State(st): State<AppState>, _a: AdminUser) -> ApiResult<Json<Value>> {
    reload(&st).await?;
    Ok(Json(json!({"ok": true})))
}

// ---- providers & key vault -------------------------------------------------------------------

const PROVIDER_FIELDS: [(&str, Field); 7] = [
    ("id", Field::Text),
    ("kind", Field::Text),
    ("name", Field::Text),
    ("base_url", Field::Text),
    ("enabled", Field::Bool),
    ("timeout_ms", Field::Int),
    ("monthly_budget_credits", Field::BigInt),
];

pub async fn list_providers(State(st): State<AppState>, _a: AdminUser) -> ApiResult<Json<Value>> {
    let v: Value = sqlx::query_scalar(&as_json_array(
        "SELECT p.*, (SELECT count(*) FROM provider_keys k WHERE k.provider_id = p.id AND k.owner_user_id IS NULL) AS shared_keys, \
                (SELECT count(*) FROM provider_keys k WHERE k.provider_id = p.id AND k.owner_user_id IS NOT NULL) AS byok_keys, \
                (SELECT COALESCE(sum(credits), 0) FROM request_logs l WHERE l.provider_id = p.id AND l.created_at >= date_trunc('month', now())) AS month_spend \
         FROM providers p ORDER BY p.id",
    ))
    .fetch_one(&st.db)
    .await?;
    Ok(Json(json!({"data": v})))
}

pub async fn create_provider(
    State(st): State<AppState>,
    _a: AdminUser,
    Json(b): Json<Value>,
) -> ApiResult<Json<Value>> {
    let mut body = obj(b)?;
    let id = body
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if !valid_slug(&id) {
        return Err(ApiError::bad_request(
            "id must be a slug (letters, digits, - _ .)",
        ));
    }
    let kind = body.get("kind").and_then(Value::as_str).unwrap_or_default();
    if ProviderKind::parse(kind).is_none() {
        return Err(ApiError::bad_request(
            "kind must be one of openai, anthropic, gemini, mock",
        ));
    }
    if !body.contains_key("name") {
        body.insert("name".into(), json!(id));
    }
    let mut fields = PROVIDER_FIELDS.to_vec();
    fields.push(("config", Field::Json));
    dynamic_insert(
        &st.db,
        "providers",
        &body,
        &fields,
        &["id", "kind", "base_url"],
    )
    .await?;
    reload(&st).await?;
    Ok(Json(json!({"id": id})))
}

pub async fn update_provider(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(id): Path<String>,
    Json(b): Json<Value>,
) -> ApiResult<Json<Value>> {
    let body = obj(b)?;
    if let Some(k) = body.get("kind").and_then(Value::as_str) {
        if ProviderKind::parse(k).is_none() {
            return Err(ApiError::bad_request("invalid kind"));
        }
    }
    let mut fields: Vec<(&str, Field)> = PROVIDER_FIELDS[1..].to_vec();
    fields.push(("config", Field::Json));
    dynamic_update(&st.db, "providers", "id", id, &body, &fields).await?;
    reload(&st).await?;
    Ok(Json(json!({"ok": true})))
}

pub async fn delete_provider(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let r = sqlx::query("DELETE FROM providers WHERE id = $1")
        .bind(&id)
        .execute(&st.db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(ApiError::not_found("provider not found"));
    }
    reload(&st).await?;
    Ok(Json(json!({"ok": true})))
}

pub async fn list_provider_keys(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let v: Value = sqlx::query_scalar(&as_json_array(
        "SELECT k.id, k.provider_id, k.owner_user_id, COALESCE(u.email, '@' || u.cafeca_handle, u.cafeca_account) AS owner_email, k.label, k.key_last4, k.enabled, k.weight, k.created_at \
         FROM provider_keys k LEFT JOIN users u ON u.id = k.owner_user_id WHERE k.provider_id = $1 ORDER BY k.created_at",
    ))
    .bind(&id)
    .fetch_one(&st.db)
    .await?;
    let cooldowns = st.keypool.snapshot();
    Ok(Json(json!({"data": v, "cooldowns": cooldowns})))
}

#[derive(Deserialize)]
pub struct NewKey {
    key: String,
    #[serde(default)]
    label: String,
    weight: Option<i32>,
}

pub async fn add_provider_key(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(id): Path<String>,
    Json(b): Json<NewKey>,
) -> ApiResult<Json<Value>> {
    let secret = b.key.trim();
    if secret.is_empty() {
        return Err(ApiError::bad_request("key is required"));
    }
    let key_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO provider_keys (id, provider_id, label, key_ciphertext, key_last4, weight) VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(key_id)
    .bind(&id)
    .bind(&b.label)
    .bind(crypto::encrypt_secret(&st.cfg.master_key, secret))
    .bind(crypto::last4(secret))
    .bind(b.weight.unwrap_or(1).clamp(1, 100))
    .execute(&st.db)
    .await?;
    reload(&st).await?;
    Ok(Json(json!({"id": key_id})))
}

pub async fn update_provider_key(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(id): Path<Uuid>,
    Json(b): Json<Value>,
) -> ApiResult<Json<Value>> {
    let mut body = obj(b)?;
    // Rotating the secret itself: re-encrypt.
    if let Some(secret) = body
        .remove("key")
        .and_then(|v| v.as_str().map(|s| s.trim().to_string()))
    {
        if !secret.is_empty() {
            sqlx::query(
                "UPDATE provider_keys SET key_ciphertext = $1, key_last4 = $2 WHERE id = $3",
            )
            .bind(crypto::encrypt_secret(&st.cfg.master_key, &secret))
            .bind(crypto::last4(&secret))
            .bind(id)
            .execute(&st.db)
            .await?;
            st.keypool.clear(&id);
        }
    }
    if !body.is_empty() {
        dynamic_update(
            &st.db,
            "provider_keys",
            "id",
            id,
            &body,
            &[
                ("label", Field::Text),
                ("enabled", Field::Bool),
                ("weight", Field::Int),
            ],
        )
        .await?;
    }
    if body.get("enabled").and_then(Value::as_bool) == Some(true) {
        st.keypool.clear(&id);
    }
    reload(&st).await?;
    Ok(Json(json!({"ok": true})))
}

async fn run_probe(st: &AppState, provider_id: &str, secret: &str) -> ApiResult<Value> {
    let row: Option<(String, String, i32)> =
        sqlx::query_as("SELECT kind, base_url, timeout_ms FROM providers WHERE id = $1")
            .bind(provider_id)
            .fetch_optional(&st.db)
            .await?;
    let (kind, base_url, timeout_ms) =
        row.ok_or_else(|| ApiError::not_found("provider not found"))?;
    let kind =
        ProviderKind::parse(&kind).ok_or_else(|| ApiError::bad_request("unknown provider kind"))?;
    let t0 = std::time::Instant::now();
    let timeout = std::time::Duration::from_millis(timeout_ms.clamp(1000, 20_000) as u64);
    Ok(
        match crate::providers::probe(&st.http, kind, &base_url, secret, timeout).await {
            Ok(models) => json!({
                "ok": true,
                "latency_ms": t0.elapsed().as_millis() as u64,
                "model_count": models.len(),
                "models": models.into_iter().take(100).collect::<Vec<_>>(),
            }),
            Err(e) => json!({
                "ok": false,
                "latency_ms": t0.elapsed().as_millis() as u64,
                "status": e.status,
                "message": e.message,
            }),
        },
    )
}

#[derive(Deserialize)]
pub struct TestKeyBody {
    key: String,
}

/// Test a key before saving it (paste → test → host).
pub async fn test_new_provider_key(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(id): Path<String>,
    Json(b): Json<TestKeyBody>,
) -> ApiResult<Json<Value>> {
    if b.key.trim().is_empty() {
        return Err(ApiError::bad_request("key is required"));
    }
    Ok(Json(run_probe(&st, &id, b.key.trim()).await?))
}

/// Test a stored key (decrypts it server-side; the secret never leaves the gateway).
pub async fn test_provider_key(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT provider_id, key_ciphertext FROM provider_keys WHERE id = $1")
            .bind(id)
            .fetch_optional(&st.db)
            .await?;
    let (provider_id, ct) = row.ok_or_else(|| ApiError::not_found("key not found"))?;
    let secret = crypto::decrypt_secret(&st.cfg.master_key, &ct)?;
    let result = run_probe(&st, &provider_id, &secret).await?;
    if result["ok"].as_bool() == Some(true) {
        st.keypool.clear(&id);
    }
    Ok(Json(result))
}

pub async fn delete_provider_key(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let r = sqlx::query("DELETE FROM provider_keys WHERE id = $1")
        .bind(id)
        .execute(&st.db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(ApiError::not_found("key not found"));
    }
    reload(&st).await?;
    Ok(Json(json!({"ok": true})))
}

// ---- models & routes -------------------------------------------------------------------------

const MODEL_FIELDS: [(&str, Field); 10] = [
    ("id", Field::Text),
    ("display_name", Field::Text),
    ("description", Field::Text),
    ("tier", Field::Text),
    ("strategy", Field::Text),
    ("context_window", Field::Int),
    ("supports_vision", Field::Bool),
    ("supports_tools", Field::Bool),
    ("enabled", Field::Bool),
    ("sort_order", Field::Int),
];

const ROUTE_FIELDS: [(&str, Field); 8] = [
    ("provider_id", Field::Text),
    ("upstream_model", Field::Text),
    ("priority", Field::Int),
    ("input_price", Field::BigInt),
    ("output_price", Field::BigInt),
    ("tags", Field::TextArray),
    ("enabled", Field::Bool),
    ("ratio_bp", Field::Int),
];

pub async fn list_models(State(st): State<AppState>, _a: AdminUser) -> ApiResult<Json<Value>> {
    let v: Value = sqlx::query_scalar(&as_json_array(
        "SELECT m.*, COALESCE((SELECT json_agg(r ORDER BY r.priority) FROM model_routes r WHERE r.model_id = m.id), '[]'::json) AS routes \
         FROM models m ORDER BY m.sort_order, m.id",
    ))
    .fetch_one(&st.db)
    .await?;
    Ok(Json(json!({"data": v})))
}

pub async fn create_model(
    State(st): State<AppState>,
    _a: AdminUser,
    Json(b): Json<Value>,
) -> ApiResult<Json<Value>> {
    let mut body = obj(b)?;
    let id = body
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if !valid_slug(&id) {
        return Err(ApiError::bad_request("id must be a slug"));
    }
    if !body.contains_key("display_name") {
        body.insert("display_name".into(), json!(id));
    }
    dynamic_insert(&st.db, "models", &body, &MODEL_FIELDS, &["id"]).await?;
    reload(&st).await?;
    Ok(Json(json!({"id": id})))
}

pub async fn update_model(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(id): Path<String>,
    Json(b): Json<Value>,
) -> ApiResult<Json<Value>> {
    dynamic_update(&st.db, "models", "id", id, &obj(b)?, &MODEL_FIELDS[1..]).await?;
    reload(&st).await?;
    Ok(Json(json!({"ok": true})))
}

pub async fn delete_model(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let r = sqlx::query("DELETE FROM models WHERE id = $1")
        .bind(&id)
        .execute(&st.db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(ApiError::not_found("model not found"));
    }
    reload(&st).await?;
    Ok(Json(json!({"ok": true})))
}

pub async fn create_route(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(model_id): Path<String>,
    Json(b): Json<Value>,
) -> ApiResult<Json<Value>> {
    let mut body = obj(b)?;
    body.insert("model_id".into(), json!(model_id));
    let mut fields: Vec<(&str, Field)> = vec![("model_id", Field::Text)];
    fields.extend_from_slice(&ROUTE_FIELDS);
    dynamic_insert(
        &st.db,
        "model_routes",
        &body,
        &fields,
        &["provider_id", "upstream_model"],
    )
    .await?;
    reload(&st).await?;
    Ok(Json(json!({"ok": true})))
}

pub async fn update_route(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(id): Path<Uuid>,
    Json(b): Json<Value>,
) -> ApiResult<Json<Value>> {
    dynamic_update(&st.db, "model_routes", "id", id, &obj(b)?, &ROUTE_FIELDS).await?;
    reload(&st).await?;
    Ok(Json(json!({"ok": true})))
}

pub async fn delete_route(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let r = sqlx::query("DELETE FROM model_routes WHERE id = $1")
        .bind(id)
        .execute(&st.db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(ApiError::not_found("route not found"));
    }
    reload(&st).await?;
    Ok(Json(json!({"ok": true})))
}

// ---- users & plans ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct UserQuery {
    q: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

pub async fn list_users(
    State(st): State<AppState>,
    _a: AdminUser,
    Query(q): Query<UserQuery>,
) -> ApiResult<Json<Value>> {
    let v: Value = sqlx::query_scalar(&as_json_array(
        "SELECT u.id, u.email, u.name, u.cafeca_account, u.cafeca_handle, u.role, u.status, u.plan_id, u.plan_renews_at, u.credit_balance, u.zero_data_retention, u.created_at, \
                (SELECT count(*) FROM api_keys k WHERE k.user_id = u.id AND k.status = 'active') AS active_keys, \
                (SELECT COALESCE(sum(credits), 0) FROM request_logs l WHERE l.user_id = u.id AND l.created_at >= now() - interval '30 days') AS credits_30d \
         FROM users u WHERE ($1::TEXT IS NULL OR u.email ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%' OR u.cafeca_account ILIKE '%' || $1 || '%' OR u.cafeca_handle ILIKE '%' || $1 || '%') \
         ORDER BY u.created_at DESC LIMIT $2 OFFSET $3",
    ))
    .bind(q.q.filter(|s| !s.is_empty()))
    .bind(clamp_limit(q.limit))
    .bind(q.offset.unwrap_or(0).max(0))
    .fetch_one(&st.db)
    .await?;
    Ok(Json(json!({"data": v})))
}

pub async fn update_user(
    State(st): State<AppState>,
    AdminUser(admin): AdminUser,
    Path(id): Path<Uuid>,
    Json(b): Json<Value>,
) -> ApiResult<Json<Value>> {
    let body = obj(b)?;
    if id == admin.id
        && (body.get("role").and_then(Value::as_str) == Some("user")
            || body.get("status").and_then(Value::as_str) == Some("suspended"))
    {
        return Err(ApiError::bad_request(
            "you cannot demote or suspend yourself",
        ));
    }
    let plan_changed = body
        .get("plan_id")
        .and_then(Value::as_str)
        .map(String::from);
    dynamic_update(
        &st.db,
        "users",
        "id",
        id,
        &body,
        &[
            ("name", Field::Text),
            ("role", Field::Text),
            ("status", Field::Text),
            ("plan_id", Field::Text),
            ("zero_data_retention", Field::Bool),
        ],
    )
    .await?;
    if let Some(plan_id) = plan_changed {
        sqlx::query("UPDATE users SET plan_renews_at = now() + interval '1 month' WHERE id = $1")
            .bind(id)
            .execute(&st.db)
            .await?;
        let credits: Option<i64> =
            sqlx::query_scalar("SELECT monthly_credits FROM plans WHERE id = $1")
                .bind(&plan_id)
                .fetch_optional(&st.db)
                .await?;
        if body
            .get("grant_plan_credits")
            .and_then(Value::as_bool)
            .unwrap_or(true)
        {
            if let Some(c) = credits.filter(|c| *c > 0) {
                billing::grant(
                    &st.db,
                    id,
                    c,
                    &format!("plan_start:{plan_id}"),
                    Some(&admin.label()),
                )
                .await?;
            }
        }
    }
    Ok(Json(json!({"ok": true})))
}

#[derive(Deserialize)]
pub struct CreditAdjust {
    delta: i64,
    #[serde(default)]
    reason: String,
}

pub async fn adjust_credits(
    State(st): State<AppState>,
    AdminUser(admin): AdminUser,
    Path(id): Path<Uuid>,
    Json(b): Json<CreditAdjust>,
) -> ApiResult<Json<Value>> {
    if b.delta == 0 {
        return Err(ApiError::bad_request("delta must not be zero"));
    }
    let reason = if b.reason.trim().is_empty() {
        "admin_adjustment".to_string()
    } else {
        format!("admin: {}", b.reason.trim())
    };
    let balance = billing::grant(&st.db, id, b.delta, &reason, Some(&admin.label())).await?;
    Ok(Json(json!({"credit_balance": balance})))
}

pub async fn list_plans(State(st): State<AppState>, _a: AdminUser) -> ApiResult<Json<Value>> {
    let v: Value = sqlx::query_scalar(&as_json_array(
        "SELECT p.*, (SELECT count(*) FROM users u WHERE u.plan_id = p.id) AS users FROM plans p ORDER BY sort_order",
    ))
    .fetch_one(&st.db)
    .await?;
    Ok(Json(json!({"data": v})))
}

pub async fn update_plan(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(id): Path<String>,
    Json(b): Json<Value>,
) -> ApiResult<Json<Value>> {
    dynamic_update(
        &st.db,
        "plans",
        "id",
        id,
        &obj(b)?,
        &[
            ("name", Field::Text),
            ("monthly_fee", Field::BigInt),
            ("monthly_credits", Field::BigInt),
            ("allow_api", Field::Bool),
            ("allowed_tiers", Field::TextArray),
            ("routing_priority", Field::Int),
            ("default_rpm", Field::Int),
            ("default_tpm", Field::Int),
            ("byok", Field::Bool),
            ("features", Field::Json),
        ],
    )
    .await?;
    reload(&st).await?;
    Ok(Json(json!({"ok": true})))
}

// ---- logs & settings -------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct LogQuery {
    limit: Option<i64>,
    offset: Option<i64>,
    user_id: Option<Uuid>,
    provider_id: Option<String>,
    model: Option<String>,
    errors_only: Option<bool>,
}

pub async fn logs(
    State(st): State<AppState>,
    _a: AdminUser,
    Query(q): Query<LogQuery>,
) -> ApiResult<Json<Value>> {
    let v: Value = sqlx::query_scalar(&as_json_array(
        "SELECT l.id, l.user_id, COALESCE(u.email, '@' || u.cafeca_handle, u.cafeca_account) AS email, l.api_key_id, l.model, l.provider_id, l.upstream_model, l.strategy, l.intent, l.status_code, l.error, \
                l.prompt_tokens, l.completion_tokens, l.credits, l.latency_ms, l.ttft_ms, l.attempts, l.cached, l.stream, l.created_at, \
                (l.request_body IS NOT NULL) AS has_body \
         FROM request_logs l LEFT JOIN users u ON u.id = l.user_id \
         WHERE ($3::UUID IS NULL OR l.user_id = $3) AND ($4::TEXT IS NULL OR l.provider_id = $4) AND ($5::TEXT IS NULL OR l.model = $5) \
           AND (NOT $6 OR l.status_code >= 400) \
         ORDER BY l.created_at DESC LIMIT $1 OFFSET $2",
    ))
    .bind(clamp_limit(q.limit))
    .bind(q.offset.unwrap_or(0).max(0))
    .bind(q.user_id)
    .bind(q.provider_id.filter(|s| !s.is_empty()))
    .bind(q.model.filter(|s| !s.is_empty()))
    .bind(q.errors_only.unwrap_or(false))
    .fetch_one(&st.db)
    .await?;
    Ok(Json(json!({"data": v})))
}

pub async fn log_detail(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let v: Option<Value> =
        sqlx::query_scalar(&as_json_object("SELECT * FROM request_logs WHERE id = $1"))
            .bind(id)
            .fetch_optional(&st.db)
            .await?
            .flatten();
    v.map(Json)
        .ok_or_else(|| ApiError::not_found("log not found"))
}

pub async fn get_settings(State(st): State<AppState>, _a: AdminUser) -> ApiResult<Json<Value>> {
    let rows: Vec<(String, Value)> = sqlx::query_as("SELECT key, value FROM settings")
        .fetch_all(&st.db)
        .await?;
    let map: serde_json::Map<String, Value> = rows.into_iter().collect();
    Ok(Json(Value::Object(map)))
}

pub async fn put_setting(
    State(st): State<AppState>,
    _a: AdminUser,
    Path(key): Path<String>,
    Json(b): Json<Value>,
) -> ApiResult<Json<Value>> {
    match key.as_str() {
        "guardrails" => {
            let g: crate::catalog::GuardrailSettings = serde_json::from_value(b.clone())
                .map_err(|e| ApiError::bad_request(format!("invalid guardrails: {e}")))?;
            if !["off", "flag", "block"].contains(&g.mode.as_str()) {
                return Err(ApiError::bad_request("mode must be off, flag or block"));
            }
        }
        "cache" => {
            serde_json::from_value::<crate::catalog::CacheSettings>(b.clone())
                .map_err(|e| ApiError::bad_request(format!("invalid cache settings: {e}")))?;
        }
        "billing" => {
            let bs: crate::catalog::BillingSettings = serde_json::from_value(b.clone())
                .map_err(|e| ApiError::bad_request(format!("invalid billing settings: {e}")))?;
            if !(bs.base.is_finite() && bs.base > 0.0 && bs.base <= 1_000_000.0) {
                return Err(ApiError::bad_request(
                    "base must be a positive number (≤ 1,000,000)",
                ));
            }
            let cur = bs.currency.trim();
            if cur.is_empty() || cur.chars().count() > 12 {
                return Err(ApiError::bad_request("currency must be 1–12 characters"));
            }
        }
        _ => return Err(ApiError::not_found("unknown setting")),
    }
    sqlx::query("INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()")
        .bind(&key)
        .bind(&b)
        .execute(&st.db)
        .await?;
    reload(&st).await?;
    Ok(Json(json!({"ok": true})))
}
