//! Web session auth and the user-facing portal API (`/auth/*`, `/api/*`).

use std::time::Duration;

use axum::extract::{Path, Query, State};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use super::util::{as_json_array, as_json_object, clamp_limit, dynamic_update, obj, Field};
use crate::auth::{SessionUser, UserRow};
use crate::billing;
use crate::catalog::Catalog;
use crate::crypto;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct RegisterBody {
    pub email: String,
    pub password: String,
    #[serde(default)]
    pub name: String,
}

#[derive(Deserialize)]
pub struct LoginBody {
    pub email: String,
    pub password: String,
}

fn valid_email(e: &str) -> bool {
    let e = e.trim();
    e.len() <= 254
        && e.contains('@')
        && e.split('@')
            .nth(1)
            .map(|d| d.contains('.'))
            .unwrap_or(false)
        && !e.contains(' ')
}

pub(crate) fn user_json(u: &UserRow, catalog: &Catalog) -> Value {
    json!({
        "id": u.id, "email": u.email, "name": u.name, "role": u.role, "status": u.status,
        "plan": catalog.plans.get(&u.plan_id), "credit_balance": u.credit_balance,
        "zero_data_retention": u.zero_data_retention,
        "cafeca_account": u.cafeca_account, "cafeca_handle": u.cafeca_handle,
        "has_password": u.has_password,
    })
}

pub async fn register(
    State(st): State<AppState>,
    Json(b): Json<RegisterBody>,
) -> ApiResult<Json<Value>> {
    let email = b.email.trim().to_lowercase();
    if !valid_email(&email) {
        return Err(ApiError::bad_request("invalid email address"));
    }
    if b.password.len() < 8 {
        return Err(ApiError::bad_request(
            "password must be at least 8 characters",
        ));
    }
    let id = Uuid::new_v4();
    let hash = crypto::hash_password(&b.password)?;
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, name, plan_id, plan_renews_at) VALUES ($1, $2, $3, $4, 'free', now() + interval '1 month')",
    )
    .bind(id)
    .bind(&email)
    .bind(&hash)
    .bind(b.name.trim())
    .execute(&st.db)
    .await
    .map_err(|e| match ApiError::from(e) {
        err if err.code == "conflict" => ApiError::conflict("an account with this email already exists"),
        err => err,
    })?;
    if st.cfg.signup_bonus_credits > 0 {
        billing::grant(
            &st.db,
            id,
            st.cfg.signup_bonus_credits,
            "signup_bonus",
            None,
        )
        .await?;
    }
    let user = crate::auth::load_user(&st, id).await?;
    let token = crypto::issue_jwt(&st.cfg.jwt_secret, id, &user.role)?;
    Ok(Json(
        json!({"token": token, "user": user_json(&user, &st.catalog.load())}),
    ))
}

pub async fn login(State(st): State<AppState>, Json(b): Json<LoginBody>) -> ApiResult<Json<Value>> {
    let email = b.email.trim().to_lowercase();
    let bucket = chrono::Utc::now().timestamp() / 900;
    let tries = st
        .kv
        .incr(
            &format!("login:{email}:{bucket}"),
            1,
            Duration::from_secs(960),
        )
        .await;
    if tries > 10 {
        return Err(ApiError::rate_limited(
            "too many login attempts; try again in 15 minutes",
        ));
    }
    let row: Option<(Uuid, Option<String>, String, String)> =
        sqlx::query_as("SELECT id, password_hash, role, status FROM users WHERE email = $1")
            .bind(&email)
            .fetch_optional(&st.db)
            .await?;
    let Some((id, hash, role, status)) = row else {
        return Err(ApiError::unauthorized("invalid email or password"));
    };
    let Some(hash) = hash else {
        return Err(ApiError::unauthorized("this account signs in with CAFECA"));
    };
    if !crypto::verify_password(&b.password, &hash) {
        return Err(ApiError::unauthorized("invalid email or password"));
    }
    if status != "active" {
        return Err(ApiError::forbidden("account suspended"));
    }
    sqlx::query("UPDATE users SET last_login_at = now() WHERE id = $1")
        .bind(id)
        .execute(&st.db)
        .await?;
    let user = crate::auth::load_user(&st, id).await?;
    let token = crypto::issue_jwt(&st.cfg.jwt_secret, id, &role)?;
    Ok(Json(
        json!({"token": token, "user": user_json(&user, &st.catalog.load())}),
    ))
}

