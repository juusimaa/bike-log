// @vitest-environment node
import { it, expect, vi, afterEach } from 'vitest';
import { forwardApi } from '../src/lib/proxy';
const id = '11111111-1111-4111-8111-111111111111';
afterEach(() => vi.unstubAllGlobals());
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
