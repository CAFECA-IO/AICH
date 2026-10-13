// Server-side reverse proxy to the Rust gateway. Keeps GATEWAY_URL a runtime setting and
// streams SSE responses straight through. Used by /gw/* (browser) and /v1/* (OpenAI SDKs).

const FORWARD_REQUEST_HEADERS = ["authorization", "content-type", "x-api-key", "x-hub-strategy", "x-hub-intent", "x-hub-cache", "accept"];
const DROP_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);

export async function proxyToGateway(req: Request, path: string[], search: string): Promise<Response> {
  const base = (process.env.GATEWAY_URL ?? "http://localhost:8080").replace(/\/$/, "");
  const target = `${base}/${path.map(encodeURIComponent).join("/")}${search}`;

  const headers = new Headers();
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const hasBody = !["GET", "HEAD"].includes(req.method);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      signal: req.signal,
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: { message: "gateway unreachable", type: "upstream_error" } }, { status: 502 });
  }

  const out = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!DROP_RESPONSE_HEADERS.has(k.toLowerCase())) out.set(k, v);
  });
  if (out.get("content-type")?.includes("text/event-stream")) {
    out.set("cache-control", "no-cache, no-transform");
    out.set("x-accel-buffering", "no");
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export function notFound(): Response {
  return Response.json({ error: { message: "not found", type: "invalid_request_error" } }, { status: 404 });
}