pub async fn me(State(st): State<AppState>, SessionUser(u): SessionUser) -> ApiResult<Json<Value>> {
    Ok(Json(user_json(&u, &st.catalog.load())))
}

#[derive(Deserialize)]
pub struct UpdateMe {
    name: Option<String>,
    zero_data_retention: Option<bool>,
    current_password: Option<String>,
    new_password: Option<String>,
}

pub async fn update_me(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
    Json(b): Json<UpdateMe>,
) -> ApiResult<Json<Value>> {
    if let Some(new) = &b.new_password {
        if new.len() < 8 {
            return Err(ApiError::bad_request(
                "password must be at least 8 characters",
            ));
        }
        let hash: Option<String> =
            sqlx::query_scalar("SELECT password_hash FROM users WHERE id = $1")
                .bind(u.id)
                .fetch_one(&st.db)
                .await?;
        let Some(hash) = hash else {
            return Err(ApiError::bad_request(
                "this account signs in with CAFECA and has no password",
            ));
        };
        if !crypto::verify_password(b.current_password.as_deref().unwrap_or(""), &hash) {
            return Err(ApiError::forbidden("current password is incorrect"));
        }
        sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
            .bind(crypto::hash_password(new)?)
            .bind(u.id)
            .execute(&st.db)
            .await?;
    }
    sqlx::query("UPDATE users SET name = COALESCE($1, name), zero_data_retention = COALESCE($2, zero_data_retention) WHERE id = $3")
        .bind(b.name.as_deref().map(str::trim))
        .bind(b.zero_data_retention)
        .bind(u.id)
        .execute(&st.db)
        .await?;
    let user = crate::auth::load_user(&st, u.id).await?;
    Ok(Json(user_json(&user, &st.catalog.load())))
}

pub async fn plans(State(st): State<AppState>) -> Json<Value> {
    let c = st.catalog.load();
    let mut plans: Vec<_> = c.plans.values().cloned().collect();
    plans.sort_by_key(|p| p.sort_order);
    Json(json!({"data": plans}))
}

#[derive(Deserialize)]
pub struct ChangePlan {
    plan_id: String,
}

/// Self-service plan change. Disabled unless AICH_SELF_SERVICE_PLANS=true (demo / before a
/// payment provider is wired in — see docs/roadmap.md).
pub async fn change_plan(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
    Json(b): Json<ChangePlan>,
) -> ApiResult<Json<Value>> {
    let catalog = st.catalog.load();
    let plan = catalog
        .plans
        .get(&b.plan_id)
        .ok_or_else(|| ApiError::not_found("unknown plan"))?;
    if plan.id == u.plan_id {
        return Err(ApiError::bad_request("you are already on this plan"));
    }
    let current_price = catalog
        .plans
        .get(&u.plan_id)
        .map(|p| p.monthly_price_cents)
        .unwrap_or(0);
    let upgrade = plan.monthly_price_cents > current_price;
    if plan.id == "enterprise" {
        return Err(ApiError::forbidden(
            "Enterprise plans are provisioned by our sales team.",
        ));
    }
    if plan.monthly_price_cents > 0 && !st.cfg.self_service_plans {
        return Err(ApiError::new(
            axum::http::StatusCode::NOT_IMPLEMENTED,
            "invalid_request_error",
            "payments_not_configured",
            "Online checkout is not enabled yet. Please contact sales to upgrade.",
        ));
    }
    sqlx::query(
        "UPDATE users SET plan_id = $1, plan_renews_at = now() + interval '1 month' WHERE id = $2",
    )
    .bind(&plan.id)
    .bind(u.id)
    .execute(&st.db)
    .await?;
    // Credits are granted immediately only on upgrades; downgrades receive them at renewal.
    if upgrade && plan.monthly_credits > 0 {
        billing::grant(
            &st.db,
            u.id,
            plan.monthly_credits,
            &format!("plan_start:{}", plan.id),
            None,
        )
        .await?;
    }
    let user = crate::auth::load_user(&st, u.id).await?;
    Ok(Json(user_json(&user, &catalog)))
}

