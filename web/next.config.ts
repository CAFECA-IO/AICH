import path from "node:path";
import type { NextConfig } from "next";

// Pin the project root to web/. Otherwise a package-lock.json in the repo root (created by
// `npm install` there for `npm run swarm`) makes Next pick the repo root and nest the standalone
// output under .next/standalone/web/ instead of .next/standalone/.
const root = path.resolve(__dirname);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: root,
  turbopack: { root },
  poweredByHeader: false,
  async headers() {
    return [
      {
        // "Sign in with CAFECA" site info, read cross-origin by the wallet.
        source: "/.well-known/cafeca-site.json",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
