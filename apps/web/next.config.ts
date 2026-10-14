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
    // Resolved at build time, so one image serves every origin. HSTS is always
    // sent: browsers ignore it over plain http (RFC 6797 section 8.1).
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'same-origin' },
                    { key: 'X-Frame-Options', value: 'DENY' },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=31536000',
                    },
                ],
            },
        ];
    },
};
export default config;
