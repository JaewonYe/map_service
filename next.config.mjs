/** @type {import('next').NextConfig} */
export default {
  output:process.env.BUILD_STANDALONE==='1'?'standalone':undefined,
  outputFileTracingExcludes:{'/*':['./data/**/*','./.cache/**/*','./tests/**/*']}
};
