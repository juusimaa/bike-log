import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { catalog, overviewExtras, status } from '../tests/catalog-fixture';
export { catalog };
export const bikeId = '11111111-1111-1111-1111-111111111111';
export const secondId = '22222222-2222-2222-2222-222222222222';
export const bike = {
    id: bikeId,
    name: 'The everyday escape',
    displayName: 'The everyday escape',
    make: 'Canyon',
    model: 'Grizl 7',
    kind: 'gravel',
    year: 2025,
    color: '#829c83',
    version: 1,
    frameWeightGrams: 1180 as number | null,
    missingPositions: [] as string[],
    status: 'active' as const,
};
export const second = {
    ...bike,
    id: secondId,
    name: null,
    displayName: 'Specialized Allez',
    make: 'Specialized',
    model: 'Allez',
    kind: 'road',
    year: 2023,
    frameWeightGrams: null,
    missingPositions: ['saddle'],
};
export const positions = [
    'chain',
    'cassette',
    'front-tyre',
    'rear-tyre',
] as const;
const utc = '2026-06-01T07:00:00Z';
export const rows = positions.map((position, i) => {
    const componentId = `33333333-3333-3333-3333-${String(i + 1).padStart(12, '0')}`;
    const installation = {
        id: `44444444-4444-4444-4444-${String(i + 1).padStart(12, '0')}`,
        componentId,
        bikeId,
        position,
        startUtc: utc,
        endUtc: null,
        version: 1,
    };
    return {
        installation,
        component: {
            id: componentId,
            type: position.includes('tyre') ? 'tyre' : position,
            make: ['Shimano', 'Shimano', 'Schwalbe', 'Schwalbe'][i],
            model: [
                'CN-HG601',
                '105 · 11–34T',
                'G-One · 45 mm',
                'G-One · 45 mm',
            ][i],
            version: 1,
            initialUsageEstimateMetres: i > 1 ? 120000 : 0,
            installations: [installation],
            group: i > 1 ? 'wheels' : 'groupset',
            weightGrams: [252, 345, 475, null][i] as number | null,
            bikes: [
                {
                    id: bikeId,
                    displayName: bike.displayName,
                    state: 'active' as 'active' | 'retired' | 'deleted',
                },
            ],
        },
    };
});
export const reminder = {
    ruleVersion: 1,
    state: 'ready',
    enabled: true,
    method: 'oil',
    oilThresholdMetres: 150000,
    waxThresholdMetres: 300000,
    activeThresholdMetres: 150000,
    evaluatedAtUtc: '2026-10-01T16:00:00Z',
    componentId: rows[0].component.id,
    installationId: rows[0].installation.id,
    baselineKind: 'installation',
    baselineUtc: utc,
    distanceSinceBaselineMetres: 184000,
    remainingMetres: 0,
    due: true,
};
/** Board state: the four fitted parts, plus a none-fitted front derailleur and a tubeless
 * rear wheel on the first bike, and a missing saddle on the second. */
