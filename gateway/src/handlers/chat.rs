//! OpenAI-compatible endpoints: `POST /v1/chat/completions`, `GET /v1/models`.

use std::convert::Infallible;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::Json;
use futures::StreamExt;
use serde_json::{json, Value};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::auth::Principal;
use crate::billing;
use crate::catalog::{Catalog, Plan, Strategy};
use crate::crypto;
use crate::error::{ApiError, ApiResult};
use crate::guardrails::{self, Verdict};
use crate::logging::LogEntry;
use crate::providers::{self, ChunkStream, KeyFault, UpstreamCall, UpstreamError};
use crate::routing::{self, Candidate, PlanInput, RoutePlan};
use crate::state::AppState;
use crate::tokens;
use crate::types::*;

const INTENTS: [&str; 6] = [
    "code",
    "long_context",
    "reasoning",
    "vision",
    "simple",
    "general",
];

/// Per-request context shared by the non-streaming and streaming flows.
struct Ctx {
    request_id: Uuid,
    started: Instant,
    principal: Principal,
    req: ChatRequest,
    plan: RoutePlan,
    catalog: Arc<Catalog>,
    prompt_est: u32,
    log_bodies: bool,
    flagged: Option<String>,
    max_attempts: usize,
}

impl Ctx {
    fn log_base(&self) -> LogEntry {
        LogEntry {
            id: self.request_id,
            user_id: Some(self.principal.user.id),
            api_key_id: self.principal.api_key.as_ref().map(|k| k.id),
            model: self.req.model.clone(),
            strategy: Some(self.plan.strategy.as_str().to_string()),
            intent: self
                .plan
                .intent
                .map(String::from)
                .or_else(|| self.flagged.as_ref().map(|_| "flagged".into())),
            stream: self.req.is_stream(),
            latency_ms: self.started.elapsed().as_millis() as i32,
            request_body: if self.log_bodies {
                serde_json::to_value(&self.req).ok()
            } else {
                None
            },
            ..Default::default()
        }
    }
}

fn header(name: &'static str, v: impl ToString) -> (HeaderName, HeaderValue) {
    (
        HeaderName::from_static(name),
        HeaderValue::from_str(&v.to_string()).unwrap_or(HeaderValue::from_static("")),
    )
}

fn hub_headers(
    ctx: &Ctx,
    cand: Option<&Candidate>,
    credits: i64,
    cache: &str,
    attempts: usize,
) -> HeaderMap {
    let mut h = HeaderMap::new();
    let mut add = |(k, v): (HeaderName, HeaderValue)| {
        h.insert(k, v);
    };
    add(header("x-hub-request-id", ctx.request_id));
    add(header("x-hub-strategy", ctx.plan.strategy.as_str()));
    if let Some(i) = ctx.plan.intent {
        add(header("x-hub-intent", i));
    }
    if let Some(c) = cand {
        add(header("x-hub-provider", &c.provider.id));
        add(header("x-hub-upstream-model", &c.route.upstream_model));
    }
    add(header("x-hub-credits", credits));
    add(header("x-hub-cache", cache));
    add(header("x-hub-attempts", attempts));
    if let Some(f) = &ctx.flagged {
        add(header("x-hub-guardrail", format!("flagged: {f}")));
    }
    h
}

pub async fn list_models(State(st): State<AppState>, p: Principal) -> Json<Value> {
    let catalog = st.catalog.load();
    let tiers = catalog
        .plans
        .get(&p.user.plan_id)
        .map(|pl| pl.allowed_tiers.clone())
        .unwrap_or_default();
    let allowed = p
        .api_key
        .as_ref()
        .and_then(|k| k.allowed_models.clone())
        .filter(|v| !v.is_empty());
    let data: Vec<Value> = catalog
        .models_sorted()
        .into_iter()
        .filter(|m| tiers.contains(&m.tier))
        .filter(|m| allowed.as_ref().map(|a| a.contains(&m.id)).unwrap_or(true))
        .map(|m| json!({"id": m.id, "object": "model", "created": 0, "owned_by": "aich", "name": m.display_name}))
        .collect();
    Json(json!({"object": "list", "data": data}))
}

pub async fn chat_completions(
    State(st): State<AppState>,
    p: Principal,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    match handle(st, p, headers, body).await {
        Ok(r) => r,
        Err(e) => e.into_response(),
    }
}

