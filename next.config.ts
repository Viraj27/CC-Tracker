import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Catalog YAML is read from disk at runtime by the server.
  outputFileTracingIncludes: { "/**": ["./catalog/**/*"] },
};

export default nextConfig;
