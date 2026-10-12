//! HTTP router and application bootstrap.

use std::sync::Arc;
use std::time::Duration;

use arc_swap::ArcSwap;
use axum::extract::DefaultBodyLimit;
use axum::http::{header, HeaderValue, Method};
use axum::routing::{get, patch, post, put};
use axum::{Json, Router};
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use tower_http::trace::TraceLayer;
use uuid::Uuid;

use crate::catalog;
use crate::config::Config;
use crate::crypto;
use crate::handlers::{admin, cafeca_auth, chat, portal};
use crate::kv::Kv;
use crate::logging::Logger;
use crate::routing::health::Health;
use crate::routing::keypool::KeyPool;
use crate::state::{AppState, AppStateInner};

pub fn router(state: AppState) -> Router {
    let cors = if state.cfg.cors_origins.is_empty() {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
            .expose_headers(Any)
    } else {
        let origins: Vec<HeaderValue> = state
            .cfg
            .cors_origins
            .iter()
            .filter_map(|o| o.parse().ok())
            .collect();
        CorsLayer::new()
            .allow_origin(AllowOrigin::list(origins))
            .allow_methods([
                Method::GET,
                Method::POST,
                Method::PATCH,
                Method::PUT,
                Method::DELETE,
                Method::OPTIONS,
            ])
            .allow_headers([
                header::AUTHORIZATION,
                header::CONTENT_TYPE,
                "x-api-key".parse().unwrap(),
                "x-hub-strategy".parse().unwrap(),
                "x-hub-intent".parse().unwrap(),
                "x-hub-cache".parse().unwrap(),
            ])
            .expose_headers(Any)
    };

    let v1 = Router::new()
        .route("/models", get(chat::list_models))
        .route("/chat/completions", post(chat::chat_completions));

    let auth = Router::new()
        .route("/register", post(portal::register))
        .route("/login", post(portal::login))
        .route("/cafeca/config", get(cafeca_auth::config))
        .route("/cafeca/nonce", post(cafeca_auth::nonce))
        .route("/cafeca/login", post(cafeca_auth::login));

    let api = Router::new()
        .route("/me", get(portal::me).patch(portal::update_me))
        .route("/plans", get(portal::plans))
        .route("/me/cafeca/nonce", post(cafeca_auth::link_nonce))
        .route(
            "/me/cafeca",
            post(cafeca_auth::link).delete(cafeca_auth::unlink),
        )
        .route("/subscription", post(portal::change_plan))
        .route("/models", get(portal::models))
        .route("/keys", get(portal::list_keys).post(portal::create_key))
        .route(
            "/keys/{id}",
            patch(portal::update_key).delete(portal::revoke_key),
        )
        .route("/usage", get(portal::usage))
        .route("/logs", get(portal::logs))
        .route("/ledger", get(portal::ledger))
        .route(
            "/provider-keys",
            get(portal::list_own_provider_keys).post(portal::add_own_provider_key),
        )
        .route(
            "/provider-keys/{id}",
            axum::routing::delete(portal::delete_own_provider_key),
        );

    let adm = Router::new()
        .route("/overview", get(admin::overview))
        .route("/health", get(admin::health))
        .route("/health/reset", post(admin::reset_health))
        .route("/reload", post(admin::reload_catalog))
        .route(
            "/providers",
            get(admin::list_providers).post(admin::create_provider),
        )
        .route(
            "/providers/{id}",
            patch(admin::update_provider).delete(admin::delete_provider),
        )
        .route(
            "/providers/{id}/keys",
            get(admin::list_provider_keys).post(admin::add_provider_key),
        )
        .route(
            "/provider-keys/{id}",
            patch(admin::update_provider_key).delete(admin::delete_provider_key),
        )
        .route("/models", get(admin::list_models).post(admin::create_model))
        .route(
            "/models/{id}",
            patch(admin::update_model).delete(admin::delete_model),
        )
        .route("/models/{id}/routes", post(admin::create_route))
        .route(
            "/routes/{id}",
            patch(admin::update_route).delete(admin::delete_route),
        )
        .route("/users", get(admin::list_users))
        .route("/users/{id}", patch(admin::update_user))
        .route("/users/{id}/credits", post(admin::adjust_credits))
        .route("/plans", get(admin::list_plans))
        .route("/plans/{id}", patch(admin::update_plan))
        .route("/logs", get(admin::logs))
        .route("/logs/{id}", get(admin::log_detail))
        .route("/settings", get(admin::get_settings))
        .route("/settings/{key}", put(admin::put_setting));

    let max_body = state.cfg.max_body_bytes;
    Router::new()
        .route("/health", get(|| async { Json(json!({"status": "ok", "service": "aich-gateway", "version": env!("CARGO_PKG_VERSION")})) }))
        .nest("/v1", v1)
        .nest("/auth", auth)
        .nest("/api", api)
        .nest("/admin", adm)
        .layer(DefaultBodyLimit::max(max_body))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}