fn plan_for(catalog: &Catalog, user_plan: &str) -> ApiResult<Plan> {
    catalog
        .plans
        .get(user_plan)
        .cloned()
        .ok_or_else(|| ApiError::internal("user plan not configured"))
}

async fn handle(
    st: AppState,
    p: Principal,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Response> {
    let started = Instant::now();
    let request_id = Uuid::new_v4();
    let req: ChatRequest = serde_json::from_slice(&body)
        .map_err(|e| ApiError::bad_request(format!("invalid request body: {e}")))?;
    if req.messages.is_empty() {
        return Err(ApiError::bad_request("messages must not be empty"));
    }

    let catalog = st.catalog.load_full();
    let model = catalog.models.get(&req.model).ok_or_else(|| {
        ApiError::new(
            StatusCode::NOT_FOUND,
            "invalid_request_error",
            "model_not_found",
            format!("The model '{}' does not exist", req.model),
        )
    })?;
    let plan = plan_for(&catalog, &p.user.plan_id)?;

    // --- access control --------------------------------------------------------------------
    if !plan.allowed_tiers.contains(&model.tier) {
        return Err(ApiError::forbidden(format!(
            "Model '{}' is a {} model and is not included in the {} plan. Upgrade to access it.",
            model.id, model.tier, plan.name
        )));
    }
    if let Some(k) = &p.api_key {
        if !plan.allow_api {
            return Err(ApiError::forbidden(format!(
                "The {} plan does not include API access. Upgrade to Pro.",
                plan.name
            )));
        }
        if let Some(allowed) = k.allowed_models.as_ref().filter(|a| !a.is_empty()) {
            if !allowed.contains(&req.model) {
                return Err(ApiError::forbidden(format!(
                    "This API key is not allowed to use model '{}'",
                    req.model
                )));
            }
        }
        if let Some(limit) = k.credit_limit {
            if k.credits_used >= limit {
                return Err(ApiError::payment_required(
                    "This API key has reached its credit limit",
                ));
            }
        }
    }
    if p.user.credit_balance <= 0 {
        return Err(ApiError::payment_required(
            "Insufficient credits. Top up or upgrade your plan.",
        ));
    }

    // --- rate limiting (RPM/TPM per API key, or per user for web sessions) ------------------
    let prompt_est = tokens::estimate_prompt(&req);
    let subject = p
        .api_key
        .as_ref()
        .map(|k| format!("k:{}", k.id))
        .unwrap_or_else(|| format!("u:{}", p.user.id));
    let rpm = p
        .api_key
        .as_ref()
        .and_then(|k| k.rpm_limit)
        .unwrap_or(plan.default_rpm)
        .min(plan.default_rpm)
        .max(1) as u64;
    let tpm = p
        .api_key
        .as_ref()
        .and_then(|k| k.tpm_limit)
        .unwrap_or(plan.default_tpm)
        .min(plan.default_tpm)
        .max(1) as u64;
    let minute = chrono::Utc::now().timestamp() / 60;
    let window = Duration::from_secs(70);
    let used_rpm = st
        .kv
        .incr(&format!("rl:rpm:{subject}:{minute}"), 1, window)
        .await;
    let used_tpm = st
        .kv
        .incr(
            &format!("rl:tpm:{subject}:{minute}"),
            prompt_est as u64,
            window,
        )
        .await;
    if used_rpm > rpm || used_tpm > tpm {
        record_violation(&st, &p, &subject).await;
        let which = if used_rpm > rpm {
            format!("{rpm} requests/min")
        } else {
            format!("{tpm} tokens/min")
        };
        return Err(ApiError::rate_limited(format!(
            "Rate limit exceeded ({which}). Retry after the current minute."
        )));
    }

    // --- guardrails -----------------------------------------------------------------------
    let mut flagged = None;
    match guardrails::check(&req, &catalog.guardrails) {
        Verdict::Block(r) => {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "invalid_request_error",
                "content_policy_violation",
                format!("Request blocked by content policy: {r}"),
            ));
        }
        Verdict::Flag(r) => flagged = Some(r),
        Verdict::Pass => {}
    }

    // --- routing --------------------------------------------------------------------------
    let strategy = headers
        .get("x-hub-strategy")
        .and_then(|v| v.to_str().ok())
        .and_then(Strategy::parse)
        .unwrap_or(model.strategy);
    let intent: Option<&'static str> = headers
        .get("x-hub-intent")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| INTENTS.iter().find(|i| **i == v).copied())
        .or_else(|| (strategy == Strategy::Intent).then(|| routing::intent::classify(&req)));
    let route_plan = routing::plan(
        &PlanInput {
            catalog: &catalog,
            model,
            strategy,
            intent,
            prompt_tokens: prompt_est,
            max_output_tokens: req.max_output().unwrap_or(512),
            stream: req.is_stream(),
            user_id: p.user.id,
        },
        &st.health,
    );
    if route_plan.candidates.is_empty() {
        let why: Vec<String> = route_plan
            .skipped
            .iter()
            .map(|(t, r)| format!("{t}: {r}"))
            .collect();
        return Err(ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "upstream_error",
            "no_available_upstream",
            format!(
                "No available upstream for model '{}' [{}]",
                model.id,
                why.join(", ")
            ),
        ));
    }

    let base = st.cfg.max_attempts.max(1);
    let max_attempts = match plan.routing_priority {
        p if p >= 100 => base + 1,
        p if p >= 10 => base,
        _ => base.saturating_sub(1).max(2),
    };
    let log_bodies = st.cfg.log_bodies && !p.user.zero_data_retention;

    let ctx = Ctx {
        request_id,
        started,
        principal: p,
        req,
        plan: route_plan,
        catalog,
        prompt_est,
        log_bodies,
        flagged,
        max_attempts,
    };

    if ctx.req.is_stream() {
        stream_flow(st, ctx).await
    } else {
        non_stream_flow(st, ctx, &headers).await
    }
}

