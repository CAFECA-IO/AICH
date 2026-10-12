//! Request authentication extractors.
//! - `Principal`: hub API key (`Authorization: Bearer sk-hub-…` or `x-api-key`) or a web session JWT.
//! - `SessionUser`: web session JWT only (user portal endpoints).
//! - `AdminUser`: web session JWT with role=admin.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::HeaderMap;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::crypto;
use crate::error::ApiError;
use crate::state::AppState;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct UserRow {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub status: String,
    pub plan_id: String,
    pub credit_balance: i64,
    pub zero_data_retention: bool,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ApiKeyRow {
    pub id: Uuid,
    pub user_id: Uuid,
    pub status: String,
    pub credit_limit: Option<i64>,
    pub credits_used: i64,
    pub allowed_models: Option<Vec<String>>,
    pub rpm_limit: Option<i32>,
    pub tpm_limit: Option<i32>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub struct Principal {
    pub user: UserRow,
    pub api_key: Option<ApiKeyRow>,
}

pub struct SessionUser(pub UserRow);
pub struct AdminUser(pub UserRow);

const USER_COLS: &str =
    "id, email, name, role, status, plan_id, credit_balance, zero_data_retention";

fn bearer(headers: &HeaderMap) -> Option<String> {
    if let Some(v) = headers.get("authorization").and_then(|v| v.to_str().ok()) {
        let v = v.trim();
        if let Some(t) = v
            .strip_prefix("Bearer ")
            .or_else(|| v.strip_prefix("bearer "))
        {
            return Some(t.trim().to_string());
        }
    }
    headers
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
}

pub async fn load_user(state: &AppState, id: Uuid) -> Result<UserRow, ApiError> {
    let user: Option<UserRow> =
        sqlx::query_as(&format!("SELECT {USER_COLS} FROM users WHERE id = $1"))
            .bind(id)
            .fetch_optional(&state.db)
            .await?;
    let user = user.ok_or_else(|| ApiError::unauthorized("user not found"))?;
    if user.status != "active" {
        return Err(ApiError::forbidden("account suspended"));
    }
    Ok(user)
}

async fn session_user(state: &AppState, token: &str) -> Result<UserRow, ApiError> {
    let claims = crypto::verify_jwt(&state.cfg.jwt_secret, token)
        .ok_or_else(|| ApiError::unauthorized("invalid or expired session"))?;
    load_user(state, claims.sub).await
}

impl FromRequestParts<AppState> for Principal {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token =
            bearer(&parts.headers).ok_or_else(|| ApiError::unauthorized("missing API key"))?;
        if token.starts_with(crypto::API_KEY_PREFIX) {
            let hash = crypto::sha256_hex(&token);
            let key: Option<ApiKeyRow> = sqlx::query_as(
                "SELECT id, user_id, status, credit_limit, credits_used, allowed_models, rpm_limit, tpm_limit, expires_at \
                 FROM api_keys WHERE key_hash = $1",
            )
            .bind(&hash)
            .fetch_optional(&state.db)
            .await?;
            let key = key.ok_or_else(|| ApiError::unauthorized("invalid API key"))?;
            if key.status != "active" {
                return Err(ApiError::unauthorized(format!("API key is {}", key.status)));
            }
            if key.expires_at.map(|e| e < Utc::now()).unwrap_or(false) {
                return Err(ApiError::unauthorized("API key expired"));
            }
            let user = load_user(state, key.user_id).await?;
            Ok(Principal {
                user,
                api_key: Some(key),
            })
        } else {
            Ok(Principal {
                user: session_user(state, &token).await?,
                api_key: None,
            })
        }
    }
}

impl FromRequestParts<AppState> for SessionUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token =
            bearer(&parts.headers).ok_or_else(|| ApiError::unauthorized("not signed in"))?;
        if token.starts_with(crypto::API_KEY_PREFIX) {
            return Err(ApiError::unauthorized(
                "this endpoint requires a web session, not an API key",
            ));
        }
        Ok(SessionUser(session_user(state, &token).await?))
    }
}

impl FromRequestParts<AppState> for AdminUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let SessionUser(user) = SessionUser::from_request_parts(parts, state).await?;
        if user.role != "admin" {
            return Err(ApiError::forbidden("admin only"));
        }
        Ok(AdminUser(user))
    }
}
