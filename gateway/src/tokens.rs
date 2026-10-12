//! Lightweight token estimation used for pre-flight checks (TPM limits, cost routing,
//! balance checks) and as a fallback when an upstream omits usage.
//! Heuristic: ~4 ASCII chars per token, ~1 token per CJK character, +4 tokens per message.

use crate::types::{ChatRequest, Content};

pub fn estimate_text(text: &str) -> u32 {
    let mut ascii = 0u32;
    let mut wide = 0u32;
    for c in text.chars() {
        if c.is_ascii() {
            ascii += 1;
        } else {
            wide += 1;
        }
    }
    ascii.div_ceil(4) + wide
}

pub fn estimate_prompt(req: &ChatRequest) -> u32 {
    let mut total = 3u32;
    for m in &req.messages {
        total += 4;
        if let Some(c) = &m.content {
            total += estimate_text(&c.text());
            if let Content::Parts(parts) = c {
                // Rough flat cost per image (providers bill 85-1600 tokens depending on size).
                total += parts.iter().filter(|p| p.kind == "image_url").count() as u32 * 800;
            }
        }
        if let Some(calls) = &m.tool_calls {
            for tc in calls {
                total += estimate_text(&tc.function.name) + estimate_text(&tc.function.arguments);
            }
        }
    }
    if let Some(tools) = &req.tools {
        total += estimate_text(&serde_json::to_string(tools).unwrap_or_default());
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimates_ascii_and_cjk() {
        assert_eq!(estimate_text("abcd"), 1);
        assert_eq!(estimate_text("abcde"), 2);
        assert_eq!(estimate_text("你好世界"), 4);
        assert_eq!(estimate_text(""), 0);
    }
}