async fn record_violation(st: &AppState, p: &Principal, subject: &str) {
    // Abuse defence: a key that keeps hammering past its limits gets suspended automatically.
    let bucket = chrono::Utc::now().timestamp() / 600;
    let n = st
        .kv
        .incr(
            &format!("abuse:{subject}:{bucket}"),
            1,
            Duration::from_secs(660),
        )
        .await;
    if n == 300 {
        if let Some(k) = &p.api_key {
            tracing::warn!(api_key = %k.id, "suspending API key after repeated rate-limit violations");
            let _ = sqlx::query(
                "UPDATE api_keys SET status = 'suspended' WHERE id = $1 AND status = 'active'",
            )
            .bind(k.id)
            .execute(&st.db)
            .await;
        }
    }
}

fn cache_key(ctx: &Ctx) -> String {
    // Hash the whole request (including pass-through fields such as n, seed, logprobs)
    // except transport-only fields, scoped to the user.
    let mut material = serde_json::to_value(&ctx.req).unwrap_or(Value::Null);
    if let Some(o) = material.as_object_mut() {
        for k in ["stream", "stream_options", "user"] {
            o.remove(k);
        }
        o.insert("__user".into(), json!(ctx.principal.user.id));
    }
    format!("cache:{}", crypto::sha256_hex(&material.to_string()))
}

fn cacheable(ctx: &Ctx, headers: &HeaderMap) -> bool {
    if !ctx.catalog.cache.enabled || ctx.principal.user.zero_data_retention {
        return false;
    }
    match headers.get("x-hub-cache").and_then(|v| v.to_str().ok()) {
        Some("false") | Some("off") => false,
        Some("true") | Some("on") => true,
        _ => ctx.req.temperature == Some(0.0),
    }
}

fn upstream_call<'a>(cand: &'a Candidate, key: &'a str, req: &'a ChatRequest) -> UpstreamCall<'a> {
    UpstreamCall {
        kind: cand.provider.kind,
        base_url: &cand.provider.base_url,
        api_key: key,
        upstream_model: &cand.route.upstream_model,
        timeout: cand.provider.timeout,
        config: &cand.provider.config,
        req,
    }
}

/// Book-keeping after a failed attempt. Returns Err when the error must go back to the client.
fn on_attempt_error(
    st: &AppState,
    cand: &Candidate,
    key_id: Uuid,
    e: &UpstreamError,
) -> Result<(), ()> {
    st.keypool.report(key_id, e.key_fault);
    if !e.retryable {
        st.health.release(&cand.target);
        return Err(());
    }
    if e.key_fault == KeyFault::None {
        st.health.record_failure(&cand.target, &e.to_string());
    } else {
        st.health.release(&cand.target);
    }
    tracing::warn!(target_upstream = %cand.target, error = %e, "upstream attempt failed; trying next candidate");
    Ok(())
}

