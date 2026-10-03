import { test, expect } from '@playwright/test';
import { mockVisual, bikeId, bike } from './fixtures';
for (const status of [400, 404, 409, 500, 503])
    test(`adapter ${status} preserves attempted fields and never retries a write`, async ({
        page,
    }) => {
        await mockVisual(page);
        let writes = 0;
        await page.route(`**/api/bikes/${bikeId}`, async (route) => {
            if (route.request().method() === 'PUT') {
                writes++;
                await route.fulfill({
                    status,
                    contentType: 'application/problem+json',
                    body: JSON.stringify({
                        title: `Injected ${status}`,
                        code: status === 409 ? 'stale_version' : 'injected',
                        currentVersion: 2,
                    }),
                });
            } else
                await route.fulfill({
                    contentType: 'application/json',
                    body: JSON.stringify({ ...bike, version: 2 }),
                });
        });
        await page.goto(`/?bike=${bikeId}`);
        await page.getByRole('button', { name: 'Edit bike' }).click();
        await page
            .getByLabel('Bike name', { exact: true })
            .fill('Preserved task9 attempt');
        await page.getByRole('button', { name: 'Save bike' }).click();
        await expect(page.locator('.form-error')).toContainText(
            `Injected ${status}`,
        );
        await expect(page.getByLabel('Bike name', { exact: true })).toHaveValue(
            'Preserved task9 attempt',
        );
        if (status >= 500)
            await expect(
                page.getByText(/outcome is uncertain/i).first(),
            ).toBeVisible();
        if (status === 409)
            await expect(
                page.getByText(/Saved version 2/).first(),
            ).toBeVisible();
        await page.waitForTimeout(300);
        expect(writes).toBe(1);
    });
test('dropped successful adapter response: persists once, preserves input, explicit refresh only reads', async ({
    page,
    request,
}, info) => {
    const marker = `${process.env.BIKELOG_E2E_RUN ?? 'task9'}-${info.project.name}-${Date.now()}-lost`;
    await page.goto('/');
    await page.getByRole('button', { name: 'Create bike' }).click();
    await page.getByLabel('Bike name', { exact: true }).fill(marker);
    await page.getByLabel('Make', { exact: true }).fill('Synthetic');
    await page.getByLabel('Model', { exact: true }).fill('Dropped response');
    await page.getByLabel('Kind', { exact: true }).selectOption('gravel');
    await page.getByLabel('Year', { exact: true }).fill('2026');
    let writes = 0;
    let savedId = '';
    await page.route('**/api/bikes', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        writes++;
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        savedId = (await response.json()).id;
        await route.abort('failed');
    });
    await page.getByRole('button', { name: 'Save bike' }).click();
    await expect(page.getByText(/outcome is uncertain/i).first()).toBeVisible();
    await expect(page.getByLabel('Bike name', { exact: true })).toHaveValue(
        marker,
    );
    await page.getByRole('button', { name: 'Refresh saved data' }).click();
    const discovered = page.getByText(marker, { exact: true }).last();
    for (
        let pageNumber = 0;
        pageNumber < 100 && !(await discovered.count());
        pageNumber++
    ) {
        const more = page.getByRole('button', {
            name: 'Load more saved bikes',
        });
        if (!(await more.count())) break;
        const read = page.waitForResponse(
            (response) =>
                new URL(response.url()).pathname === '/api/bikes' &&
                response.request().method() === 'GET',
        );
        await more.click();
        const result = await (await read).json();
        if (result.items.length)
            await expect(
                page
                    .getByRole('heading', {
                        name: result.items.at(-1).displayName,
                        exact: true,
                    })
                    .last(),
            ).toBeVisible();
    }
    await expect(discovered).toBeVisible();
    expect(writes).toBe(1);
    expect(
        (await (await request.get(`/api/bikes/${savedId}`)).json()).name,
    ).toBe(marker);
});
test('browser owns close warning only while unresolved editor work exists', async ({
    page,
}) => {
    await mockVisual(page);
    await page.goto(`/?bike=${bikeId}`);
    await page.getByRole('button', { name: 'Edit bike' }).click();
    await page.getByLabel('Bike name', { exact: true }).fill('Unsaved reload');
    // Effects register after committed input; wait for the actual guard rather than racing reload.
    await expect
        .poll(() =>
            page.evaluate(() => {
                const event = new Event('beforeunload', { cancelable: true });
                window.dispatchEvent(event);
                return event.defaultPrevented;
            }),
        )
        .toBe(true);
    const warning = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const prompt = await warning;
    expect(prompt.type()).toBe('beforeunload');
    await prompt.dismiss();
    await expect(page.getByLabel('Bike name', { exact: true })).toHaveValue(
        'Unsaved reload',
    );
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page
        .getByRole('button', { name: 'Discard changes', exact: true })
        .click();
    let extraWarning = false;
    page.on('dialog', async (dialog) => {
        extraWarning = true;
        await dialog.dismiss();
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Edit bike' })).toBeVisible();
    expect(extraWarning).toBe(false);
});
