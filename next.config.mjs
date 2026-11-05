/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  // Set before building: rewrites are captured in the production build.
  async rewrites() {
    const upstream = new URL(process.env.TILE_SERVER_URL || 'http://127.0.0.1:8081');
    if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) {
      throw new Error('TILE_SERVER_URL must be an HTTP(S) origin without credentials or a path.');
    }
    return [{
      source: '/tile/:z(\\d+)/:x(\\d+)/:y(\\d+).png',
      destination: `${upstream.origin}/tile/:z/:x/:y.png`
    }];
  }
};
export default nextConfig;
