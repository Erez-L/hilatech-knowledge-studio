import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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
};

export default withNextIntl(nextConfig);
