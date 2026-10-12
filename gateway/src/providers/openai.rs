//! OpenAI and OpenAI-compatible upstreams (OpenAI, DeepSeek, Mistral, Groq, xAI, OpenRouter, vLLM, ...).

use futures::StreamExt;
use serde_json::{json, Value};

use super::{send, sse, ChunkStream, UpstreamCall, UpstreamError};
use crate::types::{ChatChunk, ChatResponse};

fn build_body(call: &UpstreamCall<'_>, stream: bool) -> Value {
    let mut body = serde_json::to_value(call.req).unwrap_or_else(|_| json!({}));
    let obj = body.as_object_mut().expect("request is an object");
    obj.insert("model".into(), json!(call.upstream_model));
    obj.insert("stream".into(), json!(stream));
    obj.remove("stream_options");
    if stream
        && call
            .config
            .get("stream_usage")
            .and_then(Value::as_bool)
            .unwrap_or(true)
    {
        obj.insert("stream_options".into(), json!({ "include_usage": true }));
    }
    body
}

fn endpoint(call: &UpstreamCall<'_>) -> String {
    format!("{}/chat/completions", call.base_url.trim_end_matches('/'))
}

pub async fn chat(
    http: &reqwest::Client,
    call: &UpstreamCall<'_>,
) -> Result<ChatResponse, UpstreamError> {
    let resp = send(
        http.post(endpoint(call))
            .bearer_auth(call.api_key)
            .timeout(call.timeout)
            .json(&build_body(call, false)),
    )
    .await?;
    let text = resp.text().await.map_err(UpstreamError::from_reqwest)?;
    serde_json::from_str::<ChatResponse>(&text)
        .map_err(|e| UpstreamError::decode(format!("invalid upstream response: {e}")))
}

pub async fn chat_stream(
    http: &reqwest::Client,
    call: &UpstreamCall<'_>,
) -> Result<ChunkStream, UpstreamError> {
    let resp = send(
        http.post(endpoint(call))
            .bearer_auth(call.api_key)
            .timeout(call.timeout)
            .json(&build_body(call, true)),
    )
    .await?;
    let events = sse::events(resp.bytes_stream());
    let stream = events
        .take_while(|ev| futures::future::ready(!matches!(ev, Ok(e) if e.data.trim() == "[DONE]")))
        .filter_map(|ev| async move {
            match ev {
                Err(e) => Some(Err(e)),
                Ok(e) => match serde_json::from_str::<ChatChunk>(&e.data) {
                    Ok(chunk) => Some(Ok(chunk)),
                    Err(_) => {
                        // Some providers stream error objects mid-response.
                        let v: Value = serde_json::from_str(&e.data).ok()?;
                        let msg = v.pointer("/error/message").and_then(Value::as_str)?;
                        Some(Err(UpstreamError::network(msg.to_string())))
                    }
                },
            }
        });
    Ok(Box::pin(stream))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::ProviderKind;
    use crate::types::ChatRequest;
    use std::time::Duration;

    #[test]
    fn rewrites_model_and_stream_options() {
        let req: ChatRequest = serde_json::from_value(json!({
            "model": "hub-gpt-4o", "messages": [{"role": "user", "content": "hi"}], "seed": 1
        }))
        .unwrap();
        let cfg = json!({});
        let call = UpstreamCall {
            kind: ProviderKind::OpenAi,
            base_url: "https://api.openai.com/v1/",
            api_key: "k",
            upstream_model: "gpt-4o",
            timeout: Duration::from_secs(1),
            config: &cfg,
            req: &req,
        };
        let body = build_body(&call, true);
        assert_eq!(body["model"], "gpt-4o");
        assert_eq!(body["seed"], 1);
        assert_eq!(body["stream_options"]["include_usage"], true);
        assert_eq!(
            endpoint(&call),
            "https://api.openai.com/v1/chat/completions"
        );
    }
}
