//! Anthropic Messages API adapter.

use std::collections::HashMap;

use futures::StreamExt;
use serde_json::{json, Value};

use super::{parse_data_url, send, sse, ChunkStream, UpstreamCall, UpstreamError};
use crate::types::*;

const API_VERSION: &str = "2023-06-01";
const DEFAULT_MAX_TOKENS: u32 = 4096;

fn image_block(url: &str) -> Value {
    match parse_data_url(url) {
        Some((mime, data)) => {
            json!({"type": "image", "source": {"type": "base64", "media_type": mime, "data": data}})
        }
        None => json!({"type": "image", "source": {"type": "url", "url": url}}),
    }
}

fn user_blocks(content: &Option<Content>) -> Vec<Value> {
    match content {
        None => vec![],
        Some(Content::Text(t)) if t.trim().is_empty() => vec![],
        Some(Content::Text(t)) => vec![json!({"type": "text", "text": t})],
        Some(Content::Parts(parts)) => parts
            .iter()
            .filter_map(|p| match p.kind.as_str() {
                "text" => p
                    .text
                    .as_ref()
                    .filter(|t| !t.trim().is_empty())
                    .map(|t| json!({"type": "text", "text": t})),
                "image_url" => p.image_url.as_ref().map(|i| image_block(&i.url)),
                _ => None,
            })
            .collect(),
    }
}

pub(crate) fn map_tool_choice(tc: &Value) -> Option<Value> {
    match tc {
        Value::String(s) if s == "auto" => Some(json!({"type": "auto"})),
        Value::String(s) if s == "required" => Some(json!({"type": "any"})),
        Value::String(s) if s == "none" => Some(json!({"type": "none"})),
        Value::Object(_) => tc
            .pointer("/function/name")
            .and_then(Value::as_str)
            .map(|n| json!({"type": "tool", "name": n})),
        _ => None,
    }
}

pub(crate) fn build_body(call: &UpstreamCall<'_>, stream: bool) -> Value {
    let req = call.req;
    let mut system: Vec<String> = Vec::new();
    let mut messages: Vec<(String, Vec<Value>)> = Vec::new();

    let mut push = |role: &str, blocks: Vec<Value>| {
        if blocks.is_empty() {
            return;
        }
        match messages.last_mut() {
            Some((r, b)) if r == role => b.extend(blocks),
            _ => messages.push((role.to_string(), blocks)),
        }
    };

    for m in &req.messages {
        match m.role.as_str() {
            "system" | "developer" => {
                if let Some(c) = &m.content {
                    system.push(c.text());
                }
            }
            "assistant" => {
                let mut blocks = Vec::new();
                if let Some(c) = &m.content {
                    let t = c.text();
                    if !t.is_empty() {
                        blocks.push(json!({"type": "text", "text": t}));
                    }
                }
                for tc in m.tool_calls.iter().flatten() {
                    let input: Value =
                        serde_json::from_str(&tc.function.arguments).unwrap_or_else(|_| json!({}));
                    blocks.push(json!({"type": "tool_use", "id": tc.id, "name": tc.function.name, "input": input}));
                }
                push("assistant", blocks);
            }
            "tool" => {
                let text = m.content.as_ref().map(|c| c.text()).unwrap_or_default();
                push(
                    "user",
                    vec![
                        json!({"type": "tool_result", "tool_use_id": m.tool_call_id.clone().unwrap_or_default(), "content": text}),
                    ],
                );
            }
            _ => push("user", user_blocks(&m.content)),
        }
    }

    let mut body = json!({
        "model": call.upstream_model,
        "max_tokens": req.max_output().unwrap_or(DEFAULT_MAX_TOKENS),
        "messages": messages.into_iter().map(|(role, content)| json!({"role": role, "content": content})).collect::<Vec<_>>(),
        "stream": stream,
    });
    let obj = body.as_object_mut().unwrap();
    if !system.is_empty() {
        obj.insert("system".into(), json!(system.join("\n\n")));
    }
    if let Some(t) = req.temperature {
        obj.insert("temperature".into(), json!(t.clamp(0.0, 1.0)));
    }
    // Recent Claude models reject requests that set both temperature and top_p.
    if let (None, Some(p)) = (req.temperature, req.top_p) {
        obj.insert("top_p".into(), json!(p));
    }
    let stops = req.stop_list();
    if !stops.is_empty() {
        obj.insert("stop_sequences".into(), json!(stops));
    }
    if let Some(tools) = &req.tools {
        let tools: Vec<Value> = tools
            .iter()
            .map(|t| {
                json!({
                    "name": t.function.name,
                    "description": t.function.description.clone().unwrap_or_default(),
                    "input_schema": t.function.parameters.clone().unwrap_or_else(|| json!({"type": "object", "properties": {}})),
                })
            })
            .collect();
        obj.insert("tools".into(), json!(tools));
        if let Some(tc) = req.tool_choice.as_ref().and_then(map_tool_choice) {
            obj.insert("tool_choice".into(), tc);
        }
    }
    if let Some(user) = &req.user {
        obj.insert("metadata".into(), json!({"user_id": user}));
    }
    body
}

