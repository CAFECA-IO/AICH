//! Google Gemini (Generative Language API) adapter.

use std::collections::HashMap;

use futures::StreamExt;
use serde_json::{json, Map, Value};

use super::{parse_data_url, send, sse, ChunkStream, UpstreamCall, UpstreamError};
use crate::types::*;

/// Gemini accepts an OpenAPI-style subset of JSON Schema. Drop unsupported keywords (only at
/// keyword positions — never property names inside `properties`) and inline local `$ref`s.
pub(crate) fn clean_schema(v: &Value) -> Value {
    let defs = v
        .get("$defs")
        .or_else(|| v.get("definitions"))
        .cloned()
        .unwrap_or(Value::Null);
    clean_node(v, &defs, 0)
}

const SCHEMA_DROP: [&str; 6] = [
    "$schema",
    "additionalProperties",
    "strict",
    "$defs",
    "definitions",
    "default",
];

fn clean_node(v: &Value, defs: &Value, depth: u32) -> Value {
    if depth > 16 {
        return json!({"type": "object"});
    }
    let Value::Object(m) = v else {
        return v.clone();
    };
    if let Some(r) = m.get("$ref").and_then(Value::as_str) {
        let name = r.rsplit('/').next().unwrap_or("");
        return match defs.get(name) {
            Some(target) => clean_node(target, defs, depth + 1),
            None => json!({"type": "object"}),
        };
    }
    let mut out = Map::new();
    for (k, val) in m {
        if SCHEMA_DROP.contains(&k.as_str()) {
            continue;
        }
        let cleaned = match (k.as_str(), val) {
            ("properties", Value::Object(props)) => Value::Object(
                props
                    .iter()
                    .map(|(name, s)| (name.clone(), clean_node(s, defs, depth + 1)))
                    .collect(),
            ),
            ("items" | "anyOf" | "oneOf" | "allOf" | "not", _) => match val {
                Value::Array(a) => {
                    Value::Array(a.iter().map(|x| clean_node(x, defs, depth + 1)).collect())
                }
                other => clean_node(other, defs, depth + 1),
            },
            _ => val.clone(),
        };
        out.insert(k.clone(), cleaned);
    }
    Value::Object(out)
}

/// Gemini 3 attaches a `thoughtSignature` to function calls that must be echoed back in the
/// next turn. We carry it inside the OpenAI tool_call id, which clients return verbatim.
const SIG_SEP: &str = "__sig_";

fn image_part(url: &str) -> Value {
    match parse_data_url(url) {
        Some((mime, data)) => json!({"inlineData": {"mimeType": mime, "data": data}}),
        None => {
            let mime = if url.ends_with(".png") {
                "image/png"
            } else if url.ends_with(".webp") {
                "image/webp"
            } else {
                "image/jpeg"
            };
            json!({"fileData": {"mimeType": mime, "fileUri": url}})
        }
    }
}

