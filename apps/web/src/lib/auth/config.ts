import { Pool } from 'pg';
import { SessionStore } from './session-store';

export type AuthConfig = {
    issuer: string;
    audience: string;
    clientId: string;
    clientSecret: string;
    publicOrigin: string;
};

function required(
    env: Record<string, string | undefined>,
    name: string,
): string {
    const value = env[name];
    if (!value?.trim())
        throw new Error(`Missing server authentication setting: ${name}`);
    return value;
}

export function readAuthConfig(
    env: Record<string, string | undefined> = process.env,
): AuthConfig {
    const issuer = required(env, 'AUTH0_ISSUER');
    const audience = required(env, 'AUTH0_AUDIENCE');
    const clientId = required(env, 'AUTH0_CLIENT_ID');
    const clientSecret = required(env, 'AUTH0_CLIENT_SECRET');
    const publicOrigin = required(env, 'WEB_PUBLIC_ORIGIN');
    const issuerUrl = new URL(issuer);
    const originUrl = new URL(publicOrigin);
    if (
        issuerUrl.protocol !== 'https:' ||
        !issuer.endsWith('/') ||
        issuerUrl.href !== issuer
    ) {
        throw new Error(
            'The Auth0 issuer must be an exact HTTPS URL ending in /.',
        );
    }
    if (
        originUrl.origin !== publicOrigin ||
        (originUrl.protocol !== 'https:' &&
            publicOrigin !== 'http://localhost:3000')
    ) {
        throw new Error(
            'The public web origin must be HTTPS or the exact local pilot origin.',
        );
    }
    return { issuer, audience, clientId, clientSecret, publicOrigin };
}

let pool: Pool | undefined;
let store: SessionStore | undefined;
export function getSessionStore(): SessionStore {
    if (store) return store;
    const databaseUrl = required(process.env, 'BIKELOG_WEB_DATABASE_URL');
    const encodedKey = required(process.env, 'BIKELOG_SESSION_KEY');
    if (!/^[A-Za-z0-9_-]{43}$/.test(encodedKey))
        throw new Error('Invalid session key encoding.');
    const key = Buffer.from(encodedKey, 'base64url');
    if (key.length !== 32)
        throw new Error('A 32-byte session key is required.');
    const url = new URL(databaseUrl);
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
        throw new Error('A PostgreSQL database URL is required.');
    }
    if (url.hostname !== '127.0.0.1' || url.port !== '54329') {
        throw new Error(
            'The pilot web session database must use dedicated loopback PostgreSQL.',
        );
    }
    pool = new Pool({ connectionString: databaseUrl, max: 5 });
    store = new SessionStore(pool, key);
    return store;
}