function positionsFor(id: string) {
    const fitted = Object.fromEntries(
        rows.map(({ installation: i, component: c }) => [
            i.position,
            status(i.position, 'fitted', {
                componentId: c.id,
                installationId: i.id,
                sinceUtc: i.startUtc,
            }),
        ]),
    );
    const extras = overviewExtras(
        id === bikeId
            ? {
                  ...fitted,
                  'front-derailleur': status('front-derailleur', 'exempt', {
                      reason: 'none-fitted',
                      exemptionId: '88888888-8888-8888-8888-000000000001',
                      sinceUtc: '2026-06-01T07:00:00Z',
                  }),
                  'rear-inner-tube': status('rear-inner-tube', 'exempt', {
                      reason: 'tubeless',
                      exemptionId: '88888888-8888-8888-8888-000000000002',
                      sinceUtc: '2026-08-01T07:00:00Z',
                  }),
              }
            : {
                  ...fitted,
                  saddle: status('saddle', 'missing', {
                      sinceUtc: '2026-10-12T07:00:00Z',
                  }),
              },
    );
    extras.positionGaps = [
        {
            position: 'saddle',
            rideCount: 12,
            firstRideStartUtc: '2026-06-08T08:00:00Z',
            lastRideStartUtc: '2026-10-01T08:00:00Z',
        },
    ];
    extras.weights = {
        groups: [
            { group: 'build', grams: 0, missingCount: 0 },
            { group: 'groupset', grams: 597, missingCount: 0 },
            { group: 'wheels', grams: 475, missingCount: 1 },
        ],
        frameGrams: id === bikeId ? 1180 : null,
        totalGrams: 1072 + (id === bikeId ? 1180 : 0),
        missingCount: id === bikeId ? 1 : 2,
    };
    return extras;
}
export const exemptions = [
    {
        id: '88888888-8888-8888-8888-000000000001',
        bikeId,
        position: 'front-derailleur',
        reason: 'none-fitted',
        startUtc: '2026-06-01T07:00:00Z',
        endUtc: null,
        version: 1,
    },
    {
        id: '88888888-8888-8888-8888-000000000002',
        bikeId,
        position: 'rear-inner-tube',
        reason: 'tubeless',
        startUtc: '2026-08-01T07:00:00Z',
        endUtc: null,
        version: 1,
    },
];
export const overview = (id = bikeId) => ({
    bike: id === bikeId ? bike : second,
    evaluatedAtUtc: '2026-10-01T16:00:00Z',
    rideCount: 13,
    recordedDistanceMetres: id === bikeId ? 787000 : 384000,
    currentComponents: rows.map(({ installation: i, component: c }) => ({
        componentId: c.id,
        installationId: i.id,
        position: i.position,
        currentInstallationMetres:
            id === bikeId ? (i.position === 'chain' ? 350000 : 787000) : 384000,
        currentInstallationSeconds: 120000,
        currentInstallationHasUnknownDuration: false,
        lifetimeMetres:
            id === bikeId ? (i.position === 'chain' ? 350000 : 787000) : 384000,
        lifetimeSeconds: 120000,
        lifetimeHasUnknownDuration: false,
        initialUsageEstimateMetres: c.initialUsageEstimateMetres,
        combinedLifetimeMetres:
            (id === bikeId
                ? i.position === 'chain'
                    ? 350000
                    : 787000
                : 384000) + c.initialUsageEstimateMetres,
    })),
    allocationGaps: [],
    ...positionsFor(id),
    spendingByCurrency: [{ currency: 'EUR', amount: 24.9 }],
    unknownCostRecordCount: 0,
    maintenanceRecordCount: 3,
    recentActivity: [
        {
            kind: 'ride',
            id: '77777777-7777-7777-7777-000000000001',
            title: 'Autumn gravel loop',
            instant: '2026-10-01T08:00:00Z',
            componentId: null,
            rideDistanceMetres: 65000,
        },
        {
            kind: 'ride',
            id: '77777777-7777-7777-7777-000000000002',
            title: 'Sunday coffee loop',
            instant: '2026-09-27T08:00:00Z',
            componentId: null,
            rideDistanceMetres: 72000,
        },
        {
            kind: 'ride',
            id: '77777777-7777-7777-7777-000000000003',
            title: 'Evening gravel',
            instant: '2026-09-23T08:00:00Z',
            componentId: null,
            rideDistanceMetres: 47000,
        },
    ],
    reminder,
});
export const ride = {
    id: '55555555-5555-5555-5555-555555555555',
    bikeId,
    startUtc: '2026-10-01T08:00:00Z',
    distanceMetres: 65000,
    durationSeconds: null,
    name: 'Autumn gravel loop',
    version: 1,
};
// Static baseline rows mirror the approved demo's visible records; no domain allocator is copied.
const baselineRides = [
    ['2026-10-01', 'Autumn gravel loop', 65000, 10636],
    ['2026-09-27', 'Sunday coffee loop', 72000, 11782],
    ['2026-09-23', 'Evening gravel', 47000, 7691],
    ['2026-09-19', 'Weekend wander', 68000, 11127],
    ['2026-09-12', 'Through the woods', 42000, 6873],
    ['2026-09-05', 'First autumn miles', 56000, 9164],
    ['2026-08-26', 'Coast and countryside', 91000, 14891],
    ['2026-08-14', 'Evening spin', 38000, 6218],
    ['2026-08-02', 'Forest roads', 74000, 12109],
    ['2026-07-18', 'Coffee and gravel', 43000, 7036],
    ['2026-07-05', 'Long way home', 81000, 13255],
    ['2026-06-20', 'After-work escape', 48000, 7855],
    ['2026-06-08', 'Lakeside loop', 62000, 10145],
].map(([date, name, distanceMetres, durationSeconds], index) => ({
    ...ride,
    id: `55555555-5555-5555-5555-${String(index + 1).padStart(12, '0')}`,
    name,
    startUtc: `${date}T08:00:00Z`,
    distanceMetres,
    durationSeconds,
}));
export const deletedId = '77777777-7777-7777-7777-777777777777';
/** All rides across bikes: the second bike's rides and a deleted bike's ride, by name. */
export const allRides = (retiredSecond = false) =>
    baselineRides.map((r, index) => ({
        ...r,
        ...(index % 4 === 1
            ? {
                  bikeId: secondId,
                  bike: {
                      id: secondId,
                      displayName: 'Specialized Allez',
                      state: retiredSecond ? 'retired' : 'active',
                  },
              }
            : index % 4 === 3
              ? {
                    bikeId: deletedId,
                    bike: {
                        id: deletedId,
                        displayName: 'Old commuter',
                        state: 'deleted',
                    },
                }
              : {
                    bike: {
                        id: bikeId,
                        displayName: bike.displayName,
                        state: 'active',
                    },
                }),
    }));
