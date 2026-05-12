import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The web app imports the workspace `@stock-vetter/schema` package as raw TS;
  // transpile it through Next's build rather than requiring a prebuilt dist.
  transpilePackages: ['@stock-vetter/schema'],
};

export default nextConfig;