pub async fn models(State(st): State<AppState>, SessionUser(u): SessionUser) -> Json<Value> {
    let c = st.catalog.load();
    let tiers = c
        .plans
        .get(&u.plan_id)
        .map(|p| p.allowed_tiers.clone())
        .unwrap_or_default();
    let data: Vec<Value> = c
        .models_sorted()
        .into_iter()
        .map(|m| {
            let (min_in, min_out) = m
                .routes
                .iter()
                .map(|r| (r.input_price, r.output_price))
                .min_by_key(|(i, o)| i + o)
                .unwrap_or((0, 0));
            json!({
                "id": m.id, "name": m.display_name, "description": m.description, "tier": m.tier,
                "strategy": m.strategy.as_str(), "context_window": m.context_window,
                "supports_vision": m.supports_vision, "supports_tools": m.supports_tools,
                "available": tiers.contains(&m.tier),
                "credits_per_1k_input": min_in as f64 / 1000.0,
                "credits_per_1k_output": min_out as f64 / 1000.0,
            })
        })
        .collect();
    Json(json!({"data": data}))
}

// ---- API keys ---------------------------------------------------------------------------------

pub async fn list_keys(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
) -> ApiResult<Json<Value>> {
    let v: Value = sqlx::query_scalar(&as_json_array(
        "SELECT id, name, prefix, credit_limit, credits_used, allowed_models, rpm_limit, tpm_limit, status, expires_at, last_used_at, created_at \
         FROM api_keys WHERE user_id = $1 AND status <> 'revoked' ORDER BY created_at DESC",
    ))
    .bind(u.id)
    .fetch_one(&st.db)
    .await?;
    Ok(Json(json!({"data": v})))
}

#[derive(Deserialize)]
pub struct CreateKey {
    name: String,
    credit_limit: Option<i64>,
    allowed_models: Option<Vec<String>>,
    rpm_limit: Option<i32>,
    tpm_limit: Option<i32>,
    expires_in_days: Option<i64>,
}

pub async fn create_key(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
    Json(b): Json<CreateKey>,
) -> ApiResult<Json<Value>> {
    let catalog = st.catalog.load();
    let plan = catalog
        .plans
        .get(&u.plan_id)
        .ok_or_else(|| ApiError::internal("plan missing"))?;
    if !plan.allow_api {
        return Err(ApiError::forbidden(format!(
            "The {} plan does not include API access. Upgrade to Pro.",
            plan.name
        )));
    }
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM api_keys WHERE user_id = $1 AND status = 'active'",
    )
    .bind(u.id)
    .fetch_one(&st.db)
    .await?;
    if count >= 50 {
        return Err(ApiError::bad_request(
            "maximum of 50 active API keys reached",
        ));
    }
    if let Some(models) = &b.allowed_models {
        if let Some(bad) = models.iter().find(|m| !catalog.models.contains_key(*m)) {
            return Err(ApiError::bad_request(format!("unknown model '{bad}'")));
        }
    }
    // Keys may tighten but not exceed the plan's limits.
    let rpm = b.rpm_limit.map(|r| r.clamp(1, plan.default_rpm));
    let tpm = b.tpm_limit.map(|t| t.clamp(1, plan.default_tpm));
    let (key, prefix, hash) = crypto::generate_api_key();
    let id = Uuid::new_v4();
    let name = if b.name.trim().is_empty() {
        "API key".to_string()
    } else {
        b.name.trim().to_string()
    };
    sqlx::query(
        "INSERT INTO api_keys (id, user_id, name, prefix, key_hash, credit_limit, allowed_models, rpm_limit, tpm_limit, expires_at) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $10::BIGINT IS NULL THEN NULL ELSE now() + make_interval(days => $10::INT) END)",
    )
    .bind(id)
    .bind(u.id)
    .bind(&name)
    .bind(&prefix)
    .bind(&hash)
    .bind(b.credit_limit)
    .bind(b.allowed_models.filter(|m| !m.is_empty()))
    .bind(rpm)
    .bind(tpm)
    .bind(b.expires_in_days)
    .execute(&st.db)
    .await?;
    Ok(Json(
        json!({"id": id, "name": name, "prefix": prefix, "key": key, "notice": "Store this key now; it will not be shown again."}),
    ))
}

