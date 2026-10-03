import type { NextConfig } from 'next';
const config: NextConfig = {
    devIndicators: false,
    transpilePackages: ['@bikelog/api-client'],
};
export default config;
