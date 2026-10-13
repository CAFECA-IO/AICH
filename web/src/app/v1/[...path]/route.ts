// OpenAI-compatible API on the web origin: /v1/* → gateway /v1/*.
// Lets a single port (e.g. `npm run swarm` on 10016) serve both the UI and the API.

import type { NextRequest } from "next/server";
import { proxyToGateway } from "@/lib/gateway_proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  return proxyToGateway(req, ["v1", ...(path ?? [])], req.nextUrl.search);
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
