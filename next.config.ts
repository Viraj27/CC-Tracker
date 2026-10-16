import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Catalog YAML is read from disk at runtime by the Node server (Workers use
  // the copy bundled by scripts/bundle-catalog.ts).
  outputFileTracingIncludes: { "/**": ["./catalog/**/*"] },
  // Prisma ships workerd-specific builds; OpenNext needs these external to
  // pick and patch them (https://opennext.js.org/cloudflare/howtos/db).
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  // Don't generate AGENTS.md on `next dev`.
  agentRules: false,
  // Keep the dev-mode badge out of e2e screenshots.
  devIndicators: false,
};

export default nextConfig;