pub(crate) fn map_stop_reason(r: &str) -> String {
    match r {
        "max_tokens" => "length",
        "tool_use" => "tool_calls",
        "refusal" => "content_filter",
        _ => "stop",
    }
    .to_string()
}

fn input_tokens(usage: &Value) -> u32 {
    [
        "input_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
    ]
    .iter()
    .filter_map(|k| usage.get(*k).and_then(Value::as_u64))
    .sum::<u64>() as u32
}

pub(crate) fn parse_response(v: &Value, model: &str) -> ChatResponse {
    let mut text = String::new();
    let mut tool_calls = Vec::new();
    for block in v
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        match block.get("type").and_then(Value::as_str) {
            Some("text") => text.push_str(block.get("text").and_then(Value::as_str).unwrap_or("")),
            Some("tool_use") => tool_calls.push(ToolCall {
                id: block
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                kind: "function".into(),
                function: FunctionCall {
                    name: block
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    arguments: block
                        .get("input")
                        .map(|i| i.to_string())
                        .unwrap_or_else(|| "{}".into()),
                },
            }),
            _ => {}
        }
    }
    let usage = v.get("usage").cloned().unwrap_or(Value::Null);
    let completion = usage
        .get("output_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0) as u32;
    ChatResponse {
        id: new_completion_id(),
        object: "chat.completion".into(),
        created: now_ts(),
        model: model.to_string(),
        choices: vec![Choice {
            index: 0,
            message: ResponseMessage {
                role: "assistant".into(),
                content: Some(text),
                tool_calls: if tool_calls.is_empty() {
                    None
                } else {
                    Some(tool_calls)
                },
            },
            finish_reason: v
                .get("stop_reason")
                .and_then(Value::as_str)
                .map(map_stop_reason),
        }],
        usage: Some(Usage::new(input_tokens(&usage), completion)),
    }
}

fn request(
    http: &reqwest::Client,
    call: &UpstreamCall<'_>,
    stream: bool,
) -> reqwest::RequestBuilder {
    http.post(format!(
        "{}/v1/messages",
        call.base_url.trim_end_matches('/')
    ))
    .header("x-api-key", call.api_key)
    .header("anthropic-version", API_VERSION)
    .timeout(call.timeout)
    .json(&build_body(call, stream))
}

pub async fn chat(
    http: &reqwest::Client,
    call: &UpstreamCall<'_>,
) -> Result<ChatResponse, UpstreamError> {
    let resp = send(request(http, call, false)).await?;
    let v: Value = resp
        .json()
        .await
        .map_err(|e| UpstreamError::decode(e.to_string()))?;
    Ok(parse_response(&v, call.upstream_model))
}

