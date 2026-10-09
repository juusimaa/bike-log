// @vitest-environment node
import { expect, it } from 'vitest';
import { getApiAccessToken } from '../src/lib/auth/access-token';
import { SESSION_COOKIE } from '../src/lib/auth/cookies';

const id = 'A'.repeat(43);
const request = () =>
    new Request('http://127.0.0.1:3000/api/bikes', {
        headers: { cookie: `${SESSION_COOKIE}=${id}` },
    });
const current = {
    issuer: 'https://issuer.example.test/',
    subject: 'email|pilot',
    rotationVersion: 0,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    tokens: {
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        expiresAt: Date.now() + 10_000,
        scope: 'BikeLog.Access',
    },
};

it('returns null for missing, invalid or expired sessions without refreshing', async () => {
    let refreshes = 0;
    let reads = 0;
    const store = {
        get: async () => {
            reads++;
            return null;
        },
        rotate: async () => true,
        delete: async () => {},
    };
    const deps = {
        store,
        refresh: async () => {
            refreshes++;
            return current.tokens;
        },
        now: Date.now,
    };
    expect(
        await getApiAccessToken(
            new Request('http://127.0.0.1:3000/api/bikes'),
            deps,
        ),
    ).toBeNull();
    expect(reads).toBe(0);
    expect(await getApiAccessToken(request(), deps)).toBeNull();
    expect(refreshes).toBe(0);
});

it('uses a current server-held access token without refresh', async () => {
    const session = {
        ...current,
        tokens: { ...current.tokens, expiresAt: Date.now() + 3_600_000 },
    };
    const deps = {
        store: {
            get: async () => session,
            rotate: async () => true,
            delete: async () => {},
        },
        refresh: async () => {
            throw new Error('refresh should not run');
        },
        now: Date.now,
    };
    expect(await getApiAccessToken(request(), deps)).toBe('old-access');
});

it('serializes concurrent refreshes and keeps the winning rotated token', async () => {
    let refreshes = 0;
    let session = structuredClone(current);
    const store = {
        get: async () => session,
        rotate: async (
            _id: string,
            version: number,
            tokens: typeof current.tokens,
        ) => {
            if (version !== session.rotationVersion) return false;
            session = { ...session, rotationVersion: version + 1, tokens };
            return true;
        },
        delete: async () => {
            throw new Error('winner must remain');
        },
    };
    const deps = {
        store,
        refresh: async () => {
            refreshes++;
            await Promise.resolve();
            return {
                accessToken: 'new-access',
                refreshToken: 'new-refresh',
                expiresAt: Date.now() + 3_600_000,
                scope: 'BikeLog.Access',
            };
        },
        now: Date.now,
    };
    const [a, b] = await Promise.all([
        getApiAccessToken(request(), deps),
        getApiAccessToken(request(), deps),
    ]);
    expect([a, b]).toEqual(['new-access', 'new-access']);
    expect(refreshes).toBe(1);
    expect(session.rotationVersion).toBe(1);
    expect(session.tokens.refreshToken).toBe('new-refresh');
});

it('deletes a session when refresh fails and returns no token', async () => {
    let deleted = false;
    const deps = {
        store: {
            get: async () => current,
            rotate: async () => false,
            delete: async () => {
                deleted = true;
            },
        },
        refresh: async () => {
            throw new Error('private provider failure');
        },
        now: Date.now,
    };
    expect(await getApiAccessToken(request(), deps)).toBeNull();
    expect(deleted).toBe(true);
});
