/** @type {import('next').NextConfig} */
export default {
  output: process.env.BUILD_STANDALONE==='1' ? 'standalone' : undefined,
  async rewrites() {
    const origin=new URL(process.env.IMAGERY_SERVER_URL || 'http://127.0.0.1:8082');
    if (!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash) throw Error('IMAGERY_SERVER_URL must be an HTTP(S) origin.');
    return [{source:'/imagery/metadata.json',destination:`${origin.origin}/metadata.json`},
      {source:'/imagery/rgb/:z(\\d+)/:x(\\d+)/:y(\\d+).jpg',destination:`${origin.origin}/tile/rgb/:z/:x/:y.jpg`}];
  }
};
