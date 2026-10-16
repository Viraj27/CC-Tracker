import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Catalog YAML is read from disk at runtime by the server.
  outputFileTracingIncludes: { "/**": ["./catalog/**/*"] },
  // Don't generate AGENTS.md on `next dev`.
  agentRules: false,
};

export default nextConfig;
