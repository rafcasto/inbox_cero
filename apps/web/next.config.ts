import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: ['@atlas/schemas'],
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  serverExternalPackages: ['firebase-admin'],
  eslint: { ignoreDuringBuilds: true },
};
export default config;
