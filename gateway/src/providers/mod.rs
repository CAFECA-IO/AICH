//! Provider adapters translate the hub's OpenAI-compatible protocol to each upstream API.

pub mod anthropic;
pub mod gemini;
pub mod mock;
pub mod openai;
pub mod sse;

use std::pin::Pin;
use std::time::Duration;

use futures::Stream;
use serde_json::Value;

use crate::types::{ChatChunk, ChatRequest, ChatResponse};

pub type ChunkStream = Pin<Box<dyn Stream<Item = Result<ChatChunk, UpstreamError>> + Send>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderKind {
    OpenAi,
    Anthropic,
    Gemini,
    Mock,
}

impl ProviderKind {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "openai" => Some(Self::OpenAi),
            "anthropic" => Some(Self::Anthropic),
            "gemini" => Some(Self::Gemini),
            "mock" => Some(Self::Mock),
            _ => None,
        }
    }
}

/// What went wrong with the key used, so the key pool can react.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyFault {
    None,
    RateLimited { retry_after_secs: u64 },
    Invalid,
}

#[derive(Debug, Clone)]
pub struct UpstreamError {
    pub status: Option<u16>,
    pub message: String,
    pub retryable: bool,
    pub key_fault: KeyFault,
}

impl UpstreamError {
    pub fn network(msg: impl Into<String>) -> Self {
        Self {
            status: None,
            message: msg.into(),
            retryable: true,
            key_fault: KeyFault::None,
        }
    }
    pub fn decode(msg: impl Into<String>) -> Self {
        Self {
            status: None,
            message: msg.into(),
            retryable: true,
            key_fault: KeyFault::None,
        }
    }
    pub fn from_status(status: u16, body: &str, retry_after: Option<u64>) -> Self {
        let message = extract_error_message(body).unwrap_or_else(|| truncate(body, 500));
        let (retryable, key_fault) = match status {
            429 => (
                true,
                KeyFault::RateLimited {
                    retry_after_secs: retry_after.unwrap_or(30),
                },
            ),
            401 | 403 => (true, KeyFault::Invalid),
            400 | 413 | 422 => (false, KeyFault::None),
            _ => (true, KeyFault::None), // 404 (model missing on this provider), 408, 409, 5xx
        };
        Self {
            status: Some(status),
            message,
            retryable,
            key_fault,
        }
    }
    pub fn from_reqwest(e: reqwest::Error) -> Self {
        if e.is_timeout() {
            Self::network("upstream timeout")
        } else if e.is_connect() {
            Self::network(format!("upstream connection failed: {e}"))
        } else {
            Self::network(format!("upstream request failed: {e}"))
        }
    }
}

impl std::fmt::Display for UpstreamError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.status {
            Some(s) => write!(f, "HTTP {s}: {}", self.message),
            None => write!(f, "{}", self.message),
        }
    }
}

fn extract_error_message(body: &str) -> Option<String> {
    let v: Value = serde_json::from_str(body).ok()?;
    let e = v.get("error").unwrap_or(&v);
    if let Some(s) = e.as_str() {
        return Some(s.to_string());
    }
    e.get("message").and_then(|m| m.as_str()).map(String::from)
}

pub fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let mut end = max;
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}…", &s[..end])
    }
}

/// Everything an adapter needs for one upstream attempt.
pub struct UpstreamCall<'a> {
    pub kind: ProviderKind,
    pub base_url: &'a str,
    pub api_key: &'a str,
    pub upstream_model: &'a str,
    pub timeout: Duration,
    pub config: &'a Value,
    pub req: &'a ChatRequest,
}

pub async fn chat(
    http: &reqwest::Client,
    call: &UpstreamCall<'_>,
) -> Result<ChatResponse, UpstreamError> {
    match call.kind {
        ProviderKind::OpenAi => openai::chat(http, call).await,
        ProviderKind::Anthropic => anthropic::chat(http, call).await,
        ProviderKind::Gemini => gemini::chat(http, call).await,
        ProviderKind::Mock => mock::chat(call).await,
    }
}

pub async fn chat_stream(
    http: &reqwest::Client,
    call: &UpstreamCall<'_>,
) -> Result<ChunkStream, UpstreamError> {
    match call.kind {
        ProviderKind::OpenAi => openai::chat_stream(http, call).await,
        ProviderKind::Anthropic => anthropic::chat_stream(http, call).await,
        ProviderKind::Gemini => gemini::chat_stream(http, call).await,
        ProviderKind::Mock => mock::chat_stream(call).await,
    }
}

/// Cheap credential check used by the admin "test key" button: lists the provider's models
/// (no tokens are consumed). Returns model ids.
pub async fn probe(
    http: &reqwest::Client,
    kind: ProviderKind,
    base_url: &str,
    api_key: &str,
    timeout: Duration,
) -> Result<Vec<String>, UpstreamError> {
    let base = base_url.trim_end_matches('/');
    let (rb, list_key, id_key) = match kind {
        ProviderKind::Mock => return Ok(vec!["mock-echo".into(), "fail-500".into()]),
        ProviderKind::OpenAi => (
            http.get(format!("{base}/models")).bearer_auth(api_key),
            "data",
            "id",
        ),
        ProviderKind::Anthropic => (
            http.get(format!("{base}/v1/models"))
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01"),
            "data",
            "id",
        ),
        ProviderKind::Gemini => (
            http.get(format!("{base}/v1beta/models?pageSize=1000"))
                .header("x-goog-api-key", api_key),
            "models",
            "name",
        ),
    };
    let resp = send(rb.timeout(timeout)).await?;
    let v: Value = resp
        .json()
        .await
        .map_err(|e| UpstreamError::decode(format!("unexpected response: {e}")))?;
    Ok(v.get(list_key)
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|m| m.get(id_key).and_then(Value::as_str))
                .map(|s| s.trim_start_matches("models/").to_string())
                .collect()
        })
        .unwrap_or_default())
}

/// Sends a request and converts non-2xx responses into `UpstreamError`.
pub(crate) async fn send(rb: reqwest::RequestBuilder) -> Result<reqwest::Response, UpstreamError> {
    let resp = rb.send().await.map_err(UpstreamError::from_reqwest)?;
    let status = resp.status().as_u16();
    if (200..300).contains(&status) {
        return Ok(resp);
    }
    let retry_after = resp
        .headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok());
    let body = resp.text().await.unwrap_or_default();
    Err(UpstreamError::from_status(status, &body, retry_after))
}

/// Parse a data URL into (mime, base64 data).
pub(crate) fn parse_data_url(url: &str) -> Option<(String, String)> {
    let rest = url.strip_prefix("data:")?;
    let (meta, data) = rest.split_once(',')?;
    let mime = meta.strip_suffix(";base64")?;
    Some((mime.to_string(), data.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_status_codes() {
        let e = UpstreamError::from_status(429, r#"{"error":{"message":"slow down"}}"#, Some(5));
        assert!(e.retryable);
        assert_eq!(
            e.key_fault,
            KeyFault::RateLimited {
                retry_after_secs: 5
            }
        );
        assert_eq!(e.message, "slow down");
        assert!(!UpstreamError::from_status(400, "bad", None).retryable);
        assert!(UpstreamError::from_status(503, "", None).retryable);
        assert_eq!(
            UpstreamError::from_status(401, "", None).key_fault,
            KeyFault::Invalid
        );
    }

    #[test]
    fn parses_data_urls() {
        assert_eq!(
            parse_data_url("data:image/png;base64,QUJD"),
            Some(("image/png".into(), "QUJD".into()))
        );
        assert_eq!(parse_data_url("https://x/y.png"), None);
    }
}
