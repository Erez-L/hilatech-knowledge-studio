import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { PAGE_HEADERS_SOURCE, securityHeaders } from "./src/lib/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  agentRules: false,
  // Workspace packages are consumed as TypeScript source.
  transpilePackages: ["@hks/shared", "@hks/database", "@hks/ai", "@hks/core"],
  // Native or large server-only libraries stay out of the bundle.
  serverExternalPackages: ["pg", "bullmq", "ioredis", "unpdf", "@napi-rs/canvas", "mammoth", "nodemailer", "@aws-sdk/client-s3", "@aws-sdk/client-bedrock-runtime", "@anthropic-ai/sdk"],
  // Content-Security-Policy, anti-framing and related headers on every page (see the module).
  async headers() {
    return [{ source: PAGE_HEADERS_SOURCE, headers: securityHeaders({ development: process.env.NODE_ENV === "development" }) }];
  },
};

export default withNextIntl(nextConfig);