fn client_error(e: &UpstreamError) -> ApiError {
    let status = e
        .status
        .and_then(|s| StatusCode::from_u16(s).ok())
        .unwrap_or(StatusCode::BAD_REQUEST);
    ApiError::new(
        status,
        "invalid_request_error",
        "upstream_rejected",
        e.message.clone(),
    )
}

fn all_failed(last: Option<UpstreamError>, attempts: usize) -> ApiError {
    let msg = last
        .map(|e| e.to_string())
        .unwrap_or_else(|| "no upstream could be reached".into());
    ApiError::upstream(format!(
        "All upstream attempts failed ({attempts} tried). Last error: {msg}"
    ))
}

async fn non_stream_flow(st: AppState, ctx: Ctx, headers: &HeaderMap) -> ApiResult<Response> {
    let use_cache = cacheable(&ctx, headers);
    let ckey = use_cache.then(|| cache_key(&ctx));
    if let Some(k) = &ckey {
        if let Some(hit) = st.kv.get(k).await {
            if let Ok(mut resp) = serde_json::from_str::<ChatResponse>(&hit) {
                resp.id = format!("chatcmpl-{}", ctx.request_id.simple());
                resp.created = now_ts();
                let mut log = ctx.log_base();
                log.status_code = 200;
                log.cached = true;
                log.attempts = 0;
                if let Some(u) = &resp.usage {
                    log.prompt_tokens = u.prompt_tokens as i32;
                    log.completion_tokens = u.completion_tokens as i32;
                }
                st.logger.log(log);
                return Ok((hub_headers(&ctx, None, 0, "hit", 0), Json(resp)).into_response());
            }
        }
    }

    let mut attempts = 0usize;
    let mut last_err = None;
    for cand in &ctx.plan.candidates {
        if attempts >= ctx.max_attempts {
            break;
        }
        if !st.health.try_acquire(&cand.target) {
            continue;
        }
        let keys = ctx
            .catalog
            .keys
            .get(&cand.route.provider_id)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        let Some(key) = st
            .keypool
            .select(&cand.route.provider_id, keys, ctx.principal.user.id)
        else {
            st.health.release(&cand.target);
            continue;
        };
        attempts += 1;
        let t0 = Instant::now();
        match providers::chat(&st.http, &upstream_call(cand, &key.secret, &ctx.req)).await {
            Ok(mut resp) => {
                st.health.record_success(&cand.target, t0.elapsed(), None);
                let usage = resp
                    .usage
                    .clone()
                    .filter(|u| u.prompt_tokens + u.completion_tokens > 0)
                    .unwrap_or_else(|| {
                        let out: String = resp
                            .choices
                            .iter()
                            .filter_map(|c| c.message.content.clone())
                            .collect();
                        Usage::new(ctx.prompt_est, tokens::estimate_text(&out))
                    });
                let credits = billing::credits_for(&usage, &cand.route);
                if let Err(e) = billing::charge(
                    &st.db,
                    ctx.principal.user.id,
                    ctx.principal.api_key.as_ref().map(|k| k.id),
                    credits,
                )
                .await
                {
                    tracing::error!(error = %e, request_id = %ctx.request_id, "failed to charge credits");
                }
                resp.id = format!("chatcmpl-{}", ctx.request_id.simple());
                resp.object = "chat.completion".into();
                resp.model = ctx.req.model.clone();
                resp.usage = Some(usage.clone());

                let mut log = ctx.log_base();
                log.provider_id = Some(cand.provider.id.clone());
                log.upstream_model = Some(cand.route.upstream_model.clone());
                log.status_code = 200;
                log.prompt_tokens = usage.prompt_tokens as i32;
                log.completion_tokens = usage.completion_tokens as i32;
                log.credits = credits;
                log.attempts = attempts as i32;
                log.latency_ms = ctx.started.elapsed().as_millis() as i32;
                if ctx.log_bodies {
                    log.response_body = serde_json::to_value(&resp).ok();
                }
                st.logger.log(log);

                if let Some(k) = &ckey {
                    if let Ok(s) = serde_json::to_string(&resp) {
                        st.kv
                            .set_ex(
                                k,
                                &s,
                                Duration::from_secs(ctx.catalog.cache.ttl_seconds.max(1)),
                            )
                            .await;
                    }
                }
                let cache_state = if ckey.is_some() { "miss" } else { "bypass" };
                return Ok((
                    hub_headers(&ctx, Some(cand), credits, cache_state, attempts),
                    Json(resp),
                )
                    .into_response());
            }
            Err(e) => {
                if on_attempt_error(&st, cand, key.id, &e).is_err() {
                    log_failure(
                        &st,
                        &ctx,
                        Some(cand),
                        attempts,
                        e.status.unwrap_or(400) as i32,
                        &e.message,
                    );
                    return Err(client_error(&e));
                }
                last_err = Some(e);
            }
        }
    }
    let err = all_failed(last_err, attempts);
    log_failure(
        &st,
        &ctx,
        None,
        attempts,
        err.status.as_u16() as i32,
        &err.message,
    );
    Err(err)
}

