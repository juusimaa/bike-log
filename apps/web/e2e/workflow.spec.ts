import type {
    InstallationListItem,
    MaintenanceResponse,
    RideResponse,
} from '@bikelog/api-client';
import { test, expect, type Page } from '@playwright/test';
import { apiRead, discoverBike, positions } from './fixtures';
test.beforeAll(async ({ browser }, info) => {
    console.log(`Browser ${info.project.name}: ${browser.version()}`);
});
async function close(page: Page) {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function create(page: Page, name: string) {
    await page.getByRole('button', { name: 'Create bike' }).click();
    for (const [label, value] of [
        ['Bike name', name],
        ['Make', 'Synthetic'],
        ['Model', 'Task9'],
        ['Year', '2026'],
    ])
        await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel('Kind', { exact: true }).selectOption('gravel');
    await page.getByRole('button', { name: 'Save bike' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/bike=/);
    return new URL(page.url()).searchParams.get('bike')!;
}
/** Opens every "N not recorded" fold so position rows are reachable. */
async function revealPositions(page: Page) {
    await page.locator('section.group').first().waitFor();
    const folds = page.locator('details.unrecorded:not([open]) > summary');
    while (await folds.count()) await folds.first().click();
}
async function fitNew(
    page: Page,
    label: string,
    model: string,
    when: string,
    weight?: string,
) {
    await revealPositions(page);
    await page
        .getByRole('button', { name: `Fit ${label}`, exact: true })
        .click();
    await page.getByLabel('Make', { exact: true }).fill('Synthetic');
    await page.getByLabel('Model', { exact: true }).fill(model);
    if (weight) await page.getByLabel('Weight (g)').fill(weight);
    await page.getByLabel('Date and time', { exact: true }).fill(when);
    await page.getByRole('button', { name: 'Fit part', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function logRide(
    page: Page,
    name: string,
    distance: string,
    time: string,
) {
    await page.getByRole('button', { name: 'Add a ride', exact: true }).click();
    await page.getByLabel('Ride name', { exact: true }).fill(name);
    await page.getByLabel('Start time', { exact: true }).fill(time);
    await page.getByLabel('Distance (km)', { exact: true }).fill(distance);
    await page.getByRole('button', { name: 'Save ride' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function configure(page: Page, method: string, wax: string) {
    await page.getByRole('button', { name: 'Configure reminder' }).click();
    await page.getByLabel('Enabled', { exact: true }).check();
    await page.getByLabel('Method', { exact: true }).selectOption(method);
    await page.getByLabel('Oil interval (km)', { exact: true }).fill('150');
    await page.getByLabel('Wax interval (km)', { exact: true }).fill(wax);
    await page.getByRole('button', { name: 'Save reminder' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
}
test('color names persist through bike creation, editing and clearing', async ({
    page,
    request,
}, info) => {
    const marker = `${process.env.BIKELOG_E2E_RUN ?? 'color'}-${info.project.name}-${Date.now()}`;
    await page.goto('/');
    await page.getByRole('button', { name: 'Create bike' }).click();
    for (const [label, value] of [
        ['Bike name', marker],
        ['Make', 'Canyon'],
        ['Model', 'Grizl 7'],
        ['Year', '2026'],
    ])
        await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel('Kind', { exact: true }).selectOption('gravel');
    await page
        .getByLabel('Color', { exact: true })
        .pressSequentially('Hazy IPA');
    await expect(page.getByLabel('Color', { exact: true })).toHaveValue(
        'Hazy IPA',
    );
    await page.getByRole('button', { name: 'Save bike' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const id = new URL(page.url()).searchParams.get('bike')!;
    expect((await apiRead(request, `bikes/${id}`)).color).toBe('Hazy IPA');
    await page.reload();
    await page.getByRole('button', { name: 'Edit bike' }).click();
    await expect(page.getByLabel('Color', { exact: true })).toHaveValue(
        'Hazy IPA',
    );
    await page.getByLabel('Color', { exact: true }).fill('Stealth Black');
    await page.getByRole('button', { name: 'Save bike' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await apiRead(request, `bikes/${id}`)).color).toBe('Stealth Black');
    await page.getByRole('button', { name: 'Edit bike' }).click();
    await page.getByLabel('Color', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Save bike' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await apiRead(request, `bikes/${id}`)).color).toBeNull();
});
test('real adapter persistence: two bikes, all positions, estimates, atomic replacement, fresh discovery, correction and deletion', async ({
    page,
    request,
    browser,
}, info) => {
    const marker = `${process.env.BIKELOG_E2E_RUN ?? 'task9'}-${info.project.name}-${Date.now()}`;
    await page.goto('/');
    const id = await create(page, marker + '-A');
    await create(page, marker + '-B');
    await discoverBike(page, marker + '-A');
    await page.getByRole('link', { name: 'Components', exact: true }).click();
    for (const position of positions)
        await fitNew(
            page,
            position.replaceAll('-', ' '),
            `${marker}-${position}`,
            '2026-09-01T10:00',
        );
    await logRide(page, marker + '-65', '65', '2026-09-02T10:00');
    await page
        .getByRole('button', { name: 'Log maintenance', exact: true })
        .click();
    await page
        .getByLabel('Task', { exact: true })
        .fill(marker + ' old rear inspection');
    await page
        .getByLabel('Date and time', { exact: true })
        .fill('2026-09-02T12:00');
    await page
        .getByLabel('Association', { exact: true })
        .selectOption('rear-tyre');
    await page
        .getByLabel('Notes', { exact: true })
        .fill(marker + ' retained service notes');
    await page.getByLabel('Cost (EUR)', { exact: true }).fill('0');
    await page.getByRole('button', { name: 'Save maintenance' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const installations = (
        await apiRead(
            request,
            `bikes/${id}/installations?status=all&pageSize=50`,
        )
    ).items;
    const old = installations.find(
        (r: InstallationListItem) => r.installation.position === 'rear-tyre',
    );
    await page
        .getByRole('row')
        .filter({ hasText: `${marker}-rear-tyre` })
        .getByRole('button', {
            name: `Synthetic ${marker}-rear-tyre`,
            exact: true,
        })
        .click();
    await page.getByRole('button', { name: 'Edit starting estimate' }).click();
    await page
        .getByLabel('Starting estimate (km)', { exact: true })
        .fill('120');
    await page.getByRole('button', { name: 'Save estimate' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(
        (await apiRead(request, `components/${old.component.id}/usage`))
            .combinedLifetimeMetres,
    ).toBe(185000);
    await page
        .getByRole('button', { name: 'Replace rear tyre', exact: true })
        .click();
    await page.getByLabel('Make', { exact: true }).fill('Synthetic');
    await page.getByLabel('Model', { exact: true }).fill(marker + '-new-rear');
    await page
        .getByLabel('Date and time', { exact: true })
        .fill('2026-09-03T10:00');
    await page.getByLabel('Cost (EUR)', { exact: true }).fill('0');
    await page.getByRole('button', { name: 'Replace part' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await logRide(page, marker + '-10', '10', '2026-09-04T10:00');
    const current = (
        await apiRead(
            request,
            `bikes/${id}/installations?status=current&pageSize=50`,
        )
    ).items;
    for (const row of current)
        expect(
            (await apiRead(request, `components/${row.component.id}/usage`))
                .lifetimeMetres,
        ).toBe(row.installation.position === 'rear-tyre' ? 10000 : 75000);
    expect(
        (await apiRead(request, `components/${old.component.id}/usage`))
            .lifetimeMetres,
    ).toBe(65000);
    await page
        .getByRole('button', { name: 'Log maintenance', exact: true })
        .click();
    await page.getByLabel('Task', { exact: true }).fill(marker + ' inspection');
    await page
        .getByLabel('Date and time', { exact: true })
        .fill('2026-09-05T10:00');
    await page
        .getByLabel('Notes', { exact: true })
        .fill('<script>window.task9Injected=true</script>');
    await page.getByRole('button', { name: 'Save maintenance' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const fresh = await browser.newContext({
        baseURL: 'http://127.0.0.1:3000',
        timezoneId: 'Europe/Helsinki',
    });
    const reload = await fresh.newPage();
    const found = await discoverBike(reload, marker + '-A');
    expect(found).toBe(id);
    await reload.getByRole('link', { name: 'Components', exact: true }).click();
    await reload
        .getByRole('combobox', { name: 'Filter components' })
        .selectOption('all');
    await reload
        .getByRole('row')
        .filter({ hasText: `${marker}-rear-tyre` })
        .getByRole('button', {
            name: `Synthetic ${marker}-rear-tyre`,
            exact: true,
        })
        .click();
    await expect(
        reload.getByText(`Component identity: ${old.component.id}`, {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        reload.getByText('Calculated lifetime: 65 km', { exact: true }),
    ).toBeVisible();
    await expect(reload.getByRole('dialog').getByText(/€0\.00/)).toBeVisible();
    await expect(
        reload.getByText(marker + ' retained service notes', { exact: true }),
    ).toBeVisible();
    await close(reload);
    await reload
        .getByRole('link', { name: 'Maintenance', exact: true })
        .click();
    await expect(
        reload.getByText('<script>window.task9Injected=true</script>', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        reload.getByText('Cost not recorded', { exact: true }),
    ).toBeVisible();
    expect(
        await reload.evaluate(() => Object.hasOwn(window, 'task9Injected')),
    ).toBe(false);
    const services = await apiRead(request, `bikes/${found}/maintenance`);
    expect(
        services.find(
            (m: MaintenanceResponse) => m.task === marker + ' inspection',
        ),
    ).toMatchObject({
        notes: '<script>window.task9Injected=true</script>',
        cost: null,
        currency: null,
    });
    expect(
        services.find(
            (m: MaintenanceResponse) => m.componentId === old.component.id,
        ),
    ).toMatchObject({ cost: 0, currency: 'EUR' });
    await reload.getByRole('link', { name: 'Rides', exact: true }).click();
    await expect(
        reload.getByRole('row').filter({ hasText: marker + '-65' }),
    ).toContainText('Not recorded');
    const rides = (await apiRead(request, `bikes/${found}/rides?pageSize=50`))
        .items;
    expect(
        rides.find((r: RideResponse) => r.name === marker + '-65')
            .durationSeconds,
    ).toBeNull();
    await reload
        .getByRole('button', { name: `Correct ${marker}-10`, exact: true })
        .click();
    await reload.getByLabel('Distance (km)', { exact: true }).fill('11');
    await reload.getByRole('button', { name: 'Save ride' }).click();
    await expect(reload.getByRole('dialog')).toHaveCount(0);
    await reload.reload();
    await expect(
        reload
            .getByRole('row')
            .filter({ hasText: marker + '-10' })
            .getByRole('cell')
            .nth(2),
    ).toHaveText('11 km');
    expect(
        (await apiRead(request, `bikes/${found}/overview`))
            .recordedDistanceMetres,
    ).toBe(76000);
    await reload
        .getByRole('button', { name: `Delete ${marker}-10`, exact: true })
        .click();
    await reload
        .getByRole('button', { name: 'Delete ride', exact: true })
        .click();
    await expect(reload.getByRole('dialog')).toHaveCount(0);
    await reload.reload();
    await expect(
        reload.getByRole('button', {
            name: `Delete ${marker}-10`,
            exact: true,
        }),
    ).toHaveCount(0);
    expect(
        (await apiRead(request, `bikes/${found}/overview`))
            .recordedDistanceMetres,
    ).toBe(65000);
    await fresh.close();
});
test('separate 160km reminder fixture: methods preserve baseline and lifetime, actual lubrication persists', async ({
    page,
    request,
}, info) => {
    const marker = `${process.env.BIKELOG_E2E_RUN ?? 'task9'}-${info.project.name}-${Date.now()}-reminder`;
    await page.goto('/');
    const id = await create(page, marker);
    await page.getByRole('link', { name: 'Components', exact: true }).click();
    await fitNew(page, 'chain', marker + '-chain', '2026-09-01T10:00');
    await logRide(page, marker + '-160', '160', '2026-09-02T10:00');
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    await configure(page, 'oil', '300');
    await expect(
        page.getByText('Lubrication due', { exact: true }),
    ).toBeVisible();
    const initial = await apiRead(request, `bikes/${id}/reminder`);
    expect(initial.distanceSinceBaselineMetres).toBe(160000);
    expect(initial.due).toBe(true);
    for (const [method, wax, remaining, due] of [
        ['wax', '300', 140000, false],
        ['wax', '200', 40000, false],
        ['oil', '200', 0, true],
    ] as const) {
        await configure(page, method, wax);
        await page.reload();
        const actual = await apiRead(request, `bikes/${id}/reminder`);
        expect(actual).toMatchObject({
            baselineUtc: initial.baselineUtc,
            componentId: initial.componentId,
            distanceSinceBaselineMetres: 160000,
            remainingMetres: remaining,
            due,
        });
        expect(
            (await apiRead(request, `components/${initial.componentId}/usage`))
                .lifetimeMetres,
        ).toBe(160000);
    }
    await page
        .getByRole('button', { name: 'Log lubrication', exact: true })
        .click();
    await page
        .getByLabel('Date and time', { exact: true })
        .fill('2026-09-03T10:00');
    await page
        .getByLabel('Notes', { exact: true })
        .fill(marker + ' actual lubrication');
    await page.getByLabel('Cost (EUR)', { exact: true }).fill('0');
    await page.getByRole('button', { name: 'Save maintenance' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(
        page.getByText('Ready · 150 km remaining', { exact: true }),
    ).toBeVisible();
    const final = await apiRead(request, `bikes/${id}/reminder`);
    expect(final).toMatchObject({
        distanceSinceBaselineMetres: 0,
        remainingMetres: 150000,
        due: false,
        baselineUtc: '2026-09-03T07:00:00+00:00',
    });
    expect(
        (await apiRead(request, `components/${initial.componentId}/usage`))
            .lifetimeMetres,
    ).toBe(160000);
    expect(
        (await apiRead(request, `bikes/${id}/maintenance`)).find(
            (m: MaintenanceResponse) =>
                m.notes === marker + ' actual lubrication',
        ),
    ).toMatchObject({
        taskKey: 'chain-lubrication',
        componentId: initial.componentId,
        cost: 0,
        currency: 'EUR',
    });
});

test('full positions: weighed saddle, none-fitted front derailleur, brake pair and tubeless rear wheel', async ({
    page,
    request,
}, info) => {
    const marker = `${process.env.BIKELOG_E2E_RUN ?? 'task002'}-${info.project.name}-${Date.now()}-groups`;
    await page.goto('/');
    const id = await create(page, marker);
    await page.getByRole('link', { name: 'Components', exact: true }).click();
    await fitNew(page, 'saddle', `${marker}-saddle`, '2026-09-01T10:00', '215');
    await revealPositions(page);
    await page.getByLabel('More actions for front derailleur').click();
    await page.getByRole('button', { name: 'Mark none fitted…' }).click();
    await page.getByLabel('From', { exact: true }).fill('2026-09-01T10:00');
    await page.getByRole('button', { name: 'Mark none fitted' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await revealPositions(page);
    await page
        .getByRole('button', { name: 'Fit front brake', exact: true })
        .click();
    await expect(
        page.getByRole('checkbox', { name: /Also fit to the rear brake/ }),
    ).toBeChecked();
    await page.getByLabel('Make', { exact: true }).fill('Synthetic');
    await page.getByLabel('Model', { exact: true }).fill(`${marker}-brake`);
    await page
        .getByLabel('Date and time', { exact: true })
        .fill('2026-09-01T10:00');
    await page.getByRole('button', { name: 'Fit part', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page
        .getByRole('button', { name: 'Switch rear wheel to tubeless' })
        .click();
    await page.getByLabel('From', { exact: true }).fill('2026-09-01T10:00');
    await page.getByRole('button', { name: 'Switch to tubeless' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Rear wheel: tubeless')).toBeVisible();
    await logRide(page, marker + '-40', '40', '2026-09-02T10:00');

    const usage = await apiRead(request, `bikes/${id}/usage`);
    const state = (position: string) =>
        usage.positionStatuses.find(
            (s: { position: string }) => s.position === position,
        );
    for (const position of ['saddle', 'front-brake', 'rear-brake']) {
        expect(state(position).state).toBe('fitted');
        expect(
            (
                await apiRead(
                    request,
                    `components/${state(position).componentId}/usage`,
                )
            ).lifetimeMetres,
        ).toBe(40000);
    }
    expect(state('front-derailleur').state).toBe('exempt');
    expect(state('rear-inner-tube').reason).toBe('tubeless');
    const gapped = usage.positionGaps.map(
        (g: { position: string }) => g.position,
    );
    expect(gapped).not.toContain('front-derailleur');
    expect(gapped).not.toContain('rear-inner-tube');
    expect(gapped).toContain('front-inner-tube');
    expect(
        (await apiRead(request, `components/${state('saddle').componentId}`))
            .weightGrams,
    ).toBe(215);
});