pub async fn build_state(cfg: Config) -> anyhow::Result<AppState> {
    let db = PgPoolOptions::new()
        .max_connections(32)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&cfg.database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&db).await?;

    let kv = match &cfg.redis_url {
        Some(url) => match Kv::redis(url).await {
            Ok(kv) => kv,
            Err(e) => {
                tracing::warn!(error = %e, "redis unavailable; falling back to in-memory rate limits and cache");
                Kv::memory()
            }
        },
        None => Kv::memory(),
    };

    let http = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(90))
        .tcp_keepalive(Duration::from_secs(30))
        .user_agent(concat!("aich-gateway/", env!("CARGO_PKG_VERSION")))
        .build()?;

    let catalog = catalog::load(&db, &cfg.master_key).await?;
    let logger = Logger::spawn(db.clone());
    let cafeca = cfg.cafeca_wallet.clone().map(|w| {
        tracing::info!(wallet = %w, origins = ?cfg.cafeca_site_origins, "Sign in with CAFECA enabled");
        crate::cafeca::Cafeca::new(w, cfg.cafeca_site_origins.clone(), cfg.cafeca_rpc.clone(), http.clone())
    });
    let state = Arc::new(AppStateInner {
        cfg,
        db,
        http,
        kv,
        catalog: ArcSwap::from_pointee(catalog),
        health: Health::default(),
        keypool: KeyPool::default(),
        logger,
        cafeca,
    });
    bootstrap_admin(&state).await?;
    Ok(state)
}

async fn bootstrap_admin(st: &AppState) -> anyhow::Result<()> {
    let (Some(email), Some(password)) = (&st.cfg.admin_email, &st.cfg.admin_password) else {
        return Ok(());
    };
    let email = email.trim().to_lowercase();
    let existing: Option<Uuid> = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(&st.db)
        .await?;
    match existing {
        Some(id) => {
            // Never promote an existing account: someone could have registered this address.
            let role: String = sqlx::query_scalar("SELECT role FROM users WHERE id = $1")
                .bind(id)
                .fetch_one(&st.db)
                .await?;
            if role != "admin" {
                tracing::warn!(%email, "AICH_ADMIN_EMAIL belongs to a non-admin account; not promoting it");
            }
        }
        None => {
            let id = Uuid::new_v4();
            sqlx::query(
                "INSERT INTO users (id, email, password_hash, name, role, plan_id, plan_renews_at) VALUES ($1, $2, $3, 'Administrator', 'admin', 'enterprise', now() + interval '1 month')",
            )
            .bind(id)
            .bind(&email)
            .bind(crypto::hash_password(password)?)
            .execute(&st.db)
            .await?;
            crate::billing::grant(&st.db, id, 10_000_000, "admin_bootstrap", None).await?;
            tracing::info!(%email, "bootstrapped admin account");
        }
    }
    Ok(())
}

pub fn spawn_background(state: AppState) {
    let s = state.clone();
    tokio::spawn(async move {
        let mut tick =
            tokio::time::interval(Duration::from_secs(s.cfg.catalog_refresh_secs.max(5)));
        tick.tick().await;
        loop {
            tick.tick().await;
            if let Err(e) = s.reload_catalog().await {
                tracing::error!(error = %e, "catalog refresh failed");
            }
        }
    });
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(3600));
        loop {
            tick.tick().await;
            match crate::billing::run_renewals(&state.db).await {
                Ok(n) if n > 0 => tracing::info!(renewed = n, "granted monthly plan credits"),
                Ok(_) => {}
                Err(e) => tracing::error!(error = %e, "plan renewal job failed"),
            }
        }
    });
}
