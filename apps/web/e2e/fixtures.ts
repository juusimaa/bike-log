import { expect, type Page, type APIRequestContext } from '@playwright/test';
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
export async function mockVisual(page: Page) {
    await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        let body: unknown;
        if (path === '/api/bikes')
            body = { items: [bike, second], nextCursor: null };
        else if (path.endsWith('/overview'))
            body = overview(path.includes(secondId) ? secondId : bikeId);
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
            body = path.endsWith(secondId) ? second : bike;
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
export async function discoverBike(page: Page, marker: string) {
    await page.goto('/');
    await page.locator('.bike-choice').first().waitFor();
    for (let i = 0; i < 100; i++) {
        const choice = page.getByRole('button', { name: new RegExp(marker) });
        if (await choice.count()) {
            await choice.click();
            await expect(page).toHaveURL(/bike=/);
            return new URL(page.url()).searchParams.get('bike')!;
        }
        const more = page.getByRole('button', { name: 'Load more bikes' });
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
                    .getByRole('button', {
                        name: new RegExp(result.items.at(-1).displayName),
                    })
                    .last(),
            ).toBeVisible();
    }
    throw new Error(
        `Synthetic bike ${marker} not discovered through garage pages`,
    );
}