pub(crate) fn build_body(call: &UpstreamCall<'_>) -> Value {
    let req = call.req;
    let mut system: Vec<String> = Vec::new();
    let mut contents: Vec<(String, Vec<Value>)> = Vec::new();
    let mut tool_names: HashMap<String, String> = HashMap::new();

    let mut push = |role: &str, parts: Vec<Value>| {
        if parts.is_empty() {
            return;
        }
        match contents.last_mut() {
            Some((r, p)) if r == role => p.extend(parts),
            _ => contents.push((role.to_string(), parts)),
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
                let mut parts = Vec::new();
                if let Some(c) = &m.content {
                    let t = c.text();
                    if !t.is_empty() {
                        parts.push(json!({"text": t}));
                    }
                }
                for tc in m.tool_calls.iter().flatten() {
                    tool_names.insert(tc.id.clone(), tc.function.name.clone());
                    let args: Value =
                        serde_json::from_str(&tc.function.arguments).unwrap_or_else(|_| json!({}));
                    let mut part =
                        json!({"functionCall": {"name": tc.function.name, "args": args}});
                    if let Some((_, sig)) = tc.id.split_once(SIG_SEP) {
                        part["thoughtSignature"] = json!(sig);
                    }
                    parts.push(part);
                }
                push("model", parts);
            }
            "tool" => {
                let id = m.tool_call_id.clone().unwrap_or_default();
                let name = m
                    .name
                    .clone()
                    .or_else(|| tool_names.get(&id).cloned())
                    .unwrap_or_else(|| "tool".into());
                let text = m.content.as_ref().map(|c| c.text()).unwrap_or_default();
                let response = match serde_json::from_str::<Value>(&text) {
                    Ok(v @ Value::Object(_)) => v,
                    _ => json!({"content": text}),
                };
                push(
                    "user",
                    vec![json!({"functionResponse": {"name": name, "response": response}})],
                );
            }
            _ => {
                let parts = match &m.content {
                    None => vec![],
                    Some(Content::Text(t)) => vec![json!({"text": t})],
                    Some(Content::Parts(ps)) => ps
                        .iter()
                        .filter_map(|p| match p.kind.as_str() {
                            "text" => p.text.as_ref().map(|t| json!({"text": t})),
                            "image_url" => p.image_url.as_ref().map(|i| image_part(&i.url)),
                            _ => None,
                        })
                        .collect(),
                };
                push("user", parts);
            }
        }
    }

    let mut gen = Map::new();
    if let Some(t) = req.temperature {
        gen.insert("temperature".into(), json!(t));
    }
    if let Some(p) = req.top_p {
        gen.insert("topP".into(), json!(p));
    }
    if let Some(m) = req.max_output() {
        gen.insert("maxOutputTokens".into(), json!(m));
    }
    let stops = req.stop_list();
    if !stops.is_empty() {
        gen.insert("stopSequences".into(), json!(stops));
    }
    if let Some(rf) = &req.response_format {
        match rf.get("type").and_then(Value::as_str) {
            Some("json_object") => {
                gen.insert("responseMimeType".into(), json!("application/json"));
            }
            Some("json_schema") => {
                gen.insert("responseMimeType".into(), json!("application/json"));
                if let Some(s) = rf.pointer("/json_schema/schema") {
                    gen.insert("responseSchema".into(), clean_schema(s));
                }
            }
            _ => {}
        }
    }

    let mut body = json!({
        "contents": contents.into_iter().map(|(role, parts)| json!({"role": role, "parts": parts})).collect::<Vec<_>>(),
    });
    let obj = body.as_object_mut().unwrap();
    if !system.is_empty() {
        obj.insert(
            "systemInstruction".into(),
            json!({"parts": [{"text": system.join("\n\n")}]}),
        );
    }
    if !gen.is_empty() {
        obj.insert("generationConfig".into(), Value::Object(gen));
    }
    if let Some(tools) = &req.tools {
        let decls: Vec<Value> = tools
            .iter()
            .map(|t| {
                let mut d = json!({"name": t.function.name, "description": t.function.description.clone().unwrap_or_default()});
                if let Some(p) = &t.function.parameters {
                    d["parameters"] = clean_schema(p);
                }
                d
            })
            .collect();
        obj.insert("tools".into(), json!([{"functionDeclarations": decls}]));
        if let Some(tc) = &req.tool_choice {
            let mode = match tc {
                Value::String(s) if s == "none" => Some(json!({"mode": "NONE"})),
                Value::String(s) if s == "required" => Some(json!({"mode": "ANY"})),
                Value::Object(_) => tc
                    .pointer("/function/name")
                    .and_then(Value::as_str)
                    .map(|n| json!({"mode": "ANY", "allowedFunctionNames": [n]})),
                _ => None,
            };
            if let Some(m) = mode {
                obj.insert("toolConfig".into(), json!({"functionCallingConfig": m}));
            }
        }
    }
    body
}

