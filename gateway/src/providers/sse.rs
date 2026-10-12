//! Minimal Server-Sent Events parser over an HTTP byte stream.

use bytes::Bytes;
use futures::{Stream, StreamExt};

use super::UpstreamError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseEvent {
    pub event: Option<String>,
    pub data: String,
}

/// Incremental parser, usable independently of the transport (and unit-testable).
#[derive(Default)]
pub struct SseParser {
    buf: String,
}

impl SseParser {
    pub fn push(&mut self, chunk: &str) -> Vec<SseEvent> {
        self.buf.push_str(&chunk.replace("\r\n", "\n"));
        let mut out = Vec::new();
        while let Some(pos) = self.buf.find("\n\n") {
            let block: String = self.buf.drain(..pos + 2).collect();
            if let Some(ev) = parse_block(&block) {
                out.push(ev);
            }
        }
        out
    }

    pub fn finish(&mut self) -> Option<SseEvent> {
        let block = std::mem::take(&mut self.buf);
        parse_block(&block)
    }
}

fn parse_block(block: &str) -> Option<SseEvent> {
    let mut event = None;
    let mut data: Vec<&str> = Vec::new();
    for line in block.lines() {
        if line.starts_with(':') {
            continue;
        }
        let (field, value) = match line.split_once(':') {
            Some((f, v)) => (f, v.strip_prefix(' ').unwrap_or(v)),
            None => (line, ""),
        };
        match field {
            "event" => event = Some(value.to_string()),
            "data" => data.push(value),
            _ => {}
        }
    }
    if data.is_empty() {
        return None;
    }
    Some(SseEvent {
        event,
        data: data.join("\n"),
    })
}

pub fn events<S>(body: S) -> impl Stream<Item = Result<SseEvent, UpstreamError>> + Send
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
{
    async_stream::stream! {
        let mut parser = SseParser::default();
        let mut pending: Vec<u8> = Vec::new();
        futures::pin_mut!(body);
        while let Some(chunk) = body.next().await {
            match chunk {
                Ok(bytes) => {
                    pending.extend_from_slice(&bytes);
                    // Only decode complete UTF-8 sequences; keep the tail for the next chunk.
                    let valid_up_to = match std::str::from_utf8(&pending) {
                        Ok(_) => pending.len(),
                        Err(e) => e.valid_up_to(),
                    };
                    let text = String::from_utf8_lossy(&pending[..valid_up_to]).into_owned();
                    pending.drain(..valid_up_to);
                    for ev in parser.push(&text) {
                        yield Ok(ev);
                    }
                }
                Err(e) => {
                    yield Err(UpstreamError::from_reqwest(e));
                    return;
                }
            }
        }
        if let Some(ev) = parser.finish() {
            yield Ok(ev);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_split_events() {
        let mut p = SseParser::default();
        assert!(p.push("event: message_start\ndata: {\"a\":").is_empty());
        let evs = p.push("1}\n\ndata: [DONE]\r\n\r\n");
        assert_eq!(evs.len(), 2);
        assert_eq!(evs[0].event.as_deref(), Some("message_start"));
        assert_eq!(evs[0].data, "{\"a\":1}");
        assert_eq!(evs[1].data, "[DONE]");
    }

    #[test]
    fn ignores_comments_and_handles_tail() {
        let mut p = SseParser::default();
        assert!(p.push(": ping\n\n").is_empty());
        assert!(p.push("data: tail").is_empty());
        assert_eq!(p.finish().unwrap().data, "tail");
    }
}
