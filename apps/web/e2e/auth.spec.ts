import { test, expect } from '@playwright/test';
import pg from 'pg';
import { SessionStore } from '../src/lib/auth/session-store';
import { SESSION_COOKIE, sessionCookie } from '../src/lib/auth/cookies';

test.describe('invited web entry', () => {
    test('browser accepts the secure host cookie from loopback response', async ({ page }) => {
        await page.route('**/cookie-probe', route => route.fulfill({ status: 200, contentType: 'text/html', headers: { 'set-cookie': sessionCookie('a'.repeat(43)) }, body: 'ready' }));
        await page.goto('http://localhost:3000/cookie-probe');
        expect((await page.context().cookies('http://localhost:3000')).some(cookie => cookie.name === SESSION_COOKIE)).toBe(true);
    });
    for (const width of [1440, 390, 320]) {
        test(`signed-out entry fits ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.goto('/');
            await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
            await expect(page.getByRole('link', { name: /sign in with email code/i })).toHaveAttribute('href', '/auth/start?returnTo=%2F');
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        });
    }
});

test.describe('authenticated local pilot', () => {
    test.skip(!process.env.BIKELOG_AUTH_E2E, 'Requires the dedicated local authenticated server and session key.');
    const pool = new pg.Pool({ connectionString: process.env.BIKELOG_WEB_DATABASE_URL });
    const key = process.env.BIKELOG_SESSION_KEY ? Buffer.from(process.env.BIKELOG_SESSION_KEY, 'base64url') : Buffer.alloc(32);
    const store = new SessionStore(pool, key);
    test.afterAll(async () => { await pool.end(); });

    async function signIn(page: import('@playwright/test').Page) {
        await page.route(/\/v2\/logout\?/, async route => {
            const destination = new URL(route.request().url());
            expect(destination.searchParams.get('returnTo')).toBe('http://localhost:3000/?signedOut=1');
            await route.fulfill({ status: 302, headers: { location: 'http://localhost:3000/?signedOut=1' }, body: '' });
        });
        const id = await store.create({ issuer: 'https://e2e.local/', subject: 'email|auth-ui-e2e' }, {
            accessToken: 'e2e-token', refreshToken: null, expiresAt: Date.now() + 3600_000, scope: 'BikeLog.Access',
        });
        await page.context().addCookies([{ name: SESSION_COOKIE, value: id, domain: 'localhost', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
        return id;
    }

    test('account menu signs out and deletes the server session', async ({ page }) => {
        const id = await signIn(page);
        await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null }) }));
        await page.goto('/');
        await expect(page.getByRole('button', { name: 'Open account menu' })).toBeVisible();
        await page.getByRole('button', { name: 'Open account menu' }).click();
        await page.getByRole('button', { name: 'Sign out' }).click();
        await expect(page.getByRole('heading', { name: 'You’re signed out.' })).toBeVisible();
        expect(await store.get(id)).toBeNull();
    });

    test('expired session replaces the garage and offers sign-in', async ({ page }) => {
        const id = await signIn(page);
        await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ status: 401, code: 'sign_in_required', title: 'Sign in' }) }));
        await page.goto('/');
        await expect(page.getByRole('alertdialog', { name: 'Pick up where you left off.' })).toBeVisible();
        await page.getByRole('button', { name: 'Sign in again' }).click();
        await expect(page.getByRole('heading', { name: 'You’re signed out.' })).toBeVisible();
        expect(await store.get(id)).toBeNull();
    });

    test('unprovisioned account explains pilot access', async ({ page }) => {
        const id = await signIn(page);
        await page.route('**/api/**', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ status: 403, code: 'pilot_access_required', title: 'Pilot access required' }) }));
        await page.goto('/');
        await expect(page.getByRole('alertdialog', { name: 'Your garage is not ready yet.' })).toBeVisible();
        await store.delete(id);
    });
});
