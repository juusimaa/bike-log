import { beforeEach, expect, it, vi } from 'vitest';
import { SESSION_COOKIE } from '../src/lib/auth/cookies';

const store = vi.hoisted(() => ({ delete: vi.fn() }));
vi.mock('../src/lib/auth/config', () => ({ getSessionStore: () => store, readAuthConfig: () => ({ issuer: 'https://pilot.auth0.example/', clientId: 'web-client' }) }));
import { POST } from '../src/app/auth/logout/route';

beforeEach(() => {
    process.env.WEB_PUBLIC_ORIGIN = 'http://localhost:3000';
    store.delete.mockReset();
    store.delete.mockResolvedValue(undefined);
});

function request(origin: string | null, host = 'localhost:3000') {
    const headers = new Headers({ host, cookie: `${SESSION_COOKIE}=${'a'.repeat(43)}` });
    if (origin) headers.set('origin', origin);
    return new Request('http://localhost:3000/auth/logout', { method: 'POST', headers });
}

it('deletes the server session and clears the host cookie on same-origin sign-out', async () => {
    const response = await POST(request('http://localhost:3000'));
    expect(response.status).toBe(200);
    expect(store.delete).toHaveBeenCalledWith('a'.repeat(43));
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    const destination = new URL((await response.json()).logoutUrl);
    expect(destination.origin).toBe('https://pilot.auth0.example');
    expect(destination.pathname).toBe('/v2/logout');
    expect(destination.searchParams.get('client_id')).toBe('web-client');
    expect(destination.searchParams.get('returnTo')).toBe('http://localhost:3000/?signedOut=1');
});

it('rejects forged origins and hosts without deleting the session', async () => {
    expect((await POST(request('https://elsewhere.example'))).status).toBe(403);
    expect((await POST(request('http://localhost:3000', 'elsewhere.example'))).status).toBe(403);
    expect((await POST(request(null))).status).toBe(403);
    expect(store.delete).not.toHaveBeenCalled();
});
