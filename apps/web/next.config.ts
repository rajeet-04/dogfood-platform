import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@dogfood/audit",
    "@dogfood/auth",
    "@dogfood/db",
    "@dogfood/events",
    "@dogfood/judging",
    "@dogfood/normalization",
    "@dogfood/permissions",
    "@dogfood/ranking",
    "@dogfood/scoring",
    "@dogfood/shared",
    "@dogfood/submissions",
    "@dogfood/teams",
    "@dogfood/validation",
  ],
};

export default nextConfig;