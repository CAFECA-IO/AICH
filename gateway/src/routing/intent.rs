//! Fast, dependency-free intent classifier used by the `intent` routing strategy.
//! It runs on every request, so it is a heuristic (keywords + structure), not an LLM call.
//! Intents map to route tags: code | long_context | reasoning | vision | simple | general.

use once_cell::sync::Lazy;
use regex::Regex;

use crate::tokens;
use crate::types::ChatRequest;

pub const LONG_CONTEXT_TOKENS: u32 = 24_000;

static CODE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)
        ```|
        \b(def|class|import|function|const|let|var|return|async|await|struct|impl|fn|pub|package|interface)\s+\w|
        \b(select|insert|update|delete)\s+.+\b(from|into|set|where)\b|
        \b(traceback|stack\s*trace|exception|segfault|compile|compiler|syntax\s+error|null\s*pointer|regex|refactor|debug|unit\s+test|typescript|javascript|python|rust|golang|java|kotlin|swift|sql|dockerfile|kubernetes|api\s+endpoint)\b|
        (程式|程式碼|代碼|代码|除錯|调试|重構|重构|函式|函数|編譯|编译|報錯|报错|寫一個.*(腳本|脚本|程式))|
        [{};]\s*\n",
    )
    .unwrap()
});

static REASONING_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)
        \b(prove|proof|derive|step[-\s]by[-\s]step|reason|analy[sz]e|evaluate|compare|trade-?offs?|strategy|plan|calculate|equation|theorem|probability|optimi[sz]e)\b|
        (證明|证明|推導|推导|推理|分析|評估|评估|比較|比较|策略|規劃|规划|計算|计算|方程|機率|概率|最佳化|优化)",
    )
    .unwrap()
});

static SIMPLE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)
        \b(summari[sz]e|tl;?dr|translate|classify|categori[sz]e|extract|rewrite|paraphrase|fix\s+grammar|spell|sentiment|keywords?)\b|
        (摘要|總結|总结|翻譯|翻译|分類|分类|擷取|提取|改寫|改写|潤飾|润饰|情緒|情绪|關鍵字|关键词)",
    )
    .unwrap()
});

pub fn classify(req: &ChatRequest) -> &'static str {
    if req.has_images() {
        return "vision";
    }
    let prompt_tokens = tokens::estimate_prompt(req);
    if prompt_tokens >= LONG_CONTEXT_TOKENS {
        return "long_context";
    }
    // Weight the latest user turn most; include the system prompt for context.
    let last_user = req
        .messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .and_then(|m| m.content.as_ref())
        .map(|c| c.text())
        .unwrap_or_default();
    let system = req
        .messages
        .iter()
        .filter(|m| m.role == "system" || m.role == "developer")
        .filter_map(|m| m.content.as_ref().map(|c| c.text()))
        .collect::<Vec<_>>()
        .join("\n");
    let text = format!("{system}\n{last_user}");

    if req.tools.is_some() && CODE_RE.is_match(&text) {
        return "code";
    }
    if CODE_RE.is_match(&text) {
        return "code";
    }
    if REASONING_RE.is_match(&last_user) {
        return "reasoning";
    }
    if SIMPLE_RE.is_match(&last_user) || prompt_tokens < 15 {
        return "simple";
    }
    "general"
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn req(user: &str) -> ChatRequest {
        serde_json::from_value(
            json!({"model": "hub-auto", "messages": [{"role": "user", "content": user}]}),
        )
        .unwrap()
    }

    #[test]
    fn classifies_common_prompts() {
        assert_eq!(
            classify(&req("Fix this:\n```py\ndef f(x):\n  return x+\n```")),
            "code"
        );
        assert_eq!(
            classify(&req(
                "幫我寫一個 Python 腳本來整理檔案並且加上錯誤處理，越完整越好"
            )),
            "code"
        );
        assert_eq!(classify(&req("Please analyze the trade-offs between microservices and a monolith for a small team building a fintech product")), "reasoning");
        assert_eq!(classify(&req("請將以下這段話翻譯成英文：今天天氣很好，我們一起去公園散步，然後在附近的咖啡廳喝下午茶聊天。")), "simple");
        assert_eq!(classify(&req("hi")), "simple");
        assert_eq!(
            classify(&req("Tell me a story about a lighthouse keeper who befriends a whale during a long and lonely winter season")),
            "general"
        );
        let long = "lorem ipsum dolor ".repeat(6000);
        assert_eq!(classify(&req(&long)), "long_context");
    }

    #[test]
    fn detects_vision() {
        let r: ChatRequest = serde_json::from_value(json!({"model": "x", "messages": [{"role": "user", "content": [
            {"type": "text", "text": "what is this"}, {"type": "image_url", "image_url": {"url": "https://x/a.png"}}]}]}))
        .unwrap();
        assert_eq!(classify(&r), "vision");
    }
}
