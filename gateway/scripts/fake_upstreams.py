#!/usr/bin/env python3
"""Fake OpenAI / Anthropic / Gemini HTTP endpoints that speak each vendor's real wire format,
plus a fake CAFECA wallet (/.well-known/cafeca-configuration, /api/rpc, /api/profile).
Used to exercise the gateway adapters (including SSE parsing) and CAFECA sign-in without real keys.
The fake RPC treats signature 0x6f6b ("ok") as valid and anything else as invalid.
Run: python3 scripts/fake_upstreams.py 9100
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def sse(handler, events):
    handler.send_response(200)
    handler.send_header("content-type", "text/event-stream")
    handler.end_headers()
    for ev in events:
        handler.wfile.write(ev.encode())
        handler.wfile.flush()


FAKE_WALLET_PAGE = """<!doctype html><meta charset=utf-8><title>Fake CAFECA</title>
<button id=ok>Approve</button>
<script>
const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0)));
const b64e = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
const req = JSON.parse(b64d(new URLSearchParams(location.search).get('req')));
document.getElementById('ok').onclick = () => {
  const res = { v: 1, type: 'cafeca:auth', account: '0x00000000000000000000000000000000000ca5ec', chainId: 8018, signature: '0x6f6b',
    message: { domain: req.domain, uri: req.uri, nonce: req.nonce, issuedAt: req.issuedAt, expiresAt: req.expiresAt,
               statement: req.statement || '', claims: (req.claims || []).slice().sort().join(','), channel: '' },
    claims: { handle: 'e2e_user' } };
  if (req.mode === 'popup') { window.opener.postMessage(res, req.domain); window.close(); }
  else location.href = req.redirectUri + '#cafeca=' + b64e(JSON.stringify(res));
};
</script>"""


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        port = self.server.server_address[1]
        if self.path == "/.well-known/cafeca-configuration":
            return self.reply({"issuer": f"http://127.0.0.1:{port}", "chain": {"id": 8018, "rpc": f"http://127.0.0.1:{port}/api/rpc"}})
        if self.path.startswith("/api/profile"):
            return self.reply({"handle": "e2e_user"})
        if self.path == "/sdk/cafeca-connect.js" and os.environ.get("CAFECA_SDK_PATH"):
            # Serve a copy of the real SDK (download it from https://cafeca.io/sdk/cafeca-connect.js).
            data = open(os.environ["CAFECA_SDK_PATH"], "rb").read()
            self.send_response(200)
            self.send_header("content-type", "application/javascript")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            return self.wfile.write(data)
        if self.path.startswith("/dl/auth"):
            # Fake wallet approval page: signs with the fake "ok" signature and returns like the real wallet.
            html = FAKE_WALLET_PAGE.encode()
            self.send_response(200)
            self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(html)))
            self.end_headers()
            return self.wfile.write(html)
        self.reply({"error": {"message": "not found"}}, 404)

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
        if self.path == "/api/rpc":  # fake CAFECA chain: ERC-1271 isValidSignature
            data = b["params"][0]["data"]
            assert data.startswith("0x1626ba7e")
            sig_len = int(data[2 + 8 + 128:2 + 8 + 192], 16)
            sig = data[2 + 8 + 192:2 + 8 + 192 + sig_len * 2]
            if sig == "6f6b":
                return self.reply({"jsonrpc": "2.0", "id": b["id"], "result": "0x1626ba7e" + "0" * 56})
            return self.reply({"jsonrpc": "2.0", "id": b["id"], "error": {"code": 3, "message": "execution reverted"}})
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
