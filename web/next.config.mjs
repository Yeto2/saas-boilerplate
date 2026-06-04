import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // This app sits beside the portfolio workspace; pin the trace root to itself
  // so Next does not infer a parent lockfile as the project root.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
