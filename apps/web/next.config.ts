import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The web app imports the workspace `@stock-vetter/schema` package as raw TS;
  // transpile it through Next's build rather than requiring a prebuilt dist.
  transpilePackages: ['@stock-vetter/schema'],
  webpack(config) {
    // The workspace packages are ESM-TS and use `.js` import specifiers (so they
    // run under tsx/tsc with moduleResolution: Bundler). Teach webpack to resolve
    // a `.js` request to the `.ts` source.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
