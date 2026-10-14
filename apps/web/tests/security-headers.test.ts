// @vitest-environment node
import { expect, it } from 'vitest';
import config from '../next.config';

it('sends the security headers on every path', async () => {
    const rules = await config.headers!();
    const all = rules.find((rule) => rule.source === '/:path*');
    const headers = Object.fromEntries(
        (all?.headers ?? []).map(({ key, value }) => [key, value]),
    );
    expect(headers).toMatchObject({
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
        'X-Frame-Options': 'DENY',
        // Next resolves headers() at build time, and one image serves every
        // origin, so HSTS is always sent. Browsers ignore it over plain http
        // (RFC 6797 section 8.1), so loopback development is unaffected.
        'Strict-Transport-Security': 'max-age=31536000',
    });
});