pub async fn update_key(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
    Path(id): Path<Uuid>,
    Json(b): Json<Value>,
) -> ApiResult<Json<Value>> {
    let owner: Option<Uuid> = sqlx::query_scalar("SELECT user_id FROM api_keys WHERE id = $1")
        .bind(id)
        .fetch_optional(&st.db)
        .await?;
    if owner != Some(u.id) {
        return Err(ApiError::not_found("API key not found"));
    }
    let mut body = obj(b)?;
    // Keys may tighten but never exceed the plan's limits.
    {
        let catalog = st.catalog.load();
        if let Some(models) = body.get("allowed_models").and_then(Value::as_array) {
            if let Some(bad) = models.iter().find(|m| {
                !m.as_str()
                    .map(|s| catalog.models.contains_key(s))
                    .unwrap_or(false)
            }) {
                return Err(ApiError::bad_request(format!("unknown model {bad}")));
            }
        }
        if let Some(plan) = catalog.plans.get(&u.plan_id) {
            for (field, cap) in [
                ("rpm_limit", plan.default_rpm),
                ("tpm_limit", plan.default_tpm),
            ] {
                if let Some(v) = body.get(field).and_then(Value::as_i64) {
                    body.insert(field.into(), json!(v.clamp(1, cap as i64)));
                }
            }
        }
    }
    // Users can pause/resume but not un-suspend a key the system suspended.
    if let Some(s) = body.get("status").and_then(Value::as_str) {
        if s != "active" && s != "revoked" {
            return Err(ApiError::bad_request(
                "status must be 'active' or 'revoked'",
            ));
        }
        let current: String = sqlx::query_scalar("SELECT status FROM api_keys WHERE id = $1")
            .bind(id)
            .fetch_one(&st.db)
            .await?;
        if current == "suspended" || current == "revoked" {
            body.remove("status");
        }
    }
    dynamic_update(
        &st.db,
        "api_keys",
        "id",
        id,
        &body,
        &[
            ("name", Field::Text),
            ("credit_limit", Field::BigInt),
            ("allowed_models", Field::TextArray),
            ("rpm_limit", Field::Int),
            ("tpm_limit", Field::Int),
            ("status", Field::Text),
        ],
    )
    .await?;
    Ok(Json(json!({"ok": true})))
}

