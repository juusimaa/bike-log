// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { DELETE, GET, POST, PUT } from '../src/app/healthz/route';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

it('returns 200 ok when the API is ready, without caching', async () => {
    let target = '';
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
        target = new Request(input).url;
        return Response.json({ status: 'ready' });
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(target).toBe('http://127.0.0.1:5080/health/ready');
});

it('returns 503 unavailable when the API is not ready, unreachable or slow', async () => {
    const failures: (() => Promise<Response>)[] = [
        async () => new Response(null, { status: 503 }),
        async () => {
            throw new Error('connect ECONNREFUSED 127.0.0.1:5080 private');
        },
    ];
    for (const failure of failures) {
        vi.stubGlobal('fetch', failure);
        const response = await GET();
        expect(response.status).toBe(503);
        expect(await response.text()).toBe('unavailable');
        expect(response.headers.get('cache-control')).toBe('no-store');
    }
});

it('gives up after 3 seconds', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
        'fetch',
        (_input: RequestInfo | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                signal = init?.signal ?? undefined;
                signal?.addEventListener('abort', () =>
                    reject(signal?.reason),
                );
            }),
    );
    const started = Date.now();
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('unavailable');
    expect(signal?.aborted).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2900);
    expect(Date.now() - started).toBeLessThan(4500);
}, 10_000);

it('allows only GET', async () => {
    for (const handler of [POST, PUT, DELETE]) {
        const response = await handler();
        expect(response.status).toBe(405);
        expect(response.headers.get('allow')).toBe('GET');
    }
});
