//! Asynchronous request log writer: requests never wait on log persistence.
//! Entries are batched (up to 200 rows or 1s) and inserted in one statement.

use std::time::Duration;

use serde_json::Value;
use sqlx::{PgPool, Postgres, QueryBuilder};
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Debug, Clone, Default)]
pub struct LogEntry {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub api_key_id: Option<Uuid>,
    pub model: String,
    pub provider_id: Option<String>,
    pub upstream_model: Option<String>,
    pub strategy: Option<String>,
    pub intent: Option<String>,
    pub status_code: i32,
    pub error: Option<String>,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub credits: i64,
    pub latency_ms: i32,
    pub ttft_ms: Option<i32>,
    pub attempts: i32,
    pub cached: bool,
    pub stream: bool,
    pub request_body: Option<Value>,
    pub response_body: Option<Value>,
}

#[derive(Clone)]
pub struct Logger {
    tx: mpsc::Sender<LogEntry>,
}

impl Logger {
    pub fn spawn(db: PgPool) -> Self {
        let (tx, mut rx) = mpsc::channel::<LogEntry>(10_000);
        tokio::spawn(async move {
            let mut buf: Vec<LogEntry> = Vec::with_capacity(200);
            loop {
                let first = rx.recv().await;
                let Some(first) = first else { break };
                buf.push(first);
                let deadline = tokio::time::sleep(Duration::from_secs(1));
                tokio::pin!(deadline);
                while buf.len() < 200 {
                    tokio::select! {
                        item = rx.recv() => match item { Some(e) => buf.push(e), None => break },
                        _ = &mut deadline => break,
                    }
                }
                if let Err(e) = flush(&db, &buf).await {
                    tracing::error!(error = %e, rows = buf.len(), "failed to write request logs");
                }
                buf.clear();
            }
        });
        Self { tx }
    }

    pub fn log(&self, entry: LogEntry) {
        if let Err(e) = self.tx.try_send(entry) {
            tracing::warn!(error = %e, "request log queue full; dropping entry");
        }
    }
}

async fn flush(db: &PgPool, rows: &[LogEntry]) -> anyhow::Result<()> {
    let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(
        "INSERT INTO request_logs (id, user_id, api_key_id, model, provider_id, upstream_model, strategy, intent, status_code, error, \
         prompt_tokens, completion_tokens, credits, latency_ms, ttft_ms, attempts, cached, stream, request_body, response_body) ",
    );
    qb.push_values(rows, |mut b, e| {
        b.push_bind(e.id)
            .push_bind(e.user_id)
            .push_bind(e.api_key_id)
            .push_bind(&e.model)
            .push_bind(&e.provider_id)
            .push_bind(&e.upstream_model)
            .push_bind(&e.strategy)
            .push_bind(&e.intent)
            .push_bind(e.status_code)
            .push_bind(&e.error)
            .push_bind(e.prompt_tokens)
            .push_bind(e.completion_tokens)
            .push_bind(e.credits)
            .push_bind(e.latency_ms)
            .push_bind(e.ttft_ms)
            .push_bind(e.attempts)
            .push_bind(e.cached)
            .push_bind(e.stream)
            .push_bind(&e.request_body)
            .push_bind(&e.response_body);
    });
    qb.build().execute(db).await?;
    Ok(())
}
