import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_HAS_APIFY: process.env.APIFY_TOKEN ? "1" : "0",
    NEXT_PUBLIC_HAS_ANTHROPIC: process.env.ANTHROPIC_API_KEY ? "1" : "0",
    NEXT_PUBLIC_CRON_SECRET: process.env.CRON_SECRET ?? "dev-cron-secret",
  },
};

export default nextConfig;
