import type { NextConfig } from "next";

const isGitHubPages = process.env.DEPLOY_TARGET === "github-pages";
const repositoryBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/inside-coding-agents";

const nextConfig: NextConfig = isGitHubPages
  ? {
      output: "export",
      basePath: repositoryBasePath,
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
