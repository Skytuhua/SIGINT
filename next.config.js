// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile the cesium ESM package so Next.js can process it correctly
  transpilePackages: ['cesium'],

  webpack: (config, { webpack }) => {
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