export const maintenance = {
    id: '66666666-6666-6666-6666-666666666666',
    bikeId,
    componentId: null,
    task: 'General inspection',
    performedUtc: '2026-09-20T10:00:00Z',
    notes: '<script>window.task9Injected=true</script>',
    cost: 0,
    currency: 'EUR',
    taskKey: null,
    version: 1,
};
export async function mockVisual(
    page: Page,
    { retiredSecond = false }: { retiredSecond?: boolean } = {},
) {
    const secondBike = {
        ...second,
        status: retiredSecond ? ('retired' as const) : ('active' as const),
    };
    await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        let body: unknown;
        if (path === '/api/bikes')
            body = { items: [bike, secondBike], nextCursor: null };
        else if (path === '/api/rides')
            body = { items: allRides(retiredSecond), nextCursor: null };
        else if (path.endsWith('/deletion-preview'))
            body = {
                bikeVersion: 1,
                fittedParts: rows.map((r) => ({
                    installationId: r.installation.id,
                    componentId: r.component.id,
                    type: r.component.type,
                    make: r.component.make,
                    model: r.component.model,
                    position: r.installation.position,
                })),
                rideCount: 13,
                maintenanceCount: 3,
            };
        else if (path === '/api/component-catalog') body = catalog;
        else if (path.endsWith('/position-exemptions'))
            body = path.includes(secondId) ? [] : exemptions;
        else if (path.endsWith('/overview'))
            body = path.includes(secondId)
                ? { ...overview(secondId), bike: secondBike }
                : overview(bikeId);
        else if (path.endsWith('/installations'))
            body = { items: rows, nextCursor: null };
        else if (path.endsWith('/usage')) {
            const row = rows.find((r) => path.includes(r.component.id))!;
            const current = overview().currentComponents.find(
                (c) => c.componentId === row.component.id,
            )!;
            body = {
                componentId: row.component.id,
                lifetimeMetres: current.lifetimeMetres,
                lifetimeSeconds: 120000,
                hasUnknownDuration: false,
                initialUsageEstimateMetres:
                    row.component.initialUsageEstimateMetres,
                combinedLifetimeMetres: current.combinedLifetimeMetres,
                installations: [
                    {
                        installation: row.installation,
                        metres: current.currentInstallationMetres,
                        seconds: 120000,
                        hasUnknownDuration: false,
                    },
                ],
                calculatedAtUtc: null,
            };
        } else if (path.endsWith('/rides'))
            body = { items: baselineRides, nextCursor: null };
        else if (path.endsWith('/reminder')) body = reminder;
        else if (path.endsWith('/maintenance'))
            body = [
                { ...maintenance, task: 'Lubricate chain' },
                {
                    ...maintenance,
                    id: '66666666-6666-6666-6666-000000000002',
                    task: 'Replace chain',
                    performedUtc: '2026-09-01T08:00:00Z',
                    notes: 'New chain fitted. Previous chain retained in history.',
                    cost: 24.9,
                },
                {
                    ...maintenance,
                    id: '66666666-6666-6666-6666-000000000003',
                    task: 'Lubricate chain',
                    performedUtc: '2026-08-15T10:00:00Z',
                    notes: 'Cleaned and applied wet-weather lubricant.',
                },
            ];
        else if (path === '/api/components')
            body = { items: rows.map((r) => r.component), nextCursor: null };
        else if (path.startsWith('/api/bikes/'))
            body = path.endsWith(secondId) ? secondBike : bike;
        else body = rows.find((r) => path.endsWith(r.component.id))?.component;
        await route.fulfill({
            status: body ? 200 : 404,
            contentType: 'application/json',
            body: JSON.stringify(
                body ?? { code: 'not_found', title: 'Missing' },
            ),
        });
    });
}
export async function apiRead(request: APIRequestContext, path: string) {
    const response = await request.get(`/api/${path}`);
    expect(response.ok(), `${path}: ${response.status()}`).toBeTruthy();
    return response.json();
}
/** Seeds synthetic records through the web relay, which requires the local origin for writes. */
export async function apiWrite(
    request: APIRequestContext,
    method: 'post' | 'put',
    path: string,
    data: unknown,
) {
    const response = await request[method](`/api/${path}`, {
        data,
        headers: { origin: 'http://127.0.0.1:3000' },
    });
    expect(response.ok(), `${path}: ${response.status()}`).toBeTruthy();
    return response.json();
}
/** A position's Fit button, opening its "not recorded" panel first if it is folded (V4). */
export async function fitButton(page: Page, position: string) {
    const button = page.getByRole('button', {
        name: `Fit ${position}`,
        exact: true,
    });
    const panel = page.locator('details.unrecorded', { has: button });
    await expect(page.locator('details.unrecorded').first()).toBeAttached();
    if ((await panel.count()) && (await panel.getAttribute('open')) === null)
        await panel.locator('summary').click();
    return button;
}
/** Opens the V4 bike switcher; resolves once its panel is showing. */
export async function openSwitcher(page: Page) {
    await page.getByRole('button', { name: /Change bike/ }).click();
    const panel = page.getByRole('dialog', { name: 'Choose a bike' });
    await expect(panel).toBeVisible();
    return panel;
}
/** Picks a bike through the switcher panel. */
export async function chooseBike(page: Page, name: RegExp) {
    const panel = await openSwitcher(page);
    await panel.getByRole('button', { name }).first().click();
}
/** Create bike sits at the foot of the switcher, or alone in an empty garage. */
export async function startCreateBike(page: Page) {
    const entry = page
        .getByRole('button', { name: /Change bike|^Create bike$/ })
        .first();
    await expect(entry).toBeVisible();
    if ((await entry.textContent())?.includes('Change bike'))
        await openSwitcher(page);
    await page.getByRole('button', { name: 'Create bike' }).click();
}
export async function discoverBike(page: Page, marker: string) {
    await page.goto('/');
    const panel = await openSwitcher(page);
    await panel.getByRole('searchbox', { name: 'Search bikes' }).fill(marker);
    for (let i = 0; i < 100; i++) {
        const choice = panel.getByRole('button', { name: new RegExp(marker) });
        if (await choice.count()) {
            await choice.first().click();
            await expect(page).toHaveURL(/bike=/);
            return new URL(page.url()).searchParams.get('bike')!;
        }
        const more = panel.getByRole('button', { name: 'Load more bikes' });
        if (!(await more.count())) break;
        const read = page.waitForResponse(
            (response) =>
                new URL(response.url()).pathname === '/api/bikes' &&
                response.request().method() === 'GET',
        );
        await more.click();
        const result = await (await read).json();
        if (result.items.length)
            await expect(more.or(panel.getByRole('status'))).toBeVisible();
    }
    throw new Error(
        `Synthetic bike ${marker} not discovered through garage pages`,
    );
}
