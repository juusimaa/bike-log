import { getSessionStore } from './config';
import { sessionIdFromCookie } from './cookies';
import { refreshAuth0Tokens } from './oidc';
import type { SessionStore, TokenEnvelope } from './session-store';

export type AccessTokenDependencies = {
    store: Pick<SessionStore, 'get' | 'rotate' | 'delete'>;
    refresh: (refreshToken: string) => Promise<TokenEnvelope>;
    now: () => number;
};

const EXPIRY_MARGIN_MS = 60_000;
const refreshes = new Map<string, Promise<string | null>>();

function dependencies(): AccessTokenDependencies {
    return {
        store: getSessionStore(),
        refresh: refreshAuth0Tokens,
        now: Date.now,
    };
}

export async function getApiAccessToken(
    request: Request,
    deps: AccessTokenDependencies = dependencies(),
): Promise<string | null> {
    const id = sessionIdFromCookie(request.headers.get('cookie'));
    if (!id) return null;
    const session = await deps.store.get(id);
    if (!session) return null;
    if (session.tokens.expiresAt > deps.now() + EXPIRY_MARGIN_MS) {
        return session.tokens.accessToken;
    }
    if (!session.tokens.refreshToken) {
        await deps.store.delete(id);
        return null;
    }

    const existing = refreshes.get(id);
    if (existing) return existing;
    const pending = (async () => {
        try {
            const tokens = await deps.refresh(session.tokens.refreshToken!);
            if (
                tokens.expiresAt <= deps.now() + EXPIRY_MARGIN_MS ||
                !tokens.scope.split(' ').includes('BikeLog.Access')
            ) {
                throw new Error('Invalid refreshed API token.');
            }
            if (await deps.store.rotate(id, session.rotationVersion, tokens)) {
                return tokens.accessToken;
            }
            const latest = await deps.store.get(id);
            return latest?.tokens.expiresAt &&
                latest.tokens.expiresAt > deps.now() + EXPIRY_MARGIN_MS
                ? latest.tokens.accessToken
                : null;
        } catch {
            const latest = await deps.store.get(id);
            if (
                latest &&
                latest.rotationVersion > session.rotationVersion &&
                latest.tokens.expiresAt > deps.now() + EXPIRY_MARGIN_MS
            ) {
                return latest.tokens.accessToken;
            }
            await deps.store.delete(id);
            return null;
        }
    })();
    refreshes.set(id, pending);
    try {
        return await pending;
    } finally {
        if (refreshes.get(id) === pending) refreshes.delete(id);
    }
}