fn log_failure(
    st: &AppState,
    ctx: &Ctx,
    cand: Option<&Candidate>,
    attempts: usize,
    status: i32,
    msg: &str,
) {
    let mut log = ctx.log_base();
    log.provider_id = cand.map(|c| c.provider.id.clone());
    log.upstream_model = cand.map(|c| c.route.upstream_model.clone());
    log.status_code = status;
    log.error = Some(providers::truncate(msg, 1000));
    log.attempts = attempts as i32;
    st.logger.log(log);
}

async fn stream_flow(st: AppState, ctx: Ctx) -> ApiResult<Response> {
    let mut attempts = 0usize;
    let mut last_err = None;
    for cand in ctx.plan.candidates.clone() {
        if attempts >= ctx.max_attempts {
            break;
        }
        if !st.health.try_acquire(&cand.target) {
            continue;
        }
        let keys = ctx
            .catalog
            .keys
            .get(&cand.route.provider_id)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        let Some(key) = st
            .keypool
            .select(&cand.route.provider_id, keys, ctx.principal.user.id)
        else {
            st.health.release(&cand.target);
            continue;
        };
        attempts += 1;
        let t0 = Instant::now();
        let opened =
            providers::chat_stream(&st.http, &upstream_call(&cand, &key.secret, &ctx.req)).await;
        let mut stream = match opened {
            Ok(s) => s,
            Err(e) => {
                if on_attempt_error(&st, &cand, key.id, &e).is_err() {
                    log_failure(
                        &st,
                        &ctx,
                        Some(&cand),
                        attempts,
                        e.status.unwrap_or(400) as i32,
                        &e.message,
                    );
                    return Err(client_error(&e));
                }
                last_err = Some(e);
                continue;
            }
        };
        // Failover is only possible before the first byte reaches the client: wait for it here.
        let first = tokio::time::timeout(cand.provider.timeout, stream.next()).await;
        let err = match first {
            Ok(Some(Ok(chunk))) => {
                let ttft = t0.elapsed();
                let headers = hub_headers(&ctx, Some(&cand), 0, "bypass", attempts);
                let rx = spawn_pump(st.clone(), ctx, cand, attempts, chunk, stream, t0, ttft);
                let body = async_stream::stream! {
                    let mut rx = rx;
                    while let Some(ev) = rx.recv().await { yield Ok::<Event, Infallible>(ev); }
                };
                return Ok(
                    (headers, Sse::new(body).keep_alive(KeepAlive::default())).into_response()
                );
            }
            Ok(Some(Err(e))) => e,
            Ok(None) => UpstreamError::network("upstream closed the stream without data"),
            Err(_) => UpstreamError::network("timed out waiting for the first token"),
        };
        if on_attempt_error(&st, &cand, key.id, &err).is_err() {
            log_failure(
                &st,
                &ctx,
                Some(&cand),
                attempts,
                err.status.unwrap_or(400) as i32,
                &err.message,
            );
            return Err(client_error(&err));
        }
        last_err = Some(err);
    }
    let err = all_failed(last_err, attempts);
    log_failure(
        &st,
        &ctx,
        None,
        attempts,
        err.status.as_u16() as i32,
        &err.message,
    );
    Err(err)
}

