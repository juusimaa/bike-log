import { it, expect } from 'vitest';
import { createApiClient, ApiError } from '../src/client';
import type { BikeResponse, ReminderEvaluation } from '../src/dto';
const id = '11111111-1111-4111-8111-111111111111';
const bike = {
    id,
    name: null,
    version: 1,
    make: null,
    model: null,
    kind: null,
    year: null,
    color: null,
    displayName: 'Unnamed bike',
} satisfies BikeResponse;
const reminder = {
    ruleVersion: 1,
    state: 'disabled',
    enabled: false,
    method: null,
    oilThresholdMetres: null,
    waxThresholdMetres: null,
    activeThresholdMetres: null,
    evaluatedAtUtc: '2026-10-02T12:00:00Z',
    componentId: null,
    installationId: null,
    baselineKind: null,
    baselineUtc: null,
    distanceSinceBaselineMetres: null,
    remainingMetres: null,
    due: null,
} satisfies ReminderEvaluation;
function json(value: unknown, status = 200) {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}
it('clientUsesGeneratedPathsAndNullableEnums', async () => {
    const seen: string[] = [];
    const api = createApiClient('http://native.example', async (request) => {
        const r = new Request(request);
        seen.push(r.url);
        return json(
            r.url.includes('/reminder')
                ? reminder
                : { items: [bike], nextCursor: null },
        );
    });
    expect(
        (await api.listBikes({ pageSize: 50, cursor: 'opaque+/=' })).items[0]
            .kind,
    ).toBeNull();
    expect((await api.getReminder(id)).method).toBeNull();
    expect(seen).toEqual([
        'http://native.example/api/bikes?pageSize=50&cursor=opaque%2B%2F%3D',
        `http://native.example/api/bikes/${id}/reminder`,
    ]);
});
it('delete204HasNoJsonBody', async () => {
    let request: Request | undefined;
    const api = createApiClient('http://native.example', async (r) => {
        request = new Request(r);
        return new Response(null, { status: 204 });
    });
    expect(await api.deleteRide(id, 4)).toBeUndefined();
    expect(request?.method).toBe('DELETE');
    expect(request?.url).toBe(
        `http://native.example/api/rides/${id}?expectedVersion=4`,
    );
});
it('preservesProblemDetails', async () => {
    const api = createApiClient('http://native.example', async () =>
        json(
            {
                type: 'about:blank',
                title: 'Stale version',
                status: 409,
                code: 'stale_version',
                currentVersion: 7,
            },
            409,
        ),
    );
    await expect(api.deleteRide(id, 4)).rejects.toMatchObject({
        status: 409,
        code: 'stale_version',
        currentVersion: 7,
        uncertain: false,
    });
});
it('marks lost mutation response uncertain without retrying', async () => {
    let calls = 0;
    const api = createApiClient('http://native.example', async () => {
        calls++;
        throw new TypeError('offline');
    });
    await expect(api.deleteRide(id, 4)).rejects.toMatchObject({
        uncertain: true,
    });
    expect(calls).toBe(1);
});
it('rejects malformed successful DTOs and missing replacement fields', async () => {
    const api = createApiClient('http://native.example', async () =>
        json({ component: {} }),
    );
    await expect(
        api.replaceWithService(id, {
            newModel: 'Chain',
            replacedAtUtc: '2026-10-02T12:00:00Z',
            expectedInstallationVersion: 1,
        }),
    ).rejects.toBeInstanceOf(ApiError);
});
it('rejects unsafe input before sending', async () => {
    let calls = 0;
    const api = createApiClient('http://native.example', async () => {
        calls++;
        return json(bike);
    });
    await expect(api.deleteRide(id, 9007199254740992)).rejects.toMatchObject({
        code: 'client_range',
        uncertain: false,
    });
    expect(calls).toBe(0);
});
it('rejects unsafe response and numeric strings before use', async () => {
    const api = createApiClient(
        'http://native.example',
        async () =>
            new Response(
                JSON.stringify({ ...bike, version: '9223372036854775807' }),
                { headers: { 'content-type': 'application/json' } },
            ),
    );
    await expect(api.getBike(id)).rejects.toMatchObject({
        code: 'client_range',
    });
});
it('accepts safe monetary input and keeps EUR', async () => {
    let sent: unknown;
    const response = {
        id,
        bikeId: id,
        componentId: null,
        task: 'Wash',
        performedUtc: '2026-10-02T12:00:00Z',
        notes: null,
        version: 1,
        cost: 24.9,
        currency: 'EUR',
        taskKey: null,
    };
    const api = createApiClient('http://native.example', async (r) => {
        sent = await new Request(r).json();
        return json(response, 201);
    });
    expect(
        (
            await api.createMaintenance({
                bikeId: id,
                task: 'Wash',
                performedUtc: '2026-10-02T12:00:00Z',
                cost: 24.9,
                currency: 'EUR',
            })
        ).cost,
    ).toBe(24.9);
    expect(sent).toMatchObject({ cost: 24.9, currency: 'EUR' });
});
it('treats adapter transport 502 as an uncertain mutation outcome', async () => {
    const api = createApiClient('http://native.example', async () =>
        json(
            {
                status: 502,
                code: 'backend_unavailable',
                title: 'The backend is unavailable.',
            },
            502,
        ),
    );
    await expect(api.deleteRide(id, 4)).rejects.toMatchObject({
        status: 502,
        code: 'backend_unavailable',
        uncertain: true,
    });
});
it('rejects bodyless GET responses', async () => {
    const noBody = createApiClient(
        'http://native.example',
        async () => new Response(null, { status: 204 }),
    );
    await expect(noBody.getBike(id)).rejects.toMatchObject({
        code: 'invalid_response',
    });
});
it('rejects malformed UUID responses', async () => {
    const malformed = createApiClient('http://native.example', async () =>
        json({ ...bike, id: 'not-a-uuid' }),
    );
    await expect(malformed.getBike(id)).rejects.toMatchObject({
        code: 'invalid_response',
    });
});
it('canonicalizes safe numeric strings in DTOs and ProblemDetails without rounding', async () => {
    const api = createApiClient('http://native.example', async () =>
        json({ ...bike, version: '12' }),
    );
    expect((await api.getBike(id)).version).toBe(12);
    const conflict = createApiClient(
        'http://native.example',
        async () =>
            new Response(
                '{"status":409,"code":"stale_version","currentVersion":9223372036854775807}',
                {
                    status: 409,
                    headers: { 'content-type': 'application/problem+json' },
                },
            ),
    );
    await expect(conflict.deleteRide(id, 1)).rejects.toMatchObject({
        code: 'client_range',
    });
});
it('preserves all four replacement result members and rejects each absent member', async () => {
    const component = {
        id,
        type: 'chain',
        model: 'Chain',
        version: 1,
        installations: [],
        initialUsageEstimateMetres: 0,
    };
    const installation = {
        id,
        bikeId: id,
        componentId: id,
        position: 'chain',
        startUtc: '2026-10-02T12:00:00Z',
        endUtc: null,
        version: 1,
    };
    const maintenance = {
        id,
        bikeId: id,
        componentId: id,
        task: 'Replace chain',
        performedUtc: '2026-10-02T12:00:00Z',
        notes: null,
        cost: 24.9,
        currency: 'EUR',
        version: 1,
        taskKey: 'replace-chain',
    };
    const result = {
        component,
        oldInstallation: { ...installation, endUtc: '2026-10-02T12:00:00Z' },
        newInstallation: installation,
        maintenance,
    };
    const input = {
        newModel: 'Chain',
        replacedAtUtc: '2026-10-02T12:00:00Z',
        expectedInstallationVersion: 1,
        cost: 24.9,
        currency: 'EUR',
    };
    const api = createApiClient('http://native.example', async () =>
        json(result),
    );
    expect(await api.replaceWithService(id, input)).toEqual(result);
    for (const key of [
        'component',
        'oldInstallation',
        'newInstallation',
        'maintenance',
    ]) {
        const missing = { ...result } as Record<string, unknown>;
        delete missing[key];
        const bad = createApiClient('http://native.example', async () =>
            json(missing),
        );
        await expect(bad.replaceWithService(id, input)).rejects.toMatchObject({
            code: 'invalid_response',
        });
    }
});
it('rejects fractional distances and unsafe cents before posting', async () => {
    let calls = 0;
    const api = createApiClient('http://native.example', async () => {
        calls++;
        return json(bike);
    });
    await expect(
        api.createRide({
            bikeId: id,
            startUtc: '2026-10-02T12:00:00Z',
            distanceMetres: 1.5,
        }),
    ).rejects.toMatchObject({ code: 'client_range', uncertain: false });
    await expect(
        api.createMaintenance({
            bikeId: id,
            task: 'Wash',
            performedUtc: '2026-10-02T12:00:00Z',
            cost: 0.001,
        }),
    ).rejects.toMatchObject({ code: 'client_range', uncertain: false });
    await expect(
        api.createMaintenance({
            bikeId: id,
            task: 'Wash',
            performedUtc: '2026-10-02T12:00:00Z',
            cost: '90071992547409.91',
        }),
    ).rejects.toMatchObject({ code: 'client_range', uncertain: false });
    expect(calls).toBe(0);
});
it('reports malformed input separately from unsupported responses', async () => {
    const api = createApiClient('http://native.example', async () =>
        json(bike),
    );
    await expect(
        api.createRide({
            bikeId: 'bad',
            startUtc: '2026-10-02T12:00:00Z',
            distanceMetres: 1,
        }),
    ).rejects.toMatchObject({ code: 'invalid_input', uncertain: false });
});
it('uses documented methods, resource paths and pagination for every remaining wrapper', async () => {
    const seen: { method: string; path: string; body: unknown }[] = [];
    const api = createApiClient('http://native.example', async (r) => {
        const request = new Request(r);
        seen.push({
            method: request.method,
            path: new URL(request.url).pathname + new URL(request.url).search,
            body: request.body ? await request.json() : undefined,
        });
        return json({ status: 502, code: 'backend_unavailable' }, 502);
    });
    const instant = '2026-10-02T12:00:00Z';
    const bikeInput = {
        make: null,
        model: null,
        kind: 'gravel' as const,
        year: 2026,
    };
    const rideInput = {
        bikeId: id,
        startUtc: instant,
        distanceMetres: 12000,
        durationSeconds: null,
    };
    const fitInput = {
        bikeId: id,
        componentId: id,
        position: 'chain' as const,
        startUtc: instant,
        endUtc: null,
    };
    const replacement = {
        newModel: 'New chain',
        replacedAtUtc: instant,
        expectedInstallationVersion: 1,
    };
    const cases: [() => Promise<unknown>, string, string, unknown?][] = [
        [() => api.createBike(bikeInput), 'POST', '/api/bikes', bikeInput],
        [
            () => api.editBike(id, { ...bikeInput, expectedVersion: 2 }),
            'PUT',
            `/api/bikes/${id}`,
            { ...bikeInput, expectedVersion: 2 },
        ],
        [() => api.getOverview(id), 'GET', `/api/bikes/${id}/overview`],
        [
            () => api.listRides(id, { pageSize: 50, cursor: 'next' }),
            'GET',
            `/api/bikes/${id}/rides?pageSize=50&cursor=next`,
        ],
        [() => api.getRide(id), 'GET', `/api/rides/${id}`],
        [() => api.createRide(rideInput), 'POST', '/api/rides', rideInput],
        [
            () => api.correctRide(id, { ...rideInput, expectedVersion: 2 }),
            'PUT',
            `/api/rides/${id}`,
            { ...rideInput, expectedVersion: 2 },
        ],
        [
            () => api.listInstallations(id, 'current', { pageSize: 50 }),
            'GET',
            `/api/bikes/${id}/installations?status=current&pageSize=50`,
        ],
        [
            () => api.listComponents({ pageSize: 50 }),
            'GET',
            '/api/components?pageSize=50',
        ],
        [() => api.getComponent(id), 'GET', `/api/components/${id}`],
        [() => api.getComponentUsage(id), 'GET', `/api/components/${id}/usage`],
        [
            () => api.listComponentMaintenance(id, { pageSize: 50 }),
            'GET',
            `/api/components/${id}/maintenance?pageSize=50`,
        ],
        [
            () => api.createComponent({ type: 'chain', model: 'Chain' }),
            'POST',
            '/api/components',
            { type: 'chain', model: 'Chain' },
        ],
        [
            () => api.createInstallation(fitInput),
            'POST',
            '/api/installations',
            fitInput,
        ],
        [
            () => api.replaceWithService(id, replacement),
            'POST',
            `/api/installations/${id}/replacement-with-service`,
            replacement,
        ],
        [
            () =>
                api.editEstimate(id, {
                    initialUsageEstimateMetres: 1000,
                    expectedVersion: 2,
                }),
            'PUT',
            `/api/components/${id}/estimate`,
            { initialUsageEstimateMetres: 1000, expectedVersion: 2 },
        ],
        [
            () => api.getBikeMaintenance(id),
            'GET',
            `/api/bikes/${id}/maintenance`,
        ],
        [
            () =>
                api.editReminder(id, {
                    enabled: false,
                    method: null,
                    oilThresholdMetres: null,
                    waxThresholdMetres: null,
                    expectedVersion: 2,
                }),
            'PUT',
            `/api/bikes/${id}/reminder`,
            {
                enabled: false,
                method: null,
                oilThresholdMetres: null,
                waxThresholdMetres: null,
                expectedVersion: 2,
            },
        ],
    ];
    for (const [call, method, path, body] of cases) {
        await expect(call()).rejects.toMatchObject({ status: 502 });
        expect(seen.at(-1)).toEqual({ method, path, body });
    }
});
it('canonicalizes generated int32 strings in bike input and nullable response fields', async () => {
    let posted: unknown;
    const api = createApiClient('http://native.example', async (request) => {
        const incoming = new Request(request);
        if (incoming.body) posted = await incoming.json();
        return json(
            { ...bike, year: '2026' },
            incoming.method === 'POST' ? 201 : 200,
        );
    });
    expect(
        (
            await api.createBike({
                make: null,
                model: null,
                kind: 'gravel',
                year: '2026',
            })
        ).year,
    ).toBe(2026);
    expect(posted).toMatchObject({ year: 2026 });
    expect((await api.getBike(id)).year).toBe(2026);
    const legacy = createApiClient('http://native.example', async () =>
        json(bike),
    );
    expect((await legacy.getBike(id)).year).toBeNull();
});
it('enforces int32 bounds for numeric and string inputs and responses', async () => {
    let calls = 0;
    const api = createApiClient('http://native.example', async () => {
        calls++;
        return json(bike);
    });
    for (const year of [2147483648, '2147483648', -2147483649, '-2147483649']) {
        await expect(
            api.createBike({ make: null, model: null, kind: 'gravel', year }),
        ).rejects.toMatchObject({ code: 'client_range', uncertain: false });
    }
    expect(calls).toBe(0);
    for (const year of [2147483648, '2147483648', -2147483649, '-2147483649']) {
        const response = createApiClient('http://native.example', async () =>
            json({ ...bike, year }),
        );
        await expect(response.getBike(id)).rejects.toMatchObject({
            code: 'client_range',
        });
    }
    for (const year of ['2147483647', '-2147483648']) {
        const response = createApiClient('http://native.example', async () =>
            json({ ...bike, year }),
        );
        expect((await response.getBike(id)).year).toBe(Number(year));
    }
});
it('canonicalizes generated int32 string counters throughout overview responses', async () => {
    const api = createApiClient('http://native.example', async () =>
        json({
            bike,
            evaluatedAtUtc: '2026-10-02T12:00:00Z',
            rideCount: '1',
            recordedDistanceMetres: 12000,
            currentComponents: [],
            allocationGaps: [],
            spendingByCurrency: [],
            unknownCostRecordCount: '0',
            maintenanceRecordCount: '2',
            recentActivity: [],
            reminder,
        }),
    );
    const overview = await api.getOverview(id);
    expect(overview.rideCount).toBe(1);
    expect(overview.unknownCostRecordCount).toBe(0);
    expect(overview.maintenanceRecordCount).toBe(2);
});
it.each([
    '2026-02-30T12:00:00Z',
    '2026-10-02T12:00:00',
    '2026-10-02T12:00:00+24:00',
    '2026-10-02T12:00:60Z',
])('rejects invalid wire instant %s', async (evaluatedAtUtc) => {
    const api = createApiClient('http://native.example', async () =>
        json({ ...reminder, evaluatedAtUtc }),
    );
    await expect(api.getReminder(id)).rejects.toThrow();
});
it.each([
    '2026-10-02T12:00:00.123456789+03:00',
    '2026-10-02T12:00:00.000500-04:30',
])(
    'preserves wire offset and precision %s with nullable dates',
    async (evaluatedAtUtc) => {
        const api = createApiClient('http://native.example', async () =>
            json({ ...reminder, evaluatedAtUtc }),
        );
        const result = await api.getReminder(id);
        expect(result.evaluatedAtUtc).toBe(evaluatedAtUtc);
        expect(result.baselineUtc).toBeNull();
    },
);
