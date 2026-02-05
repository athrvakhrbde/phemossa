const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile ESM-only libp2p packages so Next/webpack can resolve them
  transpilePackages: ['@libp2p/circuit-relay-v2'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        // Use shim so @noble/ed25519 gets null and uses globalThis.crypto (Web Crypto API).
        crypto: path.resolve(__dirname, 'lib/shim-crypto.js'),
      };
    }
    // ESM-only package: point to dist so resolution works
    config.resolve.alias = {
      ...config.resolve.alias,
      '@libp2p/circuit-relay-v2': path.resolve(
        __dirname,
        'node_modules/@libp2p/circuit-relay-v2/dist/src/index.js'
      ),
    };
    return config;
  },
};

module.exports = nextConfig;