pub(crate) fn map_finish(r: &str) -> String {
    match r {
        "MAX_TOKENS" => "length",
        "SAFETY" | "RECITATION" | "BLOCKLIST" | "PROHIBITED_CONTENT" | "SPII" => "content_filter",
        _ => "stop",
    }
    .to_string()
}

fn usage_of(v: &Value) -> Option<Usage> {
    let u = v.get("usageMetadata")?;
    let p = u
        .get("promptTokenCount")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let c = u
        .get("candidatesTokenCount")
        .and_then(Value::as_u64)
        .unwrap_or(0)
        + u.get("thoughtsTokenCount")
            .and_then(Value::as_u64)
            .unwrap_or(0);
    Some(Usage::new(p as u32, c as u32))
}

/// Extract (text, tool_calls, finish_reason) from one generateContent payload.
fn extract(v: &Value) -> (String, Vec<ToolCall>, Option<String>) {
    let cand = v.pointer("/candidates/0").cloned().unwrap_or(Value::Null);
    let mut text = String::new();
    let mut calls = Vec::new();
    for part in cand
        .pointer("/content/parts")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if part
            .get("thought")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }
        if let Some(t) = part.get("text").and_then(Value::as_str) {
            text.push_str(t);
        }
        if let Some(fc) = part.get("functionCall") {
            let mut id = format!("call_{}", uuid::Uuid::new_v4().simple());
            if let Some(sig) = part.get("thoughtSignature").and_then(Value::as_str) {
                id = format!("{id}{SIG_SEP}{sig}");
            }
            calls.push(ToolCall {
                id,
                kind: "function".into(),
                function: FunctionCall {
                    name: fc
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    arguments: fc
                        .get("args")
                        .map(|a| a.to_string())
                        .unwrap_or_else(|| "{}".into()),
                },
            });
        }
    }
    let finish = cand
        .get("finishReason")
        .and_then(Value::as_str)
        .map(map_finish);
    (text, calls, finish)
}

fn url(call: &UpstreamCall<'_>, stream: bool) -> String {
    let base = call.base_url.trim_end_matches('/');
    if stream {
        format!(
            "{base}/v1beta/models/{}:streamGenerateContent?alt=sse",
            call.upstream_model
        )
    } else {
        format!(
            "{base}/v1beta/models/{}:generateContent",
            call.upstream_model
        )
    }
}

pub async fn chat(
    http: &reqwest::Client,
    call: &UpstreamCall<'_>,
) -> Result<ChatResponse, UpstreamError> {
    let resp = send(
        http.post(url(call, false))
            .header("x-goog-api-key", call.api_key)
            .timeout(call.timeout)
            .json(&build_body(call)),
    )
    .await?;
    let v: Value = resp
        .json()
        .await
        .map_err(|e| UpstreamError::decode(e.to_string()))?;
    if v.get("candidates")
        .and_then(Value::as_array)
        .map(|a| a.is_empty())
        .unwrap_or(true)
    {
        let reason = v
            .pointer("/promptFeedback/blockReason")
            .and_then(Value::as_str)
            .unwrap_or("no candidates");
        return Err(UpstreamError {
            status: Some(400),
            message: format!("gemini blocked: {reason}"),
            retryable: false,
            key_fault: super::KeyFault::None,
        });
    }
    let (text, calls, finish) = extract(&v);
    let finish = if !calls.is_empty() {
        Some("tool_calls".to_string())
    } else {
        finish
    };
    Ok(ChatResponse {
        id: new_completion_id(),
        object: "chat.completion".into(),
        created: now_ts(),
        model: call.upstream_model.to_string(),
        choices: vec![Choice {
            index: 0,
            message: ResponseMessage {
                role: "assistant".into(),
                content: Some(text),
                tool_calls: if calls.is_empty() { None } else { Some(calls) },
            },
            finish_reason: finish,
        }],
        usage: usage_of(&v),
    })
}

