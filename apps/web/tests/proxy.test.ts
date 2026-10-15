// @vitest-environment node
import { it, expect, vi, afterEach } from 'vitest';
import { forwardApi } from '../src/lib/proxy';
const id = '11111111-1111-4111-8111-111111111111';
afterEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllEnvs());
it('proxyRejectsForeignOriginAndRedirects', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
        calls++;
        return new Response(null, {
            status: 302,
            headers: { location: 'https://foreign.example' },
        });
    });
    const foreign = new Request('http://127.0.0.1:3000/api/bikes', {
        method: 'POST',
        headers: {
            origin: 'https://foreign.example',
            'content-type': 'application/json',
        },
        body: '{}',
    });
    expect((await forwardApi(foreign, ['bikes'])).status).toBe(403);
    expect(calls).toBe(0);
    const local = new Request('http://127.0.0.1:3000/api/bikes');
    const response = await forwardApi(local, ['bikes']);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
        code: 'backend_unavailable',
    });
    expect(calls).toBe(1);
});
it('rejects path traversal, foreign destinations and undocumented verbs without fetching', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
        calls++;
        return new Response('{}');
    });
    for (const path of [
        ['https:', 'evil.example'],
        ['bikes', '..', 'components'],
        ['bikes', '%2e%2e'],
        ['bikes', id, 'rides', 'extra'],
    ])
        expect(
            (
                await forwardApi(
                    new Request('http://127.0.0.1:3000/api/bikes'),
                    path,
                )
            ).status,
        ).toBe(404);
    expect(
        (
            await forwardApi(
                new Request('http://127.0.0.1:3000/api/bikes', {
                    method: 'PATCH',
                }),
                ['bikes'],
            )
        ).status,
    ).toBe(405);
    expect(calls).toBe(0);
});
it('forwards only fixed destination JSON and allowed headers; preserves 204', async () => {
    let received: Request | undefined;
    let redirect: RequestRedirect | undefined;
    vi.stubGlobal(
        'fetch',
        async (input: RequestInfo | URL, init?: RequestInit) => {
            received = new Request(input, init);
            redirect = init?.redirect;
            return new Response(null, { status: 204 });
        },
    );
    const request = new Request(
        `http://127.0.0.1:3000/api/rides/${id}?expectedVersion=2`,
        {
            method: 'DELETE',
            headers: {
                origin: 'http://127.0.0.1:3000',
                cookie: 'private=1',
                authorization: 'secret',
                host: '127.0.0.1:3000',
                'x-forwarded-host': 'foreign',
            },
        },
    );
    const response = await forwardApi(request, ['rides', id]);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(received?.url).toBe(
        `http://127.0.0.1:5080/api/rides/${id}?expectedVersion=2`,
    );
    expect(received?.headers.has('cookie')).toBe(false);
    expect(received?.headers.has('authorization')).toBe(false);
    expect(redirect).toBe('manual');
    expect(response.headers.get('cache-control')).toBe('no-store');
});
it('sanitizes connection failure and blocks non-JSON upstream data', async () => {
    vi.stubGlobal('fetch', async () => {
        throw new Error('secret upstream details');
    });
    const response = await forwardApi(
        new Request('http://127.0.0.1:3000/api/bikes'),
        ['bikes'],
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret');
    vi.stubGlobal(
        'fetch',
        async () =>
            new Response('<html>private</html>', {
                headers: { 'content-type': 'text/html' },
            }),
    );
    expect(
        (
            await forwardApi(new Request('http://127.0.0.1:3000/api/bikes'), [
                'bikes',
            ])
        ).status,
    ).toBe(502);
});
it('passes ProblemDetails body/status without secret headers', async () => {
    vi.stubGlobal(
        'fetch',
        async () =>
            new Response('{"code":"stale_version","currentVersion":7}', {
                status: 409,
                headers: {
                    'content-type': 'application/problem+json',
                    'set-cookie': 'private=1',
                },
            }),
    );
    const response = await forwardApi(
        new Request('http://127.0.0.1:3000/api/bikes'),
        ['bikes'],
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
        code: 'stale_version',
        currentVersion: 7,
    });
    expect(response.headers.has('set-cookie')).toBe(false);
});
it('requires loopback origin and JSON for mutations', async () => {
    expect(
        (
            await forwardApi(
                new Request('http://127.0.0.1:3000/api/bikes', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: '{}',
                }),
                ['bikes'],
            )
        ).status,
    ).toBe(403);
    expect(
        (
            await forwardApi(
                new Request('http://127.0.0.1:3000/api/bikes', {
                    method: 'POST',
                    headers: {
                        origin: 'http://127.0.0.1:3000',
                        'content-type': 'text/plain',
                    },
                    body: '{}',
                }),
                ['bikes'],
            )
        ).status,
    ).toBe(415);
});
it('accepts Next internal URL normalization only for the exact public loopback Host', async () => {
    vi.stubGlobal(
        'fetch',
        async () =>
            new Response('{"items":[],"nextCursor":null}', {
                headers: { 'content-type': 'application/json' },
            }),
    );
    const normalized = new Request('http://localhost:3000/api/bikes', {
        headers: { host: '127.0.0.1:3000' },
    });
    expect((await forwardApi(normalized, ['bikes'])).status).toBe(200);
    const foreignHost = new Request('http://127.0.0.1:3000/api/bikes', {
        headers: { host: 'evil.example', 'x-forwarded-host': '127.0.0.1:3000' },
    });
    expect((await forwardApi(foreignHost, ['bikes'])).status).toBe(403);
});

