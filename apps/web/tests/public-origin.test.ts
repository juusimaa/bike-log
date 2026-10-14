// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
    ForeignOriginError,
    publicRequestOrigin,
} from '../src/lib/public-origin';

const hosted = 'https://ca-bikelog.example.azurecontainerapps.io';
afterEach(() => vi.unstubAllEnvs());

function request(url: string, headers: Record<string, string> = {}) {
    return new Request(url, { headers });
}

it('returns the configured origin when the Host matches, whatever request.url says', () => {
    vi.stubEnv('WEB_PUBLIC_ORIGIN', hosted);
    // Behind TLS-terminating ingress, request.url is rebuilt as plain http.
    const behindIngress = request(
        'http://ca-bikelog.example.azurecontainerapps.io/auth/callback',
        { host: 'ca-bikelog.example.azurecontainerapps.io' },
    );
    expect(publicRequestOrigin(behindIngress)).toBe(hosted);
});

it('throws ForeignOriginError for a different Host', () => {
    vi.stubEnv('WEB_PUBLIC_ORIGIN', hosted);
    expect(() =>
        publicRequestOrigin(
            request(`${hosted}/`, { host: 'evil.example' }),
        ),
    ).toThrow(ForeignOriginError);
});

it('accepts X-Forwarded-Proto https or none, and refuses http for an https origin', () => {
    vi.stubEnv('WEB_PUBLIC_ORIGIN', hosted);
    const host = 'ca-bikelog.example.azurecontainerapps.io';
    expect(
        publicRequestOrigin(
            request(`http://${host}/`, { host, 'x-forwarded-proto': 'https' }),
        ),
    ).toBe(hosted);
    expect(publicRequestOrigin(request(`http://${host}/`, { host }))).toBe(
        hosted,
    );
    expect(() =>
        publicRequestOrigin(
            request(`http://${host}/`, { host, 'x-forwarded-proto': 'http' }),
        ),
    ).toThrow(ForeignOriginError);
});

it('ignores X-Forwarded-Host entirely', () => {
    vi.stubEnv('WEB_PUBLIC_ORIGIN', hosted);
    const host = 'ca-bikelog.example.azurecontainerapps.io';
    expect(() =>
        publicRequestOrigin(
            request(`${hosted}/`, {
                host: 'evil.example',
                'x-forwarded-host': host,
            }),
        ),
    ).toThrow(ForeignOriginError);
    expect(
        publicRequestOrigin(
            request(`${hosted}/`, { host, 'x-forwarded-host': 'evil.example' }),
        ),
    ).toBe(hosted);
});

it('refuses a missing or inexact configured origin', () => {
    const host = 'ca-bikelog.example.azurecontainerapps.io';
    expect(() =>
        publicRequestOrigin(request(`${hosted}/`, { host })),
    ).toThrow();
    vi.stubEnv('WEB_PUBLIC_ORIGIN', `${hosted}/`);
    expect(() =>
        publicRequestOrigin(request(`${hosted}/`, { host })),
    ).toThrow();
});
