import { readFileSync } from 'node:fs';
import { Pool, type PoolConfig } from 'pg';
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

type Env = Record<string, string | undefined>;

function loopbackHost(hostname: string): boolean {
    return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

/** Synthetic mode has no sign-in, so it must never serve a public origin. */
export function assertSafeAccessMode(env: Env = process.env): void {
    const origin = env.WEB_PUBLIC_ORIGIN;
    if (
        env.NODE_ENV === 'production' &&
        env.BIKELOG_WEB_ACCESS_MODE === 'Synthetic' &&
        origin &&
        !loopbackHost(new URL(origin).hostname)
    ) {
        throw new Error(
            'Synthetic mode cannot run in production behind a public origin.',
        );
    }
}

/**
 * The session pool settings. The dedicated loopback database is used as
 * before; any other host must verify the server certificate against
 * BIKELOG_DATABASE_CA_FILE. The hosted pool is built from the URL's parts so
 * an sslmode in the URL cannot override the TLS settings. Two connections
 * keep the web app within the connection budget (research D11).
 */
export function sessionPoolConfig(env: Env = process.env): PoolConfig {
    const databaseUrl = required(env, 'BIKELOG_WEB_DATABASE_URL');
    const url = new URL(databaseUrl);
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
        throw new Error('A PostgreSQL database URL is required.');
    }
    if (url.hostname === '127.0.0.1' && url.port === '54329') {
        return { connectionString: databaseUrl, max: 2 };
    }
    const sslmode = url.searchParams.get('sslmode');
    if (sslmode && !['require', 'verify-ca', 'verify-full'].includes(sslmode)) {
        throw new Error(
            'The session database URL must not weaken TLS with sslmode.',
        );
    }
    const caFile = env.BIKELOG_DATABASE_CA_FILE;
    let ca: string;
    try {
        if (!caFile) throw new Error();
        ca = readFileSync(caFile, 'utf8');
    } catch {
        throw new Error(
            'A non-loopback session database needs a readable BIKELOG_DATABASE_CA_FILE CA certificate.',
        );
    }
    return {
        host: url.hostname,
        port: url.port ? Number(url.port) : 5432,
        database: decodeURIComponent(url.pathname.slice(1)),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        ssl: { ca, rejectUnauthorized: true },
        max: 2,
    };
}

let pool: Pool | undefined;
let store: SessionStore | undefined;
export function getSessionStore(): SessionStore {
    if (store) return store;
    const encodedKey = required(process.env, 'BIKELOG_SESSION_KEY');
    if (!/^[A-Za-z0-9_-]{43}$/.test(encodedKey))
        throw new Error('Invalid session key encoding.');
    const key = Buffer.from(encodedKey, 'base64url');
    if (key.length !== 32)
        throw new Error('A 32-byte session key is required.');
    pool = new Pool(sessionPoolConfig());
    store = new SessionStore(pool, key);
    return store;
}
