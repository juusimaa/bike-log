import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mockVisual, bikeId } from './fixtures';
test.beforeAll(async ({ browser }, info) => {
    console.log(`Browser ${info.project.name}: ${browser.version()}`);
});
let consoleErrors: string[] = [];
test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
});
test.afterEach(() => {
    expect(consoleErrors, 'Browser console and uncaught errors').toEqual([]);
});
const titles = [
    'Your garage, in good order.',
    'Every part has a story.',
    'Miles worth remembering.',
    'Care that goes the distance.',
];
test('dashboard care-first layout and established secondary views: geometry and overflow', async ({
    page,
}, info) => {
    await page.route('http://127.0.0.1:3000/__approved/**', async (route) => {
        const file = new URL(route.request().url()).pathname.split('/').pop()!;
        expect(['index.html', 'app.js', 'styles.css']).toContain(file);
        await route.fulfill({
            contentType: file.endsWith('.html')
                ? 'text/html'
                : file.endsWith('.css')
                  ? 'text/css'
                  : 'application/javascript',
            body: await readFile(`../../docs/ui-design/${file}`),
        });
    });
    const geometry = async () =>
        page.evaluate(() => {
            const box = (selector: string) => {
                const e = document.querySelector(selector);
                if (!e) return null;
                const b = e.getBoundingClientRect();
                return { x: b.x, y: b.y, width: b.width, height: b.height };
            };
            const main = getComputedStyle(document.querySelector('main')!);
            const h1 = getComputedStyle(document.querySelector('h1')!);
            return {
                sidebar: box('.sidebar'),
                topbar: box('.topbar'),
                hero: box('.hero'),
                art: box('.hero svg'),
                table: box('.table-card'),
                mainPadding: main.padding,
                headingFont: h1.fontSize,
                headingWeight: h1.fontWeight,
            };
        });
    const paired: Record<string, unknown> = {};
    const archive: Record<string, unknown> = {};
    for (const [i, view] of [
        'overview',
        'components',
        'rides',
        'maintenance',
    ].entries()) {
        await page.goto('/__approved/index.html');
        await page.locator(`[data-view="${view}"]`).click();
        await expect(page.locator('#page-title')).toHaveText(titles[i]);
        archive[view] = await page.locator('.sidebar').boundingBox();
        paired[view] = { approved: await geometry() };
        await page.screenshot({
            path: info.outputPath(`approved-${view}.png`),
            fullPage: true,
        });
    }
    await mockVisual(page);
    for (const [i, view] of [
        'overview',
        'components',
        'rides',
        'maintenance',
    ].entries()) {
        await page.goto(`/?bike=${bikeId}&view=${view}`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(
            titles[i],
        );
        expect(await page.locator('.sidebar').boundingBox()).toEqual(
            archive[view],
        );
        const current = await geometry();
        const approved = (
            paired[view] as { approved: Awaited<ReturnType<typeof geometry>> }
        ).approved;
        expect(current.topbar).toEqual(approved.topbar);
        expect(current.mainPadding).toBe(approved.mainPadding);
        expect(current.headingFont).toBe(approved.headingFont);
        expect(current.headingWeight).toBe(approved.headingWeight);
        if (view === 'overview') {
            const care = (await page
                .getByRole('complementary', {
                    name: 'Chain lubrication reminder',
                })
                .boundingBox())!;
            const hero = (await page.locator('.hero').boundingBox())!;
            const stats = (await page
                .getByRole('region', {
                    name: 'Bike statistics',
                })
                .boundingBox())!;
            if (page.viewportSize()!.width > 950) {
                expect(care.x + care.width).toBeLessThan(hero.x);
                expect(Math.abs(care.y - hero.y)).toBeLessThan(2);
                expect(stats.y).toBeGreaterThanOrEqual(hero.y + hero.height);
            } else {
                expect(care.y + care.height).toBeLessThan(hero.y);
            }
            const review = '.impeccable/review';
            await mkdir(review, { recursive: true });
            await page.screenshot({
                path: `${review}/${info.project.name.replace('visual-', '')}.png`,
                fullPage: true,
                animations: 'disabled',
            });
        }
        paired[view] = { ...(paired[view] as object), connected: current };
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(page.viewportSize()!.width);
        if (view === 'overview')
            await expect(
                page.getByRole('complementary', {
                    name: 'Chain lubrication reminder',
                }),
            ).toBeVisible();
        if (view === 'maintenance') {
            await expect(
                page.getByText('<script>window.task9Injected=true</script>', {
                    exact: true,
                }),
            ).toBeVisible();
            expect(
                await page.evaluate(() =>
                    Object.hasOwn(window, 'task9Injected'),
                ),
            ).toBe(false);
        }
        await page.screenshot({
            path: info.outputPath(`connected-${view}.png`),
            fullPage: true,
        });
    }
    const geometryPath = info.outputPath('paired-geometry.json');
    await writeFile(geometryPath, JSON.stringify(paired, null, 2));
    await info.attach('paired-geometry.json', {
        path: geometryPath,
        contentType: 'application/json',
    });
});
test('native dialog traps Tab, Escape returns focus and repeat validation focuses summary', async ({
    page,
}) => {
    await mockVisual(page);
    await page.goto(`/?bike=${bikeId}`);
    const trigger = page.getByRole('button', { name: 'Create bike' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Create bike' });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 15; i++) {
        await page.keyboard.press('Tab');
        expect(
            await dialog.evaluate((d) => d.contains(document.activeElement)),
        ).toBe(true);
    }
    for (let i = 0; i < 15; i++) {
        await page.keyboard.press('Shift+Tab');
        expect(
            await dialog.evaluate((d) => d.contains(document.activeElement)),
        ).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    for (let i = 0; i < 2; i++) {
        await page.getByRole('button', { name: 'Save bike' }).click();
        await expect(page.locator('.form-error')).toBeFocused();
    }
});
test('real clean and dirty Back/Forward preserve both history branches', async ({
    page,
}, info) => {
    await mockVisual(page);
    await page.goto(`/?bike=${bikeId}&view=overview`);
    await page.getByRole('link', { name: 'Rides', exact: true }).click();
    await page.getByRole('button', { name: 'Create bike' }).click();
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(/view=rides/);
    await page.getByRole('button', { name: 'Add a ride', exact: true }).click();
    await page.getByLabel('Distance (km)', { exact: true }).fill('65');
    await page.goBack();
    const confirmation = page.getByRole('dialog', {
        name: 'Discard unsaved changes?',
    });
    await expect(confirmation).toBeVisible();
    const keep = confirmation.getByRole('button', { name: 'Keep editing' });
    const discard = confirmation.getByRole('button', {
        name: 'Discard changes',
    });
    await expect(keep).toBeFocused();
    await expect(keep).toHaveCSS('background-color', 'rgb(52, 91, 67)');
    const keepBox = (await keep.boundingBox())!;
    const discardBox = (await discard.boundingBox())!;
    expect(keepBox.y).toBe(discardBox.y);
    expect(keepBox.x - discardBox.x - discardBox.width).toBeGreaterThanOrEqual(
        8,
    );
    await page.screenshot({
        path: info.outputPath('discard-changes-dialog.png'),
    });
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByLabel('Distance (km)', { exact: true })).toHaveValue(
        '65',
    );
    await page.goBack();
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page).toHaveURL(/view=overview/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(/view=rides/);
});
test('connected secondary views retain approved cards and table containment', async ({
    page,
}) => {
    await mockVisual(page);
    for (const view of ['components', 'rides', 'maintenance']) {
        await page.goto(`/?bike=${bikeId}&view=${view}`);
        await expect(
            page.getByRole('region', { name: 'Bike statistics' }),
        ).toBeVisible();
        if (view === 'maintenance')
            await expect(
                page.getByRole('complementary', {
                    name: 'Chain lubrication reminder',
                }),
            ).toBeVisible();
        await expect(page.locator('.card.table-card')).toBeVisible();
        await expect(
            page.locator('.card.table-card .table-wrap'),
        ).toBeVisible();
        if (page.viewportSize()!.width === 390)
            expect(
                await page
                    .locator('.card.table-card .table-wrap')
                    .evaluate((e) => e.scrollWidth),
            ).toBeGreaterThan(
                await page
                    .locator('.card.table-card .table-wrap')
                    .evaluate((e) => e.clientWidth),
            );
        expect(
            await page.locator('main').evaluate((e) => e.scrollWidth),
        ).toBeLessThanOrEqual(
            await page.locator('main').evaluate((e) => e.clientWidth),
        );
    }
});
test('blank component model has explicit label and fit validation refocuses every attempt', async ({
    page,
}) => {
    await mockVisual(page);
    await page.route('**/api/bikes/*/installations**', async (route) => {
        const { rows } = await import('./fixtures');
        await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                items: rows.map((r, i) =>
                    i ? r : { ...r, component: { ...r.component, model: '' } },
                ),
                nextCursor: null,
            }),
        });
    });
    await page.goto(`/?bike=${bikeId}`);
    await expect(
        page.getByText('Shimano Model not provided', { exact: true }),
    ).toBeVisible();
    await page.route('**/api/bikes/*/installations**', async (route) => {
        await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ items: [], nextCursor: null }),
        });
    });
    await page.goto(`/?bike=${bikeId}&view=components`);
    await page.getByRole('button', { name: 'Fit chain', exact: true }).click();
    for (let i = 0; i < 2; i++) {
        await page.getByLabel('Model', { exact: true }).focus();
        await page
            .getByRole('button', { name: 'Fit component', exact: true })
            .click();
        await expect(page.locator('.form-error')).toBeFocused();
    }
});
test('late previous-bike overview with distinct totals cannot replace selected bike', async ({
    page,
}) => {
    await mockVisual(page);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((r) => (entered = r));
    const gate = new Promise<void>((r) => (release = r));
    let settled!: () => void;
    const handlerSettled = new Promise<void>((r) => (settled = r));
    const responseSettled = new Promise<void>((resolve) => {
        const done = (request: import('@playwright/test').Request) => {
            if (
                new URL(request.url()).pathname ===
                `/api/bikes/${bikeId}/overview`
            )
                resolve();
        };
        page.on('requestfinished', done);
        page.on('requestfailed', done);
    });
    await page.route(`**/api/bikes/${bikeId}/overview`, async (route) => {
        entered();
        await gate;
        const { overview } = await import('./fixtures');
        try {
            await route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify(overview()),
            });
        } catch (error) {
            if (!route.request().failure()) throw error;
        } finally {
            settled();
        }
    });
    await page.goto(`/?bike=${bikeId}`);
    await started;
    await page.getByRole('button', { name: /Specialized Allez/ }).click();
    await expect(
        page
            .getByRole('region', { name: 'Bike statistics' })
            .locator('.stat')
            .first()
            .getByText('384 km', { exact: true }),
    ).toBeVisible();
    release();
    await Promise.all([handlerSettled, responseSettled]);
    await page.evaluate(
        () =>
            new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve()),
                ),
            ),
    );
    await expect(
        page
            .getByRole('region', { name: 'Bike statistics' })
            .locator('.stat')
            .first()
            .getByText('384 km', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('787 km', { exact: true })).toHaveCount(0);
});
test('maintenance and reminder composition has unique React identities', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    await mockVisual(page);
    await page.goto(`/?bike=${bikeId}&view=maintenance`);
    await expect(
        page.getByRole('complementary', { name: 'Chain lubrication reminder' }),
    ).toBeVisible();
    expect(errors.filter((message) => message.includes('same key'))).toEqual(
        [],
    );
});
test('approved server snapshot statistics and three latest activities remain visible', async ({
    page,
}) => {
    await mockVisual(page);
    await page.goto(`/?bike=${bikeId}`);
    const stats = page.getByRole('region', { name: 'Bike statistics' });
    await expect(
        stats.locator('.stat-label').filter({ hasText: 'Current chain' }),
    ).toBeVisible();
    await expect(stats.getByText('350 km', { exact: true })).toBeVisible();
    await expect(stats.getByText('787 km', { exact: true })).toBeVisible();
    await expect(page.locator('.activity')).toHaveCount(3);
});
test('summary spending stays fully readable inside its card', async ({
    page,
}) => {
    await mockVisual(page);
    await page.goto(`/?bike=${bikeId}`);
    await expect(
        page.getByRole('region', { name: 'Bike statistics' }),
    ).toBeVisible();
    const amounts = page.locator('.stat-value');
    for (const amount of await amounts.all())
        expect(
            await amount.evaluate((e) => e.scrollWidth),
            'stat amount must not be clipped',
        ).toBeLessThanOrEqual(await amount.evaluate((e) => e.clientWidth));
});
test('styled real dialog and visible aria-live success notification', async ({
    page,
}, info) => {
    await mockVisual(page);
    const { bike } = await import('./fixtures');
    await page.route(`**/api/bikes/${bikeId}`, async (route) => {
        await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                ...bike,
                name: 'Styled save',
                displayName: 'Styled save',
                version: 2,
            }),
        });
    });
    await page.goto(`/?bike=${bikeId}`);
    await page.getByRole('button', { name: 'Edit bike' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit bike' });
    const make = page.getByLabel('Make', { exact: true });
    await make.focus();
    const style = await make.evaluate((input) => {
        const css = getComputedStyle(input),
            field = input.parentElement!;
        return {
            radius: css.borderRadius,
            shadow: css.boxShadow,
            width: input.getBoundingClientRect().width,
            fieldWidth: field.getBoundingClientRect().width,
        };
    });
    expect(style.radius).toBe('8px');
    expect(style.shadow).not.toBe('none');
    expect(Math.abs(style.width - style.fieldWidth)).toBeLessThan(2);
    const dialogPath = `../../.local/evidence/task9/final-${info.project.name}-styled-dialog.png`;
    await page.screenshot({ path: dialogPath, fullPage: true });
    await info.attach('Styled real dialog', {
        path: dialogPath,
        contentType: 'image/png',
    });
    await page.getByLabel('Bike name', { exact: true }).fill('Styled save');
    await page.getByRole('button', { name: 'Save bike', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const toast = page.getByRole('status');
    await expect(toast).toHaveText('Styled save saved.');
    await expect(toast).toHaveAttribute('aria-live', 'polite');
    await expect(toast).toHaveCSS('opacity', '1');
    await expect(toast).toHaveCSS('position', 'fixed');
    const box = await toast.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    const toastPath = `../../.local/evidence/task9/final-${info.project.name}-success-toast.png`;
    await page.screenshot({ path: toastPath, fullPage: true });
    await info.attach('Visible success notification', {
        path: toastPath,
        contentType: 'image/png',
    });
});

test('design action placement, spacing and component replacement remain usable', async ({
    page,
}) => {
    await mockVisual(page);
    await page.goto(`/?bike=${bikeId}`);
    const heading = page.locator('.heading-actions');
    await expect(heading.getByRole('button')).toHaveCount(2);
    await expect(
        page
            .locator('.bike-selector')
            .getByRole('button', { name: 'Create bike' }),
    ).toBeVisible();
    const buttons = await heading.getByRole('button').all();
    const first = (await buttons[0].boundingBox())!;
    const second = (await buttons[1].boundingBox())!;
    expect(second.x - first.x - first.width).toBeGreaterThanOrEqual(8);
    await expect(
        page
            .locator('.hero-actions')
            .getByRole('button', { name: 'Edit bike' }),
    ).toBeVisible();
    if (page.viewportSize()!.width === 390) {
        await expect(
            page.getByText(
                'Scroll horizontally for full status and component actions.',
            ),
        ).toBeVisible();
        const table = page.getByRole('region', {
            name: 'Current components, scroll for more columns',
        });
        await table.focus();
        await expect(table).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect
            .poll(() => table.evaluate((e) => e.scrollLeft))
            .toBeGreaterThan(0);
    }
    await page
        .getByRole('button', { name: 'Replace chain', exact: true })
        .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const cancel = (await dialog
        .getByRole('button', { name: 'Cancel', exact: true })
        .boundingBox())!;
    const save = (await dialog
        .getByRole('button', { name: 'Replace component', exact: true })
        .boundingBox())!;
    expect(save.y).toBe(cancel.y);
    expect(save.x - cancel.x - cancel.width).toBeGreaterThanOrEqual(8);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('link', { name: 'Components', exact: true }).click();
    await expect(
        page.getByRole('combobox', { name: 'Filter components' }),
    ).toBeVisible();
    await expect(page.locator('.component-library')).not.toHaveAttribute(
        'open',
    );
    await page
        .getByRole('combobox', { name: 'Filter components' })
        .selectOption('all');
    await expect(
        page.getByRole('combobox', { name: 'Filter components' }),
    ).toHaveValue('all');
});
