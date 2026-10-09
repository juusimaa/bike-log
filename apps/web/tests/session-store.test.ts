// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { SessionStore } from '../src/lib/auth/session-store';

const { Pool } = pg;
const localEnv = readFileSync(resolve(process.cwd(), '../../.env'), 'utf8');
function value(name: string): string {
    const match = localEnv.match(new RegExp(`^${name}=(.*)$`, 'm'));
    if (!match) throw new Error(`Missing ${name} in local test environment`);
    return match[1];
}
const database = `bikelog_web_test_${randomBytes(8).toString('hex')}`;
const base = {
    host: '127.0.0.1',
    port: 54329,
    user: value('POSTGRES_USER'),
    password: value('POSTGRES_PASSWORD'),
};
const admin = new Pool({ ...base, database: 'postgres' });
const pool = new Pool({ ...base, database });
let store: SessionStore;

beforeAll(async () => {
    await admin.query(`CREATE DATABASE "${database}"`);
    await pool.query(`
      CREATE TABLE "WebSessions" (
        "SessionIdHash" varchar(64) PRIMARY KEY,
        "EncryptedTokens" text NOT NULL,
        "Issuer" varchar(512) NOT NULL,
        "Subject" varchar(512) NOT NULL,
        "ExpiresAtUtc" timestamptz NOT NULL,
        "RotationVersion" integer NOT NULL,
        "CreatedAtUtc" timestamptz NOT NULL,
        "UpdatedAtUtc" timestamptz NOT NULL
      );
      CREATE TABLE "OidcLoginTransactions" (
        "StateHash" varchar(64) PRIMARY KEY,
        "EncryptedNonceAndVerifier" text NOT NULL,
        "ReturnPath" varchar(2048) NOT NULL,
        "ExpiresAtUtc" timestamptz NOT NULL,
        "CreatedAtUtc" timestamptz NOT NULL
      );
    `);
    store = new SessionStore(pool, randomBytes(32));
});

afterAll(async () => {
    await pool.end();
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
});

it('stores only encrypted tokens behind distinct random opaque IDs and deletes them', async () => {
    const identity = {
        issuer: 'https://issuer.example.test/',
        subject: 'email|pilot',
    };
    const tokens = {
        accessToken: 'private-access-token',
        refreshToken: 'private-refresh-token',
        expiresAt: Date.now() + 3_600_000,
        scope: 'BikeLog.Access',
    };
    const first = await store.create(identity, tokens);
    const second = await store.create(identity, tokens);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const raw = await pool.query(
        'SELECT * FROM "WebSessions" WHERE "Subject" = $1',
        [identity.subject],
    );
    expect(raw.rowCount).toBe(2);
    expect(JSON.stringify(raw.rows)).not.toContain('private-access-token');
    expect(JSON.stringify(raw.rows)).not.toContain('private-refresh-token');
    expect(raw.rows.some((row) => row.SessionIdHash === first)).toBe(false);
    expect((await store.get(first))?.tokens).toEqual(tokens);
    await store.delete(first);
    expect(await store.get(first)).toBeNull();
});

it('allows exactly one concurrent refresh rotation', async () => {
    const id = await store.create(
        { issuer: 'https://issuer.example.test/', subject: 'email|rotation' },
        {
            accessToken: 'before',
            refreshToken: 'refresh-before',
            expiresAt: Date.now() + 60_000,
            scope: 'BikeLog.Access',
        },
    );
    const version = (await store.get(id))!.rotationVersion;
    const [a, b] = await Promise.all([
        store.rotate(id, version, {
            accessToken: 'after-a',
            refreshToken: 'refresh-a',
            expiresAt: Date.now() + 60_000,
            scope: 'BikeLog.Access',
        }),
        store.rotate(id, version, {
            accessToken: 'after-b',
            refreshToken: 'refresh-b',
            expiresAt: Date.now() + 60_000,
            scope: 'BikeLog.Access',
        }),
    ]);
    expect([a, b].sort()).toEqual([false, true]);
    const current = await store.get(id);
    expect(current?.rotationVersion).toBe(version + 1);
    expect(['after-a', 'after-b']).toContain(current?.tokens.accessToken);
});

it('consumes encrypted login state once without exposing the verifier', async () => {
    const state = randomBytes(32).toString('base64url');
    await store.createLoginTransaction(
        state,
        'nonce-private',
        'verifier-private',
        '/garage',
    );
    const raw = await pool.query('SELECT * FROM "OidcLoginTransactions"');
    expect(JSON.stringify(raw.rows)).not.toContain('nonce-private');
    expect(JSON.stringify(raw.rows)).not.toContain('verifier-private');
    expect(await store.consumeLoginTransaction(state)).toEqual({
        nonce: 'nonce-private',
        verifier: 'verifier-private',
        returnTo: '/garage',
    });
    expect(await store.consumeLoginTransaction(state)).toBeNull();
});
