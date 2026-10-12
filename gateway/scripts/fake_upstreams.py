#!/usr/bin/env python3
"""Fake OpenAI / Anthropic / Gemini HTTP endpoints that speak each vendor's real wire format.
Used to exercise the gateway adapters (including SSE parsing) without real API keys.
Run: python3 scripts/fake_upstreams.py 9100
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def sse(handler, events):
    handler.send_response(200)
    handler.send_header("content-type", "text/event-stream")
    handler.end_headers()
    for ev in events:
        handler.wfile.write(ev.encode())
        handler.wfile.flush()


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def body(self):
        n = int(self.headers.get("content-length", 0))
        return json.loads(self.rfile.read(n) or b"{}")

    def reply(self, obj, code=200):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        b = self.body()
        if self.path.endswith("/chat/completions"):  # OpenAI-compatible
            if self.headers.get("authorization") != "Bearer good-openai":
                return self.reply({"error": {"message": "bad key"}}, 401)
            if b.get("stream"):
                assert b.get("stream_options", {}).get("include_usage") is True
                ev = [
                    'data: {"id":"x","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":""}}]}\n\n',
                    'data: {"id":"x","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":"Hello "}}]}\n\n',
                    'data: {"id":"x","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":"from openai"},"finish_reason":"stop"}]}\n\n',
                    'data: {"id":"x","object":"chat.completion.chunk","created":1,"model":"m","choices":[],"usage":{"prompt_tokens":11,"completion_tokens":3,"total_tokens":14}}\n\n',
                    "data: [DONE]\n\n",
                ]
                return sse(self, ev)
            return self.reply({"id": "x", "object": "chat.completion", "created": 1, "model": b["model"],
                               "choices": [{"index": 0, "message": {"role": "assistant", "content": "Hello from openai"}, "finish_reason": "stop"}],
                               "usage": {"prompt_tokens": 11, "completion_tokens": 3, "total_tokens": 14}})
        if self.path == "/v1/messages":  # Anthropic
            assert self.headers.get("anthropic-version")
            assert b["max_tokens"] > 0 and isinstance(b["messages"], list)
            if b.get("stream"):
                ev = [
                    'event: message_start\ndata: {"type":"message_start","message":{"id":"m1","usage":{"input_tokens":21,"output_tokens":1}}}\n\n',
                    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
                    'event: ping\ndata: {"type":"ping"}\n\n',
                    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello "}}\n\n',
                    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"from claude"}}\n\n',
                    'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu_1","name":"get_time","input":{}}}\n\n',
                    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"tz\\":"}}\n\n',
                    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"UTC\\"}"}}\n\n',
                    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":9}}\n\n',
                    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
                ]
                return sse(self, ev)
            return self.reply({"id": "m1", "type": "message", "content": [{"type": "text", "text": "Hello from claude"}],
                               "stop_reason": "end_turn", "usage": {"input_tokens": 21, "output_tokens": 4}})
        if ":generateContent" in self.path or ":streamGenerateContent" in self.path:  # Gemini
            assert self.headers.get("x-goog-api-key")
            assert b["contents"][0]["role"] == "user"
            if ":streamGenerateContent" in self.path:
                ev = [
                    'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Hello "}]}}]}\r\n\r\n',
                    'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"from gemini"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":7,"candidatesTokenCount":3}}\r\n\r\n',
                ]
                return sse(self, ev)
            return self.reply({"candidates": [{"content": {"role": "model", "parts": [{"text": "Hello from gemini"}]}, "finishReason": "STOP"}],
                               "usageMetadata": {"promptTokenCount": 7, "candidatesTokenCount": 3}})
        self.reply({"error": {"message": "not found"}}, 404)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9100
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
