//! Sign in with CAFECA endpoints.
//!
//! Nonce binding: the gateway is cookie-less (web sessions are bearer JWTs), so each nonce is bound
//! to the browser that requested it with a random one-time `ticket`. The browser keeps the ticket in
//! sessionStorage and presents it with the wallet response; we store only its SHA-256.
//! Nonces are single-use (atomically taken from the KV store before verification) and live 5 minutes.

use std::time::Duration;

use axum::extract::State;
use axum::Json;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64U;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use super::portal::user_json;
use crate::auth::SessionUser;
use crate::cafeca::{normalize_origin, SignInResponse, VerifiedSignIn};
use crate::crypto;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

const NONCE_TTL: Duration = Duration::from_secs(300);

#[derive(Serialize, Deserialize)]
struct PendingNonce {
    domain: String,
    ticket_hash: String,
    /// None = sign-in; Some(user) = link CAFECA to an existing account.
    link_user: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct NonceBody {
    /// The web page's origin (window.location.origin); must be in AICH_CAFECA_SITE_ORIGINS.
    domain: String,
}

#[derive(Deserialize)]
pub struct VerifyBody {
    response: SignInResponse,
    ticket: String,
}

fn random_b64u(n: usize) -> String {
    B64U.encode(crate::crypto::random_bytes(n))
}

fn cafeca(st: &AppState) -> ApiResult<&crate::cafeca::Cafeca> {
    st.cafeca
        .as_ref()
        .ok_or_else(|| ApiError::not_found("Sign in with CAFECA is not enabled"))
}

async fn issue_nonce(
    st: &AppState,
    domain: &str,
    link_user: Option<Uuid>,
) -> ApiResult<Json<Value>> {
    let c = cafeca(st)?;
    let domain = normalize_origin(domain).ok_or_else(|| ApiError::bad_request("invalid domain"))?;
    if !c.allows_origin(&domain) {
        return Err(ApiError::forbidden(format!(
            "{domain} is not an allowed CAFECA sign-in origin (set AICH_CAFECA_SITE_ORIGINS)"
        )));
    }
    let nonce = random_b64u(16);
    let ticket = random_b64u(32);
    let pending = PendingNonce {
        domain,
        ticket_hash: crypto::sha256_hex(&ticket),
        link_user,
    };
    st.kv
        .set_ex(
            &format!("cafeca:nonce:{nonce}"),
            &serde_json::to_string(&pending).unwrap_or_default(),
            NONCE_TTL,
        )
        .await;
    Ok(Json(json!({
        "nonce": nonce,
        "ticket": ticket,
        "wallet": c.wallet,
        "expires_in": NONCE_TTL.as_secs(),
    })))
}

/// Consume the nonce named in the response and verify the signature.
async fn consume_and_verify(
    st: &AppState,
    b: &VerifyBody,
) -> ApiResult<(VerifiedSignIn, Option<Uuid>)> {
    let c = cafeca(st)?;
    let nonce = &b.response.message.nonce;
    if nonce.is_empty() || nonce.len() > 128 {
        return Err(ApiError::bad_request("invalid nonce"));
    }
    // Taken before verification so a nonce can never be used twice, even on failure.
    let raw = st
        .kv
        .take(&format!("cafeca:nonce:{nonce}"))
        .await
        .ok_or_else(|| ApiError::unauthorized("登入請求已過期或已使用，請重新登入"))?;
    let pending: PendingNonce =
        serde_json::from_str(&raw).map_err(|_| ApiError::internal("corrupt nonce record"))?;
    if pending.ticket_hash != crypto::sha256_hex(&b.ticket) {
        return Err(ApiError::unauthorized("登入請求不是由這個瀏覽器發出的"));
    }
    let now = chrono::Utc::now().timestamp().max(0) as u64;
    let verified = c
        .verify(&b.response, &pending.domain, nonce, now)
        .await
        .map_err(ApiError::unauthorized)?;
    Ok((verified, pending.link_user))
}

pub async fn nonce(State(st): State<AppState>, Json(b): Json<NonceBody>) -> ApiResult<Json<Value>> {
    issue_nonce(&st, &b.domain, None).await
}

pub async fn link_nonce(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
    Json(b): Json<NonceBody>,
) -> ApiResult<Json<Value>> {
    issue_nonce(&st, &b.domain, Some(u.id)).await
}

pub async fn login(
    State(st): State<AppState>,
    Json(b): Json<VerifyBody>,
) -> ApiResult<Json<Value>> {
    let (v, link_user) = consume_and_verify(&st, &b).await?;
    if link_user.is_some() {
        return Err(ApiError::bad_request(
            "this nonce was issued for account linking",
        ));
    }
    let existing: Option<(Uuid, String, String)> =
        sqlx::query_as("SELECT id, role, status FROM users WHERE cafeca_account = $1")
            .bind(&v.account)
            .fetch_optional(&st.db)
            .await?;
    let (id, role, created) = match existing {
        Some((id, role, status)) => {
            if status != "active" {
                return Err(ApiError::forbidden("account suspended"));
            }
            sqlx::query("UPDATE users SET last_login_at = now(), cafeca_handle = COALESCE($2, cafeca_handle) WHERE id = $1")
                .bind(id)
                .bind(&v.handle)
                .execute(&st.db)
                .await?;
            (id, role, false)
        }
        None => {
            let name = v
                .handle
                .clone()
                .unwrap_or_else(|| format!("CAFECA {}", &v.account[..8]));
            let created = crate::users::create_user(
                &st.db,
                crate::users::NewUser {
                    email: None,
                    password_hash: None,
                    name: &name,
                    cafeca_account: Some(&v.account),
                    cafeca_handle: v.handle.as_deref(),
                },
                st.cfg.signup_bonus_credits,
            )
            .await?;
            tracing::info!(account = %v.account, role = %created.role, "new user via Sign in with CAFECA");
            (created.id, created.role, true)
        }
    };
    let user = crate::auth::load_user(&st, id).await?;
    let token = crypto::issue_jwt(&st.cfg.jwt_secret, id, &role)?;
    Ok(Json(
        json!({"token": token, "user": user_json(&user, &st.catalog.load()), "created": created}),
    ))
}

pub async fn link(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
    Json(b): Json<VerifyBody>,
) -> ApiResult<Json<Value>> {
    let (v, link_user) = consume_and_verify(&st, &b).await?;
    if link_user != Some(u.id) {
        return Err(ApiError::forbidden(
            "this nonce was not issued for your account",
        ));
    }
    let r = sqlx::query("UPDATE users SET cafeca_account = $1, cafeca_handle = $2 WHERE id = $3")
        .bind(&v.account)
        .bind(&v.handle)
        .bind(u.id)
        .execute(&st.db)
        .await
        .map_err(|e| match ApiError::from(e) {
            err if err.code == "conflict" => {
                ApiError::conflict("這個 CAFECA 身分已綁定其他 AICH 帳號")
            }
            err => err,
        })?;
    if r.rows_affected() == 0 {
        return Err(ApiError::not_found("user not found"));
    }
    let user = crate::auth::load_user(&st, u.id).await?;
    Ok(Json(user_json(&user, &st.catalog.load())))
}

pub async fn unlink(
    State(st): State<AppState>,
    SessionUser(u): SessionUser,
) -> ApiResult<Json<Value>> {
    if u.email.is_none() || !u.has_password {
        return Err(ApiError::bad_request(
            "此帳號只能以 CAFECA 登入，解除綁定後將無法登入",
        ));
    }
    sqlx::query("UPDATE users SET cafeca_account = NULL, cafeca_handle = NULL WHERE id = $1")
        .bind(u.id)
        .execute(&st.db)
        .await?;
    let user = crate::auth::load_user(&st, u.id).await?;
    Ok(Json(user_json(&user, &st.catalog.load())))
}

/// Public config the web app needs to render the button (wallet URL, enabled flag).
pub async fn config(State(st): State<AppState>) -> Json<Value> {
    match &st.cafeca {
        Some(c) => Json(json!({"enabled": true, "wallet": c.wallet, "origins": c.site_origins})),
        None => Json(json!({"enabled": false})),
    }
}
