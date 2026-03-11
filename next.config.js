// next.config.js
const path = require('path');
const fs = require('fs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Security headers applied to all responses
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  // Transpile the cesium ESM package so Next.js can process it correctly
  transpilePackages: ['cesium'],


  // Exclude undici from webpack bundling — it's a server-only Node.js module
  // that uses node: scheme imports which webpack cannot process.
  // Next.js 14.2 uses experimental.serverComponentsExternalPackages (not serverExternalPackages).
  experimental: {
    serverComponentsExternalPackages: ['undici'],
  },

  webpack: (config, { webpack, dev, isServer }) => {
    // Work around Next.js 14.2 server chunk path: both dev and production emit
    // chunks to .next/server/chunks/ but webpack-runtime.js requires "./<id>.js"
    // (same dir). Patch the runtime to require "./chunks/<id>.js" after emit.
    if (isServer && config.output?.path) {
      const runtimePath = path.join(config.output.path, '..', 'webpack-runtime.js');
      config.plugins.push({
        apply: (compiler) => {
          compiler.hooks.afterEmit.tap('PatchWebpackRuntimeChunkPath', () => {
            try {
              if (fs.existsSync(runtimePath)) {
                let code = fs.readFileSync(runtimePath, 'utf8');
                const patched = code.replace(
                  /installChunk\(require\("\.\/"\s*\+\s*__webpack_require__\.u\(chunkId\)\)\)/g,
                  'installChunk(require("./chunks/" + __webpack_require__.u(chunkId)))'
                );
                if (patched !== code) {
                  fs.writeFileSync(runtimePath, patched);
                }
              }
            } catch (e) {
              console.warn('[next.config] PatchWebpackRuntimeChunkPath:', e.message);
            }
          });
        },
      });
    }

    // Work around Cesium 1.120 importing a removed zip.js subpath.
    // zip-no-worker behavior matches zip.js in zip.js v2.x browser builds.
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@zip.js/zip.js/lib/zip-no-worker.js': '@zip.js/zip.js/lib/zip.js',
    };

    // Inject CESIUM_BASE_URL compile-time constant.
    // Cesium reads window.CESIUM_BASE_URL at runtime to locate static assets.
    config.plugins.push(
      new webpack.DefinePlugin({
        CESIUM_BASE_URL: JSON.stringify('/cesium'),
      })
    );

    return config;
  },
};

module.exports = nextConfig;
