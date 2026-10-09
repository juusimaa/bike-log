import * as client from 'openid-client';
import { getSessionStore, readAuthConfig, type AuthConfig } from './config';
import { sessionCookie } from './cookies';
import type { SessionStore, TokenEnvelope } from './session-store';

type ProviderTokens = TokenEnvelope & { issuer: string; subject: string };
type ExchangeChecks = { state: string; nonce: string; verifier: string };

export type AuthProvider = {
    authorizationUrl(parameters: Record<string, string>): Promise<URL>;
    exchange(url: URL, checks: ExchangeChecks): Promise<ProviderTokens>;
};

export type AuthDependencies = {
    config: AuthConfig;
    store: Pick<
        SessionStore,
        'createLoginTransaction' | 'consumeLoginTransaction' | 'create'
    >;
    provider: AuthProvider;
};

const SCOPE = 'openid profile email offline_access BikeLog.Access';
let discovered: Promise<client.Configuration> | undefined;
function provider(config: AuthConfig): AuthProvider {
    const configuration = () =>
        (discovered ??= client.discovery(
            new URL(config.issuer),
            config.clientId,
            config.clientSecret,
        ));
    return {
        authorizationUrl: async (parameters) =>
            client.buildAuthorizationUrl(await configuration(), parameters),
        exchange: async (url, checks) => {
            const tokens = await client.authorizationCodeGrant(
                await configuration(),
                url,
                {
                    expectedState: checks.state,
                    expectedNonce: checks.nonce,
                    pkceCodeVerifier: checks.verifier,
                    idTokenExpected: true,
                },
            );
            const claims = tokens.claims();
            if (
                !claims?.iss ||
                !claims.sub ||
                !tokens.access_token ||
                !tokens.expires_in
            ) {
                throw new Error('Incomplete provider token response.');
            }
            return {
                issuer: claims.iss,
                subject: claims.sub,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token ?? null,
                expiresAt: Date.now() + tokens.expires_in * 1000,
                scope: tokens.scope ?? SCOPE,
            };
        },
    };
}

function dependencies(): AuthDependencies {
    const config = readAuthConfig();
    return { config, store: getSessionStore(), provider: provider(config) };
}

export function safeReturnPath(path: string): string {
    if (
        !path.startsWith('/') ||
        path.startsWith('//') ||
        path.includes('\\') ||
        /[\u0000-\u001f\u007f]/.test(path) ||
        path.startsWith('/auth/callback')
    ) {
        throw new Error('Unsafe return path.');
    }
    return path;
}

export async function startLogin(
    returnTo: string,
    deps: AuthDependencies = dependencies(),
): Promise<Response> {
    const path = safeReturnPath(returnTo);
    const state = client.randomState();
    const nonce = client.randomNonce();
    const verifier = client.randomPKCECodeVerifier();
    const challenge = await client.calculatePKCECodeChallenge(verifier);
    await deps.store.createLoginTransaction(state, nonce, verifier, path);
    const url = await deps.provider.authorizationUrl({
        response_type: 'code',
        redirect_uri: `${deps.config.publicOrigin}/auth/callback`,
        scope: SCOPE,
        audience: deps.config.audience,
        connection: 'email',
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256',
    });
    return Response.redirect(url, 302);
}

function callbackError(): Response {
    return Response.json(
        {
            code: 'sign_in_failed',
            message:
                'The sign-in link was invalid or expired. Please try again.',
        },
        { status: 400, headers: { 'cache-control': 'no-store' } },
    );
}

export async function completeLogin(
    request: Request,
    deps: AuthDependencies = dependencies(),
): Promise<Response> {
    const url = new URL(request.url);
    if (
        url.origin !== deps.config.publicOrigin ||
        url.pathname !== '/auth/callback'
    ) {
        return callbackError();
    }
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!state || !code) return callbackError();
    const transaction = await deps.store.consumeLoginTransaction(state);
    if (!transaction) return callbackError();
    let returnPath: string;
    try {
        returnPath = safeReturnPath(transaction.returnTo);
    } catch {
        return callbackError();
    }
    try {
        const tokens = await deps.provider.exchange(url, {
            state,
            nonce: transaction.nonce,
            verifier: transaction.verifier,
        });
        if (
            tokens.issuer !== deps.config.issuer ||
            !tokens.subject ||
            !tokens.accessToken ||
            tokens.expiresAt <= Date.now() ||
            !tokens.scope.split(' ').includes('BikeLog.Access')
        ) {
            return callbackError();
        }
        const id = await deps.store.create(
            { issuer: tokens.issuer, subject: tokens.subject },
            {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: tokens.expiresAt,
                scope: tokens.scope,
            },
        );
        const target = new URL(returnPath, deps.config.publicOrigin);
        return new Response(null, {
            status: 303,
            headers: {
                location: target.href,
                'set-cookie': sessionCookie(id),
                'cache-control': 'no-store',
            },
        });
    } catch {
        return callbackError();
    }
}