pub async fn chat_stream(
    http: &reqwest::Client,
    call: &UpstreamCall<'_>,
) -> Result<ChunkStream, UpstreamError> {
    let resp = send(
        http.post(url(call, true))
            .header("x-goog-api-key", call.api_key)
            .timeout(call.timeout)
            .json(&build_body(call)),
    )
    .await?;
    let model = call.upstream_model.to_string();
    let events = sse::events(resp.bytes_stream());
    let stream = async_stream::stream! {
        let id = new_completion_id();
        let created = now_ts();
        let mut usage: Option<Usage> = None;
        let mut finish: Option<String> = None;
        let mut tool_idx = 0u32;
        let mut first = true;
        futures::pin_mut!(events);
        while let Some(ev) = events.next().await {
            let ev = match ev { Ok(e) => e, Err(e) => { yield Err(e); return; } };
            let v: Value = match serde_json::from_str(&ev.data) { Ok(v) => v, Err(_) => continue };
            if let Some(msg) = v.pointer("/error/message").and_then(Value::as_str) {
                yield Err(UpstreamError::network(msg.to_string()));
                return;
            }
            if let Some(u) = usage_of(&v) { usage = Some(u); }
            let (text, calls, f) = extract(&v);
            if f.is_some() { finish = f; }
            if !text.is_empty() || first {
                let mut d = Delta { content: Some(text), ..Default::default() };
                if first { d.role = Some("assistant".into()); first = false; }
                yield Ok(ChatChunk::new(&id, &model, created).delta(d, None));
            }
            if !calls.is_empty() {
                finish = Some("tool_calls".into());
                let deltas = calls.into_iter().map(|c| {
                    let d = ToolCallDelta {
                        index: tool_idx, id: Some(c.id), kind: Some("function".into()),
                        function: Some(FunctionCallDelta { name: Some(c.function.name), arguments: Some(c.function.arguments) }),
                    };
                    tool_idx += 1;
                    d
                }).collect();
                yield Ok(ChatChunk::new(&id, &model, created).delta(Delta { tool_calls: Some(deltas), ..Default::default() }, None));
            }
        }
        // A later STOP chunk must not hide that the model asked for tool calls.
        if tool_idx > 0 { finish = Some("tool_calls".into()); }
        let mut last = ChatChunk::new(&id, &model, created).delta(Delta::default(), Some(finish.unwrap_or_else(|| "stop".into())));
        last.usage = usage;
        yield Ok(last);
    };
    Ok(Box::pin(stream))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::ProviderKind;
    use std::time::Duration;

    #[test]
    fn translates_request() {
        let req: ChatRequest = serde_json::from_value(json!({
            "model": "m",
            "messages": [
                {"role": "system", "content": "sys"},
                {"role": "user", "content": [{"type": "text", "text": "see"}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,QQ=="}}]},
                {"role": "assistant", "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "f", "arguments": "{\"x\":1}"}}]},
                {"role": "tool", "tool_call_id": "c1", "content": "{\"ok\":true}"}
            ],
            "max_tokens": 100,
            "tools": [{"type": "function", "function": {"name": "f", "parameters": {"type": "object", "additionalProperties": false, "properties": {"x": {"type": "number"}}}}}],
            "response_format": {"type": "json_object"}
        }))
        .unwrap();
        let cfg = json!({});
        let call = UpstreamCall {
            kind: ProviderKind::Gemini,
            base_url: "https://g",
            api_key: "k",
            upstream_model: "gemini-x",
            timeout: Duration::from_secs(1),
            config: &cfg,
            req: &req,
        };
        let b = build_body(&call);
        assert_eq!(b["systemInstruction"]["parts"][0]["text"], "sys");
        assert_eq!(
            b["contents"][0]["parts"][1]["inlineData"]["mimeType"],
            "image/png"
        );
        assert_eq!(b["contents"][1]["role"], "model");
        assert_eq!(b["contents"][1]["parts"][0]["functionCall"]["args"]["x"], 1);
        assert_eq!(
            b["contents"][2]["parts"][0]["functionResponse"]["name"],
            "f"
        );
        assert_eq!(
            b["contents"][2]["parts"][0]["functionResponse"]["response"]["ok"],
            true
        );
        assert_eq!(b["generationConfig"]["maxOutputTokens"], 100);
        assert_eq!(
            b["generationConfig"]["responseMimeType"],
            "application/json"
        );
        assert!(b["tools"][0]["functionDeclarations"][0]["parameters"]
            .get("additionalProperties")
            .is_none());
        assert_eq!(
            url(&call, true),
            "https://g/v1beta/models/gemini-x:streamGenerateContent?alt=sse"
        );
    }

    #[test]
    fn schema_cleaning_keeps_property_names_and_inlines_refs() {
        let s = json!({
            "$schema": "x", "type": "object", "additionalProperties": false,
            "properties": {
                "default": {"type": "string", "default": "a"},
                "strict": {"type": "boolean"},
                "item": {"$ref": "#/$defs/Item"}
            },
            "required": ["default", "strict"],
            "$defs": {"Item": {"type": "object", "properties": {"n": {"type": "integer"}}, "additionalProperties": false}}
        });
        let c = clean_schema(&s);
        assert!(
            c.get("$schema").is_none()
                && c.get("additionalProperties").is_none()
                && c.get("$defs").is_none()
        );
        assert!(c["properties"].get("default").is_some());
        assert!(c["properties"]["default"].get("default").is_none());
        assert!(c["properties"].get("strict").is_some());
        assert_eq!(
            c["properties"]["item"]["properties"]["n"]["type"],
            "integer"
        );
        assert!(c["properties"]["item"]
            .get("additionalProperties")
            .is_none());
    }

    #[test]
    fn thought_signature_roundtrip() {
        let v = json!({"candidates": [{"content": {"parts": [{"functionCall": {"name": "f", "args": {}}, "thoughtSignature": "SIG123"}]}}]});
        let (_, calls, _) = extract(&v);
        assert!(calls[0].id.ends_with("__sig_SIG123"));
        let req: ChatRequest = serde_json::from_value(json!({
            "model": "m",
            "messages": [
                {"role": "user", "content": "hi"},
                {"role": "assistant", "tool_calls": [{"id": calls[0].id, "type": "function", "function": {"name": "f", "arguments": "{}"}}]},
                {"role": "tool", "tool_call_id": calls[0].id, "content": "ok"}
            ]
        })).unwrap();
        let cfg = json!({});
        let call = UpstreamCall {
            kind: ProviderKind::Gemini,
            base_url: "https://g",
            api_key: "k",
            upstream_model: "g",
            timeout: Duration::from_secs(1),
            config: &cfg,
            req: &req,
        };
        let b = build_body(&call);
        assert_eq!(b["contents"][1]["parts"][0]["thoughtSignature"], "SIG123");
        assert_eq!(
            b["contents"][2]["parts"][0]["functionResponse"]["name"],
            "f"
        );
    }

    #[test]
    fn extracts_response() {
        let v = json!({
            "candidates": [{"content": {"parts": [{"text": "thinking", "thought": true}, {"text": "Hello"}]}, "finishReason": "MAX_TOKENS"}],
            "usageMetadata": {"promptTokenCount": 3, "candidatesTokenCount": 4, "thoughtsTokenCount": 2}
        });
        let (t, c, f) = extract(&v);
        assert_eq!(t, "Hello");
        assert!(c.is_empty());
        assert_eq!(f.as_deref(), Some("length"));
        assert_eq!(usage_of(&v).unwrap(), Usage::new(3, 6));
    }
}
