// Same-origin proxy used by the browser UI: /gw/{v1,auth,api,admin,health}/... → gateway.

import type { NextRequest } from "next/server";
import { notFound, proxyToGateway } from "@/lib/gateway_proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ROOTS = new Set(["v1", "auth", "api", "admin", "health"]);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  if (!path?.length || !ALLOWED_ROOTS.has(path[0])) return notFound();
  return proxyToGateway(req, path, req.nextUrl.search);
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