pub async fn revoke_key(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let r = sqlx::query("UPDATE api_keys SET status = 'revoked' WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(u.id)
        .execute(&st.db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(ApiError::not_found("API key not found"));
    }
    Ok(Json(json!({"ok": true})))
}

// ---- usage, logs, ledger -----------------------------------------------------------------------

#[derive(Deserialize)]
pub struct UsageQuery {
    days: Option<i32>,
}

pub async fn usage(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
    Query(q): Query<UsageQuery>,
) -> ApiResult<Json<Value>> {
    let days = q.days.unwrap_or(30).clamp(1, 365);
    let daily: Value = sqlx::query_scalar(&as_json_array(
        "SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COALESCE(count(l.id), 0) AS requests, \
                COALESCE(sum(l.prompt_tokens), 0) AS prompt_tokens, COALESCE(sum(l.completion_tokens), 0) AS completion_tokens, \
                COALESCE(sum(l.credits), 0) AS credits \
         FROM generate_series(date_trunc('day', now()) - make_interval(days => $2 - 1), date_trunc('day', now()), interval '1 day') AS d(day) \
         LEFT JOIN request_logs l ON l.user_id = $1 AND date_trunc('day', l.created_at) = d.day \
         GROUP BY d.day ORDER BY d.day",
    ))
    .bind(u.id)
    .bind(days)
    .fetch_one(&st.db)
    .await?;
    let by_model: Value = sqlx::query_scalar(&as_json_array(
        "SELECT model, count(*) AS requests, sum(prompt_tokens) AS prompt_tokens, sum(completion_tokens) AS completion_tokens, \
                sum(credits) AS credits, round(avg(latency_ms)) AS avg_latency_ms \
         FROM request_logs WHERE user_id = $1 AND created_at >= now() - make_interval(days => $2) \
         GROUP BY model ORDER BY sum(credits) DESC",
    ))
    .bind(u.id)
    .bind(days)
    .fetch_one(&st.db)
    .await?;
    let totals: Value = sqlx::query_scalar(&as_json_object(
        "SELECT count(*) AS requests, COALESCE(sum(prompt_tokens + completion_tokens), 0) AS tokens, COALESCE(sum(credits), 0) AS credits, \
                COALESCE(round(100.0 * avg(CASE WHEN status_code < 400 THEN 1 ELSE 0 END), 1), 100) AS success_rate, \
                count(*) FILTER (WHERE cached) AS cache_hits \
         FROM request_logs WHERE user_id = $1 AND created_at >= now() - make_interval(days => $2)",
    ))
    .bind(u.id)
    .bind(days)
    .fetch_one(&st.db)
    .await?;
    Ok(Json(
        json!({"days": days, "daily": daily, "by_model": by_model, "totals": totals, "credit_balance": u.credit_balance}),
    ))
}

#[derive(Deserialize)]
pub struct Page {
    limit: Option<i64>,
    offset: Option<i64>,
}

pub async fn logs(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
    Query(q): Query<Page>,
) -> ApiResult<Json<Value>> {
    let v: Value = sqlx::query_scalar(&as_json_array(
        "SELECT l.id, l.model, l.provider_id, l.upstream_model, l.strategy, l.intent, l.status_code, l.error, l.prompt_tokens, \
                l.completion_tokens, l.credits, l.latency_ms, l.ttft_ms, l.attempts, l.cached, l.stream, l.created_at, k.name AS api_key_name \
         FROM request_logs l LEFT JOIN api_keys k ON k.id = l.api_key_id \
         WHERE l.user_id = $1 ORDER BY l.created_at DESC LIMIT $2 OFFSET $3",
    ))
    .bind(u.id)
    .bind(clamp_limit(q.limit))
    .bind(q.offset.unwrap_or(0).max(0))
    .fetch_one(&st.db)
    .await?;
    Ok(Json(json!({"data": v})))
}

pub async fn ledger(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
    Query(q): Query<Page>,
) -> ApiResult<Json<Value>> {
    let v: Value = sqlx::query_scalar(&as_json_array(
        "SELECT id, delta, balance_after, reason, ref_id, created_at FROM credit_ledger WHERE user_id = $1 \
         ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    ))
    .bind(u.id)
    .bind(clamp_limit(q.limit))
    .bind(q.offset.unwrap_or(0).max(0))
    .fetch_one(&st.db)
    .await?;
    Ok(Json(json!({"data": v})))
}

// ---- BYOK (enterprise) -------------------------------------------------------------------------

fn require_byok(st: &AppState, u: &UserRow) -> ApiResult<()> {
    let c = st.catalog.load();
    if !c.plans.get(&u.plan_id).map(|p| p.byok).unwrap_or(false) {
        return Err(ApiError::forbidden(
            "Bring-your-own-key pools are available on the Enterprise plan.",
        ));
    }
    Ok(())
}

pub async fn list_own_provider_keys(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
) -> ApiResult<Json<Value>> {
    require_byok(&st, &u)?;
    let v: Value = sqlx::query_scalar(&as_json_array(
        "SELECT id, provider_id, label, key_last4, enabled, weight, created_at FROM provider_keys WHERE owner_user_id = $1 ORDER BY created_at",
    ))
    .bind(u.id)
    .fetch_one(&st.db)
    .await?;
    Ok(Json(json!({"data": v})))
}

#[derive(Deserialize)]
pub struct OwnKey {
    provider_id: String,
    key: String,
    #[serde(default)]
    label: String,
}

pub async fn add_own_provider_key(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
    Json(b): Json<OwnKey>,
) -> ApiResult<Json<Value>> {
    require_byok(&st, &u)?;
    if b.key.trim().len() < 8 {
        return Err(ApiError::bad_request("key looks invalid"));
    }
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO provider_keys (id, provider_id, owner_user_id, label, key_ciphertext, key_last4) \
         SELECT $1, $2, $3, $4, $5, $6 WHERE EXISTS (SELECT 1 FROM providers WHERE id = $2 AND kind <> 'mock')",
    )
    .bind(id)
    .bind(&b.provider_id)
    .bind(u.id)
    .bind(&b.label)
    .bind(crypto::encrypt_secret(&st.cfg.master_key, b.key.trim()))
    .bind(crypto::last4(b.key.trim()))
    .execute(&st.db)
    .await?;
    st.reload_catalog().await?;
    Ok(Json(json!({"id": id})))
}

pub async fn delete_own_provider_key(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    require_byok(&st, &u)?;
    let r = sqlx::query("DELETE FROM provider_keys WHERE id = $1 AND owner_user_id = $2")
        .bind(id)
        .bind(u.id)
        .execute(&st.db)
        .await?;
    if r.rows_affected() == 0 {
        return Err(ApiError::not_found("key not found"));
    }
    st.reload_catalog().await?;
    Ok(Json(json!({"ok": true})))
}
