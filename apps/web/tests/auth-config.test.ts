// @vitest-environment node
import { afterAll, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    assertSafeAccessMode,
    sessionPoolConfig,
} from '../src/lib/auth/config';

const dir = mkdtempSync(join(tmpdir(), 'bikelog-ca-'));
const caFile = join(dir, 'aiven-ca-certificate');
writeFileSync(caFile, '-----BEGIN CERTIFICATE-----\nsynthetic\n');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const hosted =
    'postgresql://bikelog:s%40cret@pg-bikelog.example.test:12345/defaultdb';

it('keeps the loopback session database without TLS', () => {
    const local = 'postgresql://bikelog:pw@127.0.0.1:54329/bikelog_dev';
    expect(
        sessionPoolConfig({ BIKELOG_WEB_DATABASE_URL: local }),
    ).toEqual({ connectionString: local, max: 2 });
});

it('accepts a non-loopback database only with a verified CA file', () => {
    expect(
        sessionPoolConfig({
            BIKELOG_WEB_DATABASE_URL: hosted,
            BIKELOG_DATABASE_CA_FILE: caFile,
        }),
    ).toEqual({
        host: 'pg-bikelog.example.test',
        port: 12345,
        database: 'defaultdb',
        user: 'bikelog',
        password: 's@cret',
        ssl: {
            ca: '-----BEGIN CERTIFICATE-----\nsynthetic\n',
            rejectUnauthorized: true,
        },
        max: 2,
    });
});

it('refuses a non-loopback database without a readable CA file', () => {
    expect(() =>
        sessionPoolConfig({ BIKELOG_WEB_DATABASE_URL: hosted }),
    ).toThrow(/CA/);
    expect(() =>
        sessionPoolConfig({
            BIKELOG_WEB_DATABASE_URL: hosted,
            BIKELOG_DATABASE_CA_FILE: join(dir, 'missing'),
        }),
    ).toThrow(/CA/);
});

it('refuses URLs that disable or skip certificate verification', () => {
    for (const mode of ['disable', 'no-verify']) {
        expect(() =>
            sessionPoolConfig({
                BIKELOG_WEB_DATABASE_URL: `${hosted}?sslmode=${mode}`,
                BIKELOG_DATABASE_CA_FILE: caFile,
            }),
        ).toThrow(/sslmode/);
    }
});

it('refuses Synthetic mode in production behind a non-loopback origin', () => {
    expect(() =>
        assertSafeAccessMode({
            NODE_ENV: 'production',
            BIKELOG_WEB_ACCESS_MODE: 'Synthetic',
            WEB_PUBLIC_ORIGIN: 'https://ca-bikelog.example.azurecontainerapps.io',
        }),
    ).toThrow(/Synthetic/);
    // The local container stack runs Synthetic production builds on loopback.
    expect(() =>
        assertSafeAccessMode({
            NODE_ENV: 'production',
            BIKELOG_WEB_ACCESS_MODE: 'Synthetic',
        }),
    ).not.toThrow();
    expect(() =>
        assertSafeAccessMode({
            NODE_ENV: 'production',
            BIKELOG_WEB_ACCESS_MODE: 'Authenticated',
            WEB_PUBLIC_ORIGIN: 'https://ca-bikelog.example.azurecontainerapps.io',
        }),
    ).not.toThrow();
});
