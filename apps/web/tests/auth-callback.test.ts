// @vitest-environment node
import { expect, it } from 'vitest';
import {
    completeLogin,
    safeReturnPath,
    startLogin,
    type AuthDependencies,
} from '../src/lib/auth/oidc';
import { readAuthConfig } from '../src/lib/auth/config';

function setup() {
    const transactions = new Map<
        string,
        { nonce: string; verifier: string; returnTo: string }
    >();
    const sessions: { issuer: string; subject: string }[] = [];
    let expectedNonce = '';
    const deps: AuthDependencies = {
        config: {
            issuer: 'https://issuer.example.test/',
            audience: 'https://api.example.test/bike-log',
            clientId: 'web-client',
            clientSecret: 'test-secret',
            publicOrigin: 'http://localhost:3000',
        },
        store: {
            createLoginTransaction: async (
                state,
                nonce,
                verifier,
                returnTo,
            ) => {
                transactions.set(state, { nonce, verifier, returnTo });
                expectedNonce = nonce;
            },
            consumeLoginTransaction: async (state) => {
                const transaction = transactions.get(state) ?? null;
                transactions.delete(state);
                return transaction;
            },
            create: async (identity) => {
                sessions.push(identity);
                return 'opaque-session-id';
            },
        },
        provider: {
            authorizationUrl: async (parameters) => {
                const url = new URL('https://issuer.example.test/authorize');
                for (const [key, value] of Object.entries(parameters))
                    url.searchParams.set(key, value);
                return url;
            },
            exchange: async (_url, checks) => {
                if (
                    checks.nonce !== expectedNonce ||
                    checks.verifier === 'tampered'
                )
                    throw new Error('OIDC validation failed');
                return {
                    issuer: 'https://issuer.example.test/',
                    subject: 'email|pilot',
                    accessToken: 'private-access-token',
                    refreshToken: 'private-refresh-token',
                    expiresAt: Date.now() + 3_600_000,
                    scope: 'BikeLog.Access',
                };
            },
        },
    };
    return { deps, transactions, sessions };
}

it('requires complete settings and rejects unsafe return paths', () => {
    expect(() => readAuthConfig({})).toThrow();
    expect(safeReturnPath('/garage?tab=bikes')).toBe('/garage?tab=bikes');
    for (const path of [
        '//evil.example',
        'https://evil.example',
        '/\\evil',
        '/auth/callback',
    ]) {
        expect(() => safeReturnPath(path)).toThrow();
    }
});

it('starts Auth0 email code with API audience, state, nonce and PKCE', async () => {
    const { deps, transactions } = setup();
    const response = await startLogin('/garage', deps);
    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.get('location')!);
    expect(redirect.origin).toBe('https://issuer.example.test');
    expect(redirect.searchParams.get('connection')).toBe('email');
    expect(redirect.searchParams.get('audience')).toBe(deps.config.audience);
    expect(redirect.searchParams.get('scope')).toBe(
        'openid profile email offline_access BikeLog.Access',
    );
    expect(redirect.searchParams.get('code_challenge_method')).toBe('S256');
    expect(redirect.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3000/auth/callback',
    );
    expect(transactions.has(redirect.searchParams.get('state')!)).toBe(true);
    expect(redirect.searchParams.get('nonce')).toBeTruthy();
    expect(redirect.searchParams.get('code_challenge')).toBeTruthy();
});

it('rejects wrong state, callback origin and replay without creating sessions', async () => {
    const { deps, sessions } = setup();
    const started = await startLogin('/', deps);
    const state = new URL(started.headers.get('location')!).searchParams.get(
        'state',
    )!;
    expect(
        (
            await completeLogin(
                new Request(
                    'http://localhost:3000/auth/callback?code=abc&state=wrong',
                ),
                deps,
            )
        ).status,
    ).toBe(400);
    expect(
        (
            await completeLogin(
                new Request(
                    `https://evil.example/auth/callback?code=abc&state=${state}`,
                ),
                deps,
            )
        ).status,
    ).toBe(400);
    expect(sessions).toHaveLength(0);
    const callback = new Request(
        `http://localhost:3000/auth/callback?code=abc&state=${state}`,
    );
    const success = await completeLogin(callback, deps);
    expect(success.status).toBe(303);
    expect(success.headers.get('location')).toBe('http://localhost:3000/');
    expect(success.headers.get('set-cookie')).toMatch(
        /Secure; HttpOnly; SameSite=Lax/,
    );
    expect(success.headers.get('set-cookie')).not.toContain(
        'private-access-token',
    );
    expect(sessions).toEqual([
        { issuer: deps.config.issuer, subject: 'email|pilot' },
    ]);
    expect((await completeLogin(callback, deps)).status).toBe(400);
    expect(sessions).toHaveLength(1);
});

it('creates no session after nonce, PKCE, unsafe return path, or provider failure', async () => {
    for (const defect of ['nonce', 'verifier', 'return-path', 'provider']) {
        const { deps, transactions, sessions } = setup();
        const started = await startLogin('/', deps);
        const state = new URL(
            started.headers.get('location')!,
        ).searchParams.get('state')!;
        if (defect === 'nonce') transactions.get(state)!.nonce = 'tampered';
        if (defect === 'verifier')
            transactions.get(state)!.verifier = 'tampered';
        if (defect === 'return-path')
            transactions.get(state)!.returnTo = '//evil.example';
        if (defect === 'provider')
            deps.provider.exchange = async () => {
                throw new Error('private provider detail');
            };
        const response = await completeLogin(
            new Request(
                `http://localhost:3000/auth/callback?code=abc&state=${state}`,
            ),
            deps,
        );
        expect(response.status).toBe(400);
        expect(await response.text()).not.toContain('private provider detail');
        expect(sessions).toHaveLength(0);
    }
});
