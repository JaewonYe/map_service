/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  // Set before building: rewrites are captured in the production build.
  async rewrites() {
    const upstream = new URL(process.env.TILE_SERVER_URL || 'http://127.0.0.1:8081');
    if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) {
      throw new Error('TILE_SERVER_URL must be an HTTP(S) origin without credentials or a path.');
    }
    const imagery = new URL(process.env.IMAGERY_SERVER_URL || 'http://127.0.0.1:8082');
    if (!['http:', 'https:'].includes(imagery.protocol) || imagery.username || imagery.password || imagery.pathname !== '/' || imagery.search || imagery.hash) {
      throw new Error('IMAGERY_SERVER_URL must be an HTTP(S) origin without credentials or a path.');
    }
    return [{
      source: '/tile/:z(\\d+)/:x(\\d+)/:y(\\d+).pbf',
      destination: `${upstream.origin}/tile/:z/:x/:y.pbf`
    }, {
      source: '/imagery/metadata.json', destination: `${imagery.origin}/metadata.json`
    }, {
      source: '/imagery/:dataset(rgb|infrared|ndvi)/:z(\\d+)/:x(\\d+)/:y(\\d+).png',
      destination: `${imagery.origin}/tile/:dataset/:z/:x/:y.png`
    }];
  }
};
export default nextConfig;
