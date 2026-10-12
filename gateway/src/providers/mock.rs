//! Deterministic mock provider for local development, demos and tests.
//!
//! Behaviour is selected by the upstream model name:
//! - `mock-echo`        echoes the last user message
//! - `fail-500`         always fails with HTTP 500 (demonstrates failover)
//! - `fail-429`         always fails with HTTP 429 (demonstrates key cooldown)
//! - `slow-<ms>`        waits <ms> before answering (demonstrates latency routing)
//! - `tool-call`        answers with a tool call to the first declared tool

use std::time::Duration;

use futures::stream;

use super::{ChunkStream, KeyFault, UpstreamCall, UpstreamError};
use crate::tokens;
use crate::types::*;

fn behaviour(call: &UpstreamCall<'_>) -> Result<Option<Duration>, UpstreamError> {
    let m = call.upstream_model;
    if m == "fail-500" {
        return Err(UpstreamError {
            status: Some(500),
            message: "mock upstream failure".into(),
            retryable: true,
            key_fault: KeyFault::None,
        });
    }
    if m == "fail-429" {
        return Err(UpstreamError {
            status: Some(429),
            message: "mock rate limit".into(),
            retryable: true,
            key_fault: KeyFault::RateLimited {
                retry_after_secs: 5,
            },
        });
    }
    if let Some(ms) = m.strip_prefix("slow-").and_then(|v| v.parse::<u64>().ok()) {
        return Ok(Some(Duration::from_millis(ms)));
    }
    Ok(None)
}

fn reply_text(call: &UpstreamCall<'_>) -> String {
    let last = call
        .req
        .messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .and_then(|m| m.content.as_ref())
        .map(|c| c.text())
        .unwrap_or_default();
    format!("[mock:{}] {}", call.upstream_model, last)
}

fn tool_call(call: &UpstreamCall<'_>) -> Option<ToolCall> {
    if call.upstream_model != "tool-call" {
        return None;
    }
    let t = call.req.tools.as_ref()?.first()?;
    Some(ToolCall {
        id: "call_mock_1".into(),
        kind: "function".into(),
        function: FunctionCall {
            name: t.function.name.clone(),
            arguments: "{}".into(),
        },
    })
}

pub async fn chat(call: &UpstreamCall<'_>) -> Result<ChatResponse, UpstreamError> {
    if let Some(d) = behaviour(call)? {
        tokio::time::sleep(d).await;
    }
    let text = reply_text(call);
    let tc = tool_call(call);
    let usage = Usage::new(
        tokens::estimate_prompt(call.req),
        tokens::estimate_text(&text),
    );
    Ok(ChatResponse {
        id: new_completion_id(),
        object: "chat.completion".into(),
        created: now_ts(),
        model: call.upstream_model.to_string(),
        choices: vec![Choice {
            index: 0,
            finish_reason: Some(if tc.is_some() { "tool_calls" } else { "stop" }.into()),
            message: ResponseMessage {
                role: "assistant".into(),
                content: Some(text),
                tool_calls: tc.map(|t| vec![t]),
            },
        }],
        usage: Some(usage),
    })
}

pub async fn chat_stream(call: &UpstreamCall<'_>) -> Result<ChunkStream, UpstreamError> {
    if let Some(d) = behaviour(call)? {
        tokio::time::sleep(d).await;
    }
    let text = reply_text(call);
    let id = new_completion_id();
    let created = now_ts();
    let model = call.upstream_model.to_string();
    let mut chunks: Vec<Result<ChatChunk, UpstreamError>> =
        vec![Ok(ChatChunk::new(&id, &model, created).delta(
            Delta {
                role: Some("assistant".into()),
                content: Some(String::new()),
                ..Default::default()
            },
            None,
        ))];
    // Split into word-ish pieces to exercise streaming.
    let mut piece = String::new();
    for ch in text.chars() {
        piece.push(ch);
        if ch == ' ' || piece.chars().count() >= 8 {
            chunks.push(Ok(ChatChunk::text(
                &id,
                &model,
                created,
                std::mem::take(&mut piece),
            )));
        }
    }
    if !piece.is_empty() {
        chunks.push(Ok(ChatChunk::text(&id, &model, created, piece)));
    }
    let mut last =
        ChatChunk::new(&id, &model, created).delta(Delta::default(), Some("stop".into()));
    last.usage = Some(Usage::new(
        tokens::estimate_prompt(call.req),
        tokens::estimate_text(&text),
    ));
    chunks.push(Ok(last));
    Ok(Box::pin(stream::iter(chunks)))
}