it('authenticated proxy requires a server session token before any upstream fetch', async () => {
    vi.stubEnv('BIKELOG_WEB_ACCESS_MODE', 'Authenticated');
    vi.stubEnv('WEB_PUBLIC_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('BIKELOG_API_ORIGIN', 'http://127.0.0.1:5080');
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
        calls++;
        return new Response('{}');
    });
    const response = await forwardApi(
        new Request('http://localhost:3000/api/bikes'),
        ['bikes'],
        null,
    );
    expect(response.status).toBe(401);
    expect(calls).toBe(0);
});

it('authenticated proxy forwards only the server-held bearer and no browser credentials', async () => {
    vi.stubEnv('BIKELOG_WEB_ACCESS_MODE', 'Authenticated');
    vi.stubEnv('WEB_PUBLIC_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('BIKELOG_API_ORIGIN', 'http://127.0.0.1:5080');
    let received: Request | undefined;
    vi.stubGlobal(
        'fetch',
        async (input: RequestInfo | URL, init?: RequestInit) => {
            received = new Request(input, init);
            return new Response(
                '{"email":"pilot@example.test","displayName":null}',
                {
                    headers: { 'content-type': 'application/json' },
                },
            );
        },
    );
    const browser = new Request('http://localhost:3000/api/me', {
        headers: {
            authorization: 'Bearer attacker-browser-token',
            cookie: 'other=private',
            host: 'localhost:3000',
            'x-forwarded-host': 'evil.example',
        },
    });
    const response = await forwardApi(browser, ['me'], 'server-access-token');
    expect(response.status).toBe(200);
    expect(received?.headers.get('authorization')).toBe(
        'Bearer server-access-token',
    );
    expect(received?.headers.has('cookie')).toBe(false);
    expect(received?.headers.has('x-forwarded-host')).toBe(false);
    expect(received?.url).toBe('http://127.0.0.1:5080/api/me');
});
it('forwards every operation the generated client can call', async () => {
    const { readFile } = await import('node:fs/promises');
    const snapshot = JSON.parse(
        await readFile(
            new URL(
                '../../../packages/api-client/openapi.json',
                import.meta.url,
            ),
            'utf8',
        ),
    ) as { paths: Record<string, Record<string, unknown>> };
    const forwarded: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
        forwarded.push(new Request(input).url);
        return Response.json({});
    });
    const blocked: string[] = [];
    // API routes the web client has no wrapper for and deliberately does not proxy.
    const unused = new Set(['GET /api/maintenance/{id}']);
    for (const [route, operations] of Object.entries(snapshot.paths)) {
        if (!route.startsWith('/api/')) continue;
        const path = route.slice(5).replace('{id}', id).split('/');
        for (const method of Object.keys(operations)) {
            const write = method !== 'get';
            const response = await forwardApi(
                new Request(`http://127.0.0.1:3000${route}`, {
                    method: method.toUpperCase(),
                    headers: write
                        ? {
                              origin: 'http://127.0.0.1:3000',
                              'content-type': 'application/json',
                          }
                        : undefined,
                    body: write && method !== 'delete' ? '{}' : undefined,
                }),
                path,
            );
            const name = `${method.toUpperCase()} ${route}`;
            if ([404, 405].includes(response.status) && !unused.has(name))
                blocked.push(name);
        }
    }
    expect(blocked).toEqual([]);
    expect(forwarded.length).toBeGreaterThan(0);
});