/// Pumps the upstream stream into the client channel on a separate task so that billing and
/// logging complete even if the client disconnects mid-stream.
#[allow(clippy::too_many_arguments)]
fn spawn_pump(
    st: AppState,
    ctx: Ctx,
    cand: Candidate,
    attempts: usize,
    first: ChatChunk,
    mut stream: ChunkStream,
    t0: Instant,
    ttft: Duration,
) -> mpsc::Receiver<Event> {
    let (tx, rx) = mpsc::channel::<Event>(64);
    tokio::spawn(async move {
        let completion_id = format!("chatcmpl-{}", ctx.request_id.simple());
        let include_usage = ctx
            .req
            .extra
            .get("stream_options")
            .and_then(|o| o.get("include_usage"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let mut usage: Option<Usage> = None;
        let mut content = String::new();
        let mut upstream_error: Option<String> = None;
        let mut client_gone = false;
        let mut created = now_ts();

        let mut next = Some(Ok(first));
        loop {
            let item = match next.take() {
                Some(i) => Some(i),
                None => stream.next().await,
            };
            let Some(item) = item else { break };
            match item {
                Ok(mut chunk) => {
                    if let Some(u) = chunk.usage.take() {
                        usage = Some(u);
                    }
                    for c in &chunk.choices {
                        if let Some(t) = &c.delta.content {
                            content.push_str(t);
                        }
                        if let Some(tcs) = &c.delta.tool_calls {
                            for tc in tcs {
                                if let Some(f) = &tc.function {
                                    content.push_str(f.arguments.as_deref().unwrap_or(""));
                                }
                            }
                        }
                    }
                    if chunk.choices.is_empty() {
                        continue;
                    }
                    created = chunk.created;
                    chunk.id = completion_id.clone();
                    chunk.object = "chat.completion.chunk".into();
                    chunk.model = ctx.req.model.clone();
                    let data = serde_json::to_string(&chunk).unwrap_or_default();
                    if tx.send(Event::default().data(data)).await.is_err() {
                        client_gone = true;
                        break;
                    }
                }
                Err(e) => {
                    upstream_error = Some(e.to_string());
                    let err = json!({"error": {"message": format!("upstream stream interrupted: {e}"), "type": "upstream_error", "code": "stream_interrupted"}});
                    let _ = tx.send(Event::default().data(err.to_string())).await;
                    break;
                }
            }
        }
        drop(stream);

        let usage = usage
            .filter(|u| u.prompt_tokens + u.completion_tokens > 0)
            .unwrap_or_else(|| Usage::new(ctx.prompt_est, tokens::estimate_text(&content)));
        let credits = billing::credits_for(&usage, &cand.route);

        if !client_gone {
            if include_usage {
                let mut uc = ChatChunk::new(&completion_id, &ctx.req.model, created);
                uc.usage = Some(usage.clone());
                let _ = tx
                    .send(Event::default().data(serde_json::to_string(&uc).unwrap_or_default()))
                    .await;
            }
            let _ = tx.send(Event::default().data("[DONE]")).await;
        }
        drop(tx);

        match &upstream_error {
            None => st
                .health
                .record_success(&cand.target, t0.elapsed(), Some(ttft)),
            Some(e) => st.health.record_failure(&cand.target, e),
        }
        if let Err(e) = billing::charge(
            &st.db,
            ctx.principal.user.id,
            ctx.principal.api_key.as_ref().map(|k| k.id),
            credits,
        )
        .await
        {
            tracing::error!(error = %e, request_id = %ctx.request_id, "failed to charge credits");
        }
        let mut log = ctx.log_base();
        log.provider_id = Some(cand.provider.id.clone());
        log.upstream_model = Some(cand.route.upstream_model.clone());
        log.status_code = if upstream_error.is_some() {
            502
        } else if client_gone {
            499
        } else {
            200
        };
        log.error =
            upstream_error.or_else(|| client_gone.then(|| "client disconnected".to_string()));
        log.prompt_tokens = usage.prompt_tokens as i32;
        log.completion_tokens = usage.completion_tokens as i32;
        log.credits = credits;
        log.attempts = attempts as i32;
        log.latency_ms = ctx.started.elapsed().as_millis() as i32;
        log.ttft_ms = Some((t0.duration_since(ctx.started) + ttft).as_millis() as i32);
        if ctx.log_bodies {
            log.response_body = Some(json!({"content": content}));
        }
        st.logger.log(log);
    });
    rx
}