pub async fn chat_stream(
    http: &reqwest::Client,
    call: &UpstreamCall<'_>,
) -> Result<ChunkStream, UpstreamError> {
    let resp = send(request(http, call, true)).await?;
    let model = call.upstream_model.to_string();
    let events = sse::events(resp.bytes_stream());
    let stream = async_stream::stream! {
        let id = new_completion_id();
        let created = now_ts();
        let mut prompt_tokens = 0u32;
        let mut completion_tokens = 0u32;
        let mut finish: Option<String> = None;
        // content block index -> tool call index
        let mut tool_index: HashMap<u64, u32> = HashMap::new();
        futures::pin_mut!(events);
        while let Some(ev) = events.next().await {
            let ev = match ev { Ok(e) => e, Err(e) => { yield Err(e); return; } };
            let v: Value = match serde_json::from_str(&ev.data) { Ok(v) => v, Err(_) => continue };
            let kind = v.get("type").and_then(Value::as_str).unwrap_or_default();
            match kind {
                "message_start" => {
                    if let Some(u) = v.pointer("/message/usage") { prompt_tokens = input_tokens(u); }
                    yield Ok(ChatChunk::new(&id, &model, created)
                        .delta(Delta { role: Some("assistant".into()), content: Some(String::new()), ..Default::default() }, None));
                }
                "content_block_start" => {
                    let block = v.get("content_block").cloned().unwrap_or(Value::Null);
                    if block.get("type").and_then(Value::as_str) == Some("tool_use") {
                        let bidx = v.get("index").and_then(Value::as_u64).unwrap_or(0);
                        let tidx = tool_index.len() as u32;
                        tool_index.insert(bidx, tidx);
                        let delta = Delta { tool_calls: Some(vec![ToolCallDelta {
                            index: tidx,
                            id: block.get("id").and_then(Value::as_str).map(String::from),
                            kind: Some("function".into()),
                            function: Some(FunctionCallDelta {
                                name: block.get("name").and_then(Value::as_str).map(String::from),
                                arguments: Some(String::new()),
                            }),
                        }]), ..Default::default() };
                        yield Ok(ChatChunk::new(&id, &model, created).delta(delta, None));
                    }
                }
                "content_block_delta" => {
                    let d = v.get("delta").cloned().unwrap_or(Value::Null);
                    match d.get("type").and_then(Value::as_str) {
                        Some("text_delta") => {
                            let t = d.get("text").and_then(Value::as_str).unwrap_or("");
                            yield Ok(ChatChunk::text(&id, &model, created, t));
                        }
                        Some("input_json_delta") => {
                            let bidx = v.get("index").and_then(Value::as_u64).unwrap_or(0);
                            let tidx = *tool_index.get(&bidx).unwrap_or(&0);
                            let delta = Delta { tool_calls: Some(vec![ToolCallDelta {
                                index: tidx, id: None, kind: None,
                                function: Some(FunctionCallDelta {
                                    name: None,
                                    arguments: d.get("partial_json").and_then(Value::as_str).map(String::from),
                                }),
                            }]), ..Default::default() };
                            yield Ok(ChatChunk::new(&id, &model, created).delta(delta, None));
                        }
                        _ => {}
                    }
                }
                "message_delta" => {
                    if let Some(r) = v.pointer("/delta/stop_reason").and_then(Value::as_str) { finish = Some(map_stop_reason(r)); }
                    if let Some(o) = v.pointer("/usage/output_tokens").and_then(Value::as_u64) { completion_tokens = o as u32; }
                }
                "message_stop" => break,
                "error" => {
                    let msg = v.pointer("/error/message").and_then(Value::as_str).unwrap_or("upstream stream error");
                    yield Err(UpstreamError::network(msg.to_string()));
                    return;
                }
                _ => {}
            }
        }
        let mut last = ChatChunk::new(&id, &model, created).delta(Delta::default(), Some(finish.unwrap_or_else(|| "stop".into())));
        last.usage = Some(Usage::new(prompt_tokens, completion_tokens));
        yield Ok(last);
    };
    Ok(Box::pin(stream))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::ProviderKind;
    use std::time::Duration;

    fn call_for(req: &ChatRequest, cfg: &Value) -> Value {
        let call = UpstreamCall {
            kind: ProviderKind::Anthropic,
            base_url: "https://api.anthropic.com",
            api_key: "k",
            upstream_model: "claude-x",
            timeout: Duration::from_secs(1),
            config: cfg,
            req,
        };
        build_body(&call, false)
    }

    #[test]
    fn translates_system_tools_and_tool_results() {
        let req: ChatRequest = serde_json::from_value(json!({
            "model": "m",
            "messages": [
                {"role": "system", "content": "sys"},
                {"role": "user", "content": "weather?"},
                {"role": "assistant", "content": null, "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "get_weather", "arguments": "{\"city\":\"Taipei\"}"}}]},
                {"role": "tool", "tool_call_id": "call_1", "content": "sunny"},
                {"role": "user", "content": "thanks"}
            ],
            "tools": [{"type": "function", "function": {"name": "get_weather", "parameters": {"type": "object"}}}],
            "tool_choice": "required",
            "temperature": 1.5,
            "top_p": 1,
            "stop": "END"
        }))
        .unwrap();
        let body = call_for(&req, &json!({}));
        assert_eq!(body["system"], "sys");
        assert_eq!(body["max_tokens"], 4096);
        assert_eq!(body["temperature"], 1.0);
        assert!(body.get("top_p").is_none());
        assert_eq!(body["stop_sequences"][0], "END");
        assert_eq!(body["tool_choice"]["type"], "any");
        let msgs = body["messages"].as_array().unwrap();
        assert_eq!(msgs.len(), 3); // user, assistant, user(tool_result + text merged)
        assert_eq!(msgs[1]["content"][0]["type"], "tool_use");
        assert_eq!(msgs[1]["content"][0]["input"]["city"], "Taipei");
        assert_eq!(msgs[2]["content"][0]["type"], "tool_result");
        assert_eq!(msgs[2]["content"][1]["text"], "thanks");
    }

    #[test]
    fn parses_tool_use_response() {
        let v = json!({
            "content": [{"type": "text", "text": "ok"}, {"type": "tool_use", "id": "tu1", "name": "f", "input": {"a": 1}}],
            "stop_reason": "tool_use",
            "usage": {"input_tokens": 10, "cache_read_input_tokens": 5, "output_tokens": 7}
        });
        let r = parse_response(&v, "claude-x");
        assert_eq!(r.choices[0].finish_reason.as_deref(), Some("tool_calls"));
        assert_eq!(
            r.choices[0].message.tool_calls.as_ref().unwrap()[0]
                .function
                .arguments,
            "{\"a\":1}"
        );
        assert_eq!(r.usage.unwrap(), Usage::new(15, 7));
    }
}