const hostedOrigin = 'https://ca-bikelog.example.azurecontainerapps.io';
const hostedHost = 'ca-bikelog.example.azurecontainerapps.io';
function hostedEnv(origin = hostedOrigin, upstream = 'http://127.0.0.1:5080') {
    vi.stubEnv('BIKELOG_WEB_ACCESS_MODE', 'Authenticated');
    vi.stubEnv('WEB_PUBLIC_ORIGIN', origin);
    vi.stubEnv('BIKELOG_API_ORIGIN', upstream);
}
function okFetch() {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
        calls++;
        return Response.json({ items: [], nextCursor: null });
    });
    return () => calls;
}

it('authenticated proxy accepts an https public origin behind TLS-terminating ingress', async () => {
    hostedEnv();
    const calls = okFetch();
    const behindIngress = new Request(`http://${hostedHost}/api/bikes`, {
        headers: { host: hostedHost, 'x-forwarded-proto': 'https' },
    });
    expect((await forwardApi(behindIngress, ['bikes'], 'token')).status).toBe(
        200,
    );
    expect(calls()).toBe(1);
});

it('authenticated proxy refuses plain http origins and any other upstream', async () => {
    const calls = okFetch();
    for (const [origin, upstream] of [
        [
            'http://ca-bikelog.example.azurecontainerapps.io',
            'http://127.0.0.1:5080',
        ],
        [hostedOrigin, 'http://127.0.0.1:5081'],
        [hostedOrigin, 'http://localhost:5080'],
        [hostedOrigin, 'https://api.example.test'],
    ]) {
        hostedEnv(origin, upstream);
        await expect(
            forwardApi(
                new Request(`${origin}/api/bikes`, {
                    headers: { host: new URL(origin).host },
                }),
                ['bikes'],
                'token',
            ),
        ).rejects.toThrow();
    }
    expect(calls()).toBe(0);
});

it('authenticated proxy refuses a mismatched Host, forwarded http and a foreign Origin', async () => {
    hostedEnv();
    const calls = okFetch();
    const attempts = [
        new Request(`${hostedOrigin}/api/bikes`, {
            headers: { host: 'evil.example', 'x-forwarded-host': hostedHost },
        }),
        new Request(`http://${hostedHost}/api/bikes`, {
            headers: { host: hostedHost, 'x-forwarded-proto': 'http' },
        }),
        new Request(`${hostedOrigin}/api/bikes`, {
            method: 'POST',
            headers: {
                host: hostedHost,
                origin: 'https://evil.example',
                'content-type': 'application/json',
            },
            body: '{}',
        }),
    ];
    for (const request of attempts) {
        const response = await forwardApi(request, ['bikes'], 'token');
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'foreign_origin' });
    }
    expect(calls()).toBe(0);
});
it('forwards the bike lifecycle routes with exactly their documented verbs', async () => {
    const forwarded: string[] = [];
    vi.stubGlobal(
        'fetch',
        async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = new Request(input, init);
            forwarded.push(
                `${request.method} ${new URL(request.url).pathname}`,
            );
            return Response.json({});
        },
    );
    const send = (method: string, path: string[]) =>
        forwardApi(
            new Request(`http://127.0.0.1:3000/api/${path.join('/')}`, {
                method,
                headers:
                    method === 'GET'
                        ? undefined
                        : {
                              origin: 'http://127.0.0.1:3000',
                              'content-type': 'application/json',
                          },
                body: ['POST', 'PUT'].includes(method) ? '{}' : undefined,
            }),
            path,
        );
    const allowed: [string, string[]][] = [
        ['GET', ['rides']],
        ['PUT', ['bikes', id, 'status']],
        ['GET', ['bikes', id, 'deletion-preview']],
        ['POST', ['bikes', id, 'delete']],
        ['DELETE', ['components', id]],
    ];
    for (const [method, path] of allowed)
        expect((await send(method, path)).status).toBe(200);
    expect(forwarded).toEqual(
        allowed.map(([method, path]) => `${method} /api/${path.join('/')}`),
    );
    const refused: [string, string[]][] = [
        ['DELETE', ['rides']],
        ['GET', ['bikes', id, 'status']],
        ['POST', ['bikes', id, 'deletion-preview']],
        ['DELETE', ['bikes', id]],
        ['GET', ['bikes', id, 'delete']],
    ];
    for (const [method, path] of refused)
        expect([404, 405]).toContain((await send(method, path)).status);
    expect(forwarded).toHaveLength(allowed.length);
});
