import path from 'node:path';
import type { NextConfig } from 'next';
const config: NextConfig = {
    devIndicators: false,
    transpilePackages: ['@bikelog/api-client'],
    // The container build sets BIKELOG_STANDALONE=1 to emit a self-contained
    // server; local `next start` keeps the default output.
    ...(process.env.BIKELOG_STANDALONE === '1' && {
        output: 'standalone',
        outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
    }),
};
export default config;
