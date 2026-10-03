import { beforeEach, expect, it, vi } from 'vitest';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    ApiError,
    type RideResponse,
    type Validated,
} from '@bikelog/api-client';
import { RideForm } from '../src/features/rides/RideForm';
import { Rides } from '../src/features/rides/Rides';
import { DeleteRideDialog } from '../src/features/rides/DeleteRideDialog';
import { Workspace } from '../src/features/garage/Workspace';
import { queryKeys } from '../src/lib/query';
const bikeId = '11111111-1111-1111-1111-111111111111';
const ride: Validated<RideResponse> = {
    id: '22222222-2222-2222-2222-222222222222',
    bikeId,
    name: 'Morning',
    startUtc: '2026-10-02T09:21:37.123456Z',
    distanceMetres: 65000,
    durationSeconds: 61,
    version: 7,
};
const bike = {
    id: bikeId,
    name: 'Bike',
    displayName: 'Bike',
    make: 'Trek',
    model: 'Domane',
    kind: 'road',
    year: 2020,
    color: null,
    version: 1,
};
const overview = {
    bike,
    evaluatedAtUtc: '2026-10-03T00:00:00Z',
    rideCount: 1,
    recordedDistanceMetres: 65000,
    currentComponents: [],
    allocationGaps: [{ rideId: ride.id, position: 'chain' }],
    spendingByCurrency: [],
    unknownCostRecordCount: 0,
    maintenanceRecordCount: 0,
    recentActivity: [],
    reminder: {
        ruleVersion: 1,
        state: 'disabled',
        enabled: false,
        method: null,
        oilThresholdMetres: null,
        waxThresholdMetres: null,
        activeThresholdMetres: null,
        evaluatedAtUtc: '2026-10-03T00:00:00Z',
        componentId: null,
        installationId: null,
        baselineKind: null,
        baselineUtc: null,
        distanceSinceBaselineMetres: null,
        remainingMetres: null,
        due: null,
    },
};
const api = vi.hoisted(() => ({
    listRides: vi.fn(),
    getRide: vi.fn(),
    createRide: vi.fn(),
    correctRide: vi.fn(),
    deleteRide: vi.fn(),
    getOverview: vi.fn(),
    listBikes: vi.fn(),
    getBike: vi.fn(),
    listInstallations: vi.fn(),
}));
vi.mock('../src/lib/api', () => ({ getApi: () => api }));
// Simulate a Helsinki browser while exercising the real Temporal conversions.
vi.mock('../src/lib/dates', async (importOriginal) => {
    const dates = await importOriginal<typeof import('../src/lib/dates')>();
    return {
        ...dates,
        LOCAL_TIME_ZONE: 'Europe/Helsinki',
        formatLocal: (iso: string) => dates.formatLocal(iso, 'Europe/Helsinki'),
        validOffsets: (wall: string) =>
            dates.validOffsets(wall, 'Europe/Helsinki'),
        preserveOrConvertInstant: (
            utc: string | undefined,
            wall: string | undefined,
            next: string,
            offset?: string,
        ) =>
            dates.preserveOrConvertInstant(
                utc,
                wall,
                next,
                offset,
                'Europe/Helsinki',
            ),
    };
});
beforeEach(() => {
    vi.resetAllMocks();
    window.history.replaceState(null, '', '/');
    api.listRides.mockResolvedValue({ items: [ride], nextCursor: null });
    api.getRide.mockResolvedValue({ ...ride, name: 'Current', version: 8 });
    api.createRide.mockResolvedValue(ride);
    api.correctRide.mockResolvedValue({ ...ride, version: 8 });
    api.deleteRide.mockResolvedValue(undefined);
    api.getOverview.mockResolvedValue(overview);
    api.listBikes.mockResolvedValue({ items: [bike], nextCursor: null });
    api.getBike.mockResolvedValue(bike);
    api.listInstallations.mockResolvedValue({ items: [], nextCursor: null });
});
function mount(
    child: React.ReactNode,
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
    render(<QueryClientProvider client={client}>{child}</QueryClientProvider>);
    return client;
}
function change(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function save() {
    fireEvent.click(screen.getByRole('button', { name: 'Save ride' }));
}
it('ridePagesAppendWithoutDuplicateIds', async () => {
    api.listRides.mockImplementation(async (_id, page) =>
        page.cursor
            ? {
                  items: [ride, { ...ride, id: 'third', name: 'Evening' }],
                  nextCursor: null,
              }
            : { items: [ride], nextCursor: 'opaque' },
    );
    mount(<Rides bikeId={bikeId} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Evening')).toBeVisible();
    expect(screen.getAllByText('Morning')).toHaveLength(1);
    expect(api.listRides.mock.calls[1][1]).toEqual({
        pageSize: 50,
        cursor: 'opaque',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh rides' }));
    await waitFor(() =>
        expect(screen.queryByText('Evening')).not.toBeInTheDocument(),
    );
});
it('createRideSendsIntegerUnitsAndOptionalName', async () => {
    mount(<RideForm bikeId={bikeId} onSaved={() => {}} onCancel={() => {}} />);
    change('Start time', '2026-10-02T12:00');
    change('Distance (km)', '65');
    change('Duration (minutes)', '');
    change('Ride name', '  ');
    save();
    await waitFor(() =>
        expect(api.createRide).toHaveBeenCalledWith(
            expect.objectContaining({
                bikeId,
                distanceMetres: 65000,
                durationSeconds: null,
                name: null,
            }),
        ),
    );
});
it('correctionPreservesUntouchedInstantAndSecondsAndCapturedIdentity', async () => {
    const client = new QueryClient();
    const props = { bikeId, ride, onSaved: () => {}, onCancel: () => {} };
    const result = render(
        <QueryClientProvider client={client}>
            <RideForm {...props} />
        </QueryClientProvider>,
    );
    change('Ride name', 'Renamed');
    result.rerender(
        <QueryClientProvider client={client}>
            <RideForm
                {...props}
                bikeId="different"
                ride={{ ...ride, id: 'different', version: 99 }}
            />
        </QueryClientProvider>,
    );
    save();
    await waitFor(() =>
        expect(api.correctRide).toHaveBeenCalledWith(ride.id, {
            bikeId,
            startUtc: '2026-10-02T09:21:37.123456Z',
            distanceMetres: 65000,
            durationSeconds: 61,
            name: 'Renamed',
            expectedVersion: 7,
        }),
    );
    expect(screen.getByLabelText('Duration (minutes)')).not.toHaveValue(
        '1 min 1 sec',
    );
});
it('deleteUsesQueryVersionAnd204', async () => {
    const done = vi.fn();
    const client = mount(
        <DeleteRideDialog ride={ride} onDeleted={done} onCancel={() => {}} />,
    );
    client.setQueryData(queryKeys.overview(bikeId), overview);
    fireEvent.click(screen.getByRole('button', { name: 'Delete ride' }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(api.deleteRide).toHaveBeenCalledWith(ride.id, 7);
    expect(client.getQueryData(queryKeys.overview(bikeId))).toBeUndefined();
});
it.each([400, 409])(
    'failedRideWriteDoesNotPretendUsageChanged %s',
    async (status) => {
        api.correctRide.mockRejectedValue(
            new ApiError(
                status,
                status === 409 ? 'history_conflict' : 'validation',
                'Cannot save',
            ),
        );
        const done = vi.fn();
        const client = mount(
            <RideForm
                bikeId={bikeId}
                ride={ride}
                onSaved={done}
                onCancel={() => {}}
            />,
        );
        client.setQueryData(queryKeys.overview(bikeId), overview);
        change('Ride name', 'Attempted');
        save();
        await screen.findByText('Cannot save');
        expect(screen.getByLabelText('Ride name')).toHaveValue('Attempted');
        expect(client.getQueryData(queryKeys.overview(bikeId))).toEqual(
            overview,
        );
        expect(done).not.toHaveBeenCalled();
        expect(api.getRide).not.toHaveBeenCalled();
        expect(
            screen.queryByRole('button', { name: 'Reapply my changes' }),
        ).not.toBeInTheDocument();
    },
);
it('staleCorrectionShowsSeparateCurrentAndExplicitFreshVersionReapply', async () => {
    api.correctRide.mockRejectedValueOnce(
        new ApiError(409, 'stale_version', 'Changed', 8),
    );
    mount(
        <RideForm
            bikeId={bikeId}
            ride={ride}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    change('Ride name', 'Attempted');
    save();
    const panel = await screen.findByRole('region', { name: 'Save conflict' });
    expect(within(panel).getByText(/Attempted/)).toBeVisible();
    expect(within(panel).getByText(/Current ·/)).toBeVisible();
    expect(api.correctRide).toHaveBeenCalledTimes(1);
    fireEvent.click(
        within(panel).getByRole('button', { name: 'Reapply my changes' }),
    );
    await waitFor(() =>
        expect(api.correctRide).toHaveBeenLastCalledWith(
            ride.id,
            expect.objectContaining({ name: 'Attempted', expectedVersion: 8 }),
        ),
    );
});
it('uncertainDeleteRequiresRefreshAndExplicitResubmit', async () => {
    api.deleteRide.mockRejectedValueOnce(new Error('lost'));
    const done = vi.fn();
    mount(
        <DeleteRideDialog ride={ride} onDeleted={done} onCancel={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete ride' }));
    const retry = await screen.findByRole('button', {
        name: 'Resubmit after review',
    });
    expect(retry).toBeDisabled();
    expect(done).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh saved data' }));
    await waitFor(() => expect(retry).toBeEnabled());
    expect(api.deleteRide).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(api.deleteRide).toHaveBeenLastCalledWith(ride.id, 8);
});
it('uncertainDeleteMissingRecordDoesNotPretendSuccessOrOfferAnotherDelete', async () => {
    api.deleteRide.mockRejectedValueOnce(new Error('lost'));
    api.getRide.mockRejectedValue(new ApiError(404, 'not_found', 'Missing'));
    const done = vi.fn();
    mount(
        <DeleteRideDialog ride={ride} onDeleted={done} onCancel={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete ride' }));
    fireEvent.click(
        await screen.findByRole('button', { name: 'Refresh saved data' }),
    );
    expect(await screen.findByText(/no longer exists/i)).toBeVisible();
    expect(done).not.toHaveBeenCalled();
    expect(
        screen.getByRole('button', { name: 'Resubmit after review' }),
    ).toBeDisabled();
});
it('gapsUseServerOverviewByRideIdAndNeverPartialHistory', async () => {
    mount(<Rides bikeId={bikeId} />);
    expect(
        await screen.findByText(/chain: missing installation history/i),
    ).toBeVisible();
});
it('overviewFailureDoesNotClaimGapFreeHistory', async () => {
    api.getOverview.mockRejectedValue(new Error('unavailable'));
    mount(<Rides bikeId={bikeId} />);
    expect(await screen.findByText('Morning')).toBeVisible();
    expect(
        await screen.findByText(/allocation information unavailable/i),
    ).toBeVisible();
    expect(screen.queryByText(/fully allocated/i)).not.toBeInTheDocument();
});
it('workspaceConnectsRideAndPreservesMountedDirtyInput', async () => {
    mount(<Workspace />);
    const log = await screen.findByRole('button', { name: 'Add a ride' });
    await waitFor(() => expect(log).toBeEnabled());
    fireEvent.click(log);
    change('Ride name', 'Draft');
    fireEvent.click(screen.getByRole('link', { name: /Rides/ }));
    expect(
        await screen.findByRole('dialog', { name: 'Discard unsaved changes?' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Ride name')).toHaveValue('Draft');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Ride name')).toHaveValue('Draft');
});

it('durationConvertsDecimalMinutesToExactSecondsAndCanExplicitlyClearExistingSeconds', async () => {
    mount(
        <RideForm
            bikeId={bikeId}
            ride={ride}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    change('Duration (minutes)', '1.05');
    save();
    await waitFor(() =>
        expect(api.correctRide).toHaveBeenCalledWith(
            ride.id,
            expect.objectContaining({ durationSeconds: 63 }),
        ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear duration' }));
    save();
    await waitFor(() =>
        expect(api.correctRide).toHaveBeenLastCalledWith(
            ride.id,
            expect.objectContaining({ durationSeconds: null }),
        ),
    );
});
it('uncertainCreationReviewsOpaqueHistoryPagesBeforeExplicitResubmit', async () => {
    api.createRide.mockRejectedValueOnce(new Error('lost'));
    api.listRides.mockImplementation(async (_id, page) =>
        page.cursor
            ? {
                  items: [{ ...ride, id: 'next', name: 'Next saved' }],
                  nextCursor: null,
              }
            : { items: [ride], nextCursor: 'opaque' },
    );
    mount(<RideForm bikeId={bikeId} onSaved={() => {}} onCancel={() => {}} />);
    change('Distance (km)', '65');
    change('Ride name', 'Attempted');
    save();
    const retry = await screen.findByRole('button', {
        name: 'Resubmit after review',
    });
    expect(retry).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh saved data' }));
    fireEvent.click(
        await screen.findByRole('button', { name: 'Load more saved rides' }),
    );
    expect(await screen.findByText(/Next saved/)).toBeVisible();
    expect(screen.getByLabelText('Ride name')).toHaveValue('Attempted');
    expect(api.createRide).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(api.createRide).toHaveBeenCalledTimes(2));
});
it('successfulCorrectionResetsCachedHistoricalPassportsAndReminders', async () => {
    const done = vi.fn();
    const client = mount(
        <RideForm
            bikeId={bikeId}
            ride={ride}
            onSaved={done}
            onCancel={() => {}}
        />,
    );
    const keys = [
        queryKeys.component('retired'),
        queryKeys.componentUsage('retired'),
        queryKeys.componentMaintenance('retired'),
        queryKeys.reminder(bikeId),
        queryKeys.installations(bikeId, 'all'),
        queryKeys.rides(bikeId),
    ];
    keys.forEach((key) => client.setQueryData(key, { retained: true }));
    change('Ride name', 'Changed');
    save();
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    keys.forEach((key) => expect(client.getQueryData(key)).toBeUndefined());
});
it('busyRideFormBlocksDuplicateWritesAndCancels', async () => {
    let resolve!: (value: typeof ride) => void;
    api.createRide.mockImplementation(
        () =>
            new Promise((res) => {
                resolve = res;
            }),
    );
    const cancel = vi.fn(),
        busy = vi.fn(),
        dirty = vi.fn();
    mount(
        <RideForm
            bikeId={bikeId}
            onSaved={() => {}}
            onCancel={cancel}
            onBusyChange={busy}
            onDirtyChange={dirty}
        />,
    );
    change('Distance (km)', '65');
    save();
    expect(screen.getByRole('button', { name: 'Save ride' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Distance (km)')).toBeDisabled();
    expect(busy).toHaveBeenLastCalledWith(true);
    expect(dirty).toHaveBeenLastCalledWith(true);
    expect(api.createRide).toHaveBeenCalledTimes(1);
    resolve(ride);
    await waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    expect(cancel).not.toHaveBeenCalled();
});
it('staleDeleteRequiresExplicitReviewAndCapturedFreshVersion', async () => {
    api.deleteRide.mockRejectedValueOnce(
        new ApiError(409, 'stale_version', 'Changed', 8),
    );
    const done = vi.fn(),
        dirty = vi.fn();
    mount(
        <DeleteRideDialog
            ride={ride}
            onDeleted={done}
            onCancel={() => {}}
            onDirtyChange={dirty}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete ride' }));
    const panel = await screen.findByRole('region', { name: 'Save conflict' });
    expect(api.deleteRide).toHaveBeenCalledTimes(1);
    expect(dirty).toHaveBeenLastCalledWith(true);
    fireEvent.click(
        within(panel).getByRole('button', { name: 'Reapply my changes' }),
    );
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(api.deleteRide).toHaveBeenLastCalledWith(ride.id, 8);
});
it('workspaceRidesViewConnectsCorrectionAndDeletion', async () => {
    window.history.replaceState(null, '', `/?bike=${bikeId}&view=rides`);
    mount(<Workspace />);
    fireEvent.click(
        await screen.findByRole('button', { name: 'Correct Morning' }),
    );
    expect(
        await screen.findByRole('dialog', { name: 'Correct ride' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Morning' }));
    expect(
        await screen.findByRole('dialog', { name: 'Delete ride?' }),
    ).toBeVisible();
});

it('rideFormRejectsSpringDstGapBeforeWriting', async () => {
    mount(<RideForm bikeId={bikeId} onSaved={() => {}} onCancel={() => {}} />);
    change('Distance (km)', '65');
    change('Start time', '2026-03-29T03:30');
    save();
    expect(await screen.findByRole('alert')).toHaveTextContent(
        /does not exist/,
    );
    expect(api.createRide).not.toHaveBeenCalled();
});
it('rideFormRequiresExplicitAutumnOverlapOffset', async () => {
    mount(<RideForm bikeId={bikeId} onSaved={() => {}} onCancel={() => {}} />);
    change('Distance (km)', '65');
    change('Start time', '2026-10-25T03:30');
    save();
    expect(await screen.findByRole('alert')).toHaveTextContent(
        /Choose an offset because/,
    );
    expect(api.createRide).not.toHaveBeenCalled();
    change('UTC offset', '+02:00');
    save();
    await waitFor(() =>
        expect(api.createRide).toHaveBeenCalledWith(
            expect.objectContaining({ startUtc: '2026-10-25T01:30:00Z' }),
        ),
    );
});
it('staleRecoveryDistinguishesSameNameRidesByPreciseStartInstant', async () => {
    api.correctRide.mockRejectedValueOnce(
        new ApiError(409, 'stale_version', 'Changed', 8),
    );
    api.getRide.mockResolvedValue({
        ...ride,
        startUtc: '2026-10-02T09:21:37.654321Z',
        version: 8,
    });
    mount(
        <RideForm
            bikeId={bikeId}
            ride={ride}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    save();
    const panel = await screen.findByRole('region', { name: 'Save conflict' });
    expect(within(panel).getAllByText(/Morning/)).toHaveLength(2);
    expect(
        within(panel).getByText('2026-10-02T09:21:37.123456Z'),
    ).toBeVisible();
    expect(
        within(panel).getByText('2026-10-02T09:21:37.654321Z'),
    ).toBeVisible();
    expect(api.correctRide).toHaveBeenCalledTimes(1);
});
it('uncertainHistoryShowsPreciseInstantsForNamedAndUnnamedRides', async () => {
    api.createRide.mockRejectedValueOnce(new Error('lost'));
    api.listRides.mockResolvedValue({
        items: [
            ride,
            { ...ride, id: 'second', startUtc: '2026-10-02T09:21:38.123456Z' },
            {
                ...ride,
                id: 'unnamed',
                name: null,
                startUtc: '2026-10-25T03:30:37.123456+02:00',
            },
        ],
        nextCursor: null,
    });
    mount(<RideForm bikeId={bikeId} onSaved={() => {}} onCancel={() => {}} />);
    change('Distance (km)', '65');
    save();
    fireEvent.click(
        await screen.findByRole('button', { name: 'Refresh saved data' }),
    );
    const current = await screen.findByRole('region', {
        name: 'Current saved data',
    });
    expect(
        within(current).getByText('2026-10-02T09:21:37.123456Z'),
    ).toBeVisible();
    expect(
        within(current).getByText('2026-10-02T09:21:38.123456Z'),
    ).toBeVisible();
    expect(
        within(current).getByText('2026-10-25T03:30:37.123456+02:00'),
    ).toBeVisible();
    expect(api.createRide).toHaveBeenCalledTimes(1);
});
it.each([100, 101])(
    'ride trimmed name length %s validates before mutation',
    async (length) => {
        mount(
            <RideForm bikeId={bikeId} onSaved={() => {}} onCancel={() => {}} />,
        );
        fireEvent.change(screen.getByLabelText('Ride name'), {
            target: { value: ` ${'a'.repeat(length)} ` },
        });
        fireEvent.change(screen.getByLabelText('Distance (km)'), {
            target: { value: '1' },
        });
        fireEvent.click(screen.getByText('Save ride'));
        if (length === 100)
            await waitFor(() =>
                expect(api.createRide).toHaveBeenCalledWith(
                    expect.objectContaining({
                        name: 'a'.repeat(100),
                        durationSeconds: null,
                    }),
                ),
            );
        else {
            expect(api.createRide).not.toHaveBeenCalled();
            expect(screen.getByLabelText('Ride name')).toHaveAttribute(
                'aria-invalid',
                'true',
            );
        }
    },
);
it('quantity and date validation identify real ride controls', () => {
    mount(<RideForm bikeId={bikeId} onSaved={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByText('Save ride'));
    expect(screen.getByLabelText('Distance (km)')).toHaveAttribute(
        'aria-invalid',
        'true',
    );
    fireEvent.change(screen.getByLabelText('Start time'), {
        target: { value: '' },
    });
    fireEvent.click(screen.getByText('Save ride'));
    expect(screen.getByLabelText('Start time')).toHaveAttribute(
        'aria-invalid',
        'true',
    );
});
