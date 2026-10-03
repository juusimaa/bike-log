import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Garage, type GarageProps } from '../src/features/garage/Garage';
import { ApiError, ClientRangeError } from '@bikelog/api-client';
import { invalidateBike, queryKeys } from '../src/lib/query';
import { readSelection } from '../src/features/garage/navigation';
const a = '11111111-1111-1111-1111-111111111111',
    b = '22222222-2222-2222-2222-222222222222';
const bike = (id: string) => ({
    id,
    displayName: id === a ? 'Bike A' : 'Bike B',
    name: null,
    make: null,
    model: null,
    kind: null,
    year: null,
    color: null,
    version: 1,
});
const snapshot = (id: string) => ({
    bike: bike(id),
    rideCount: 123,
    recordedDistanceMetres: id === a ? 987000 : 384000,
    maintenanceRecordCount: 7,
    currentComponents: [],
    allocationGaps: [],
    spendingByCurrency: [
        { currency: 'EUR', amount: 12 },
        { currency: 'USD', amount: 34 },
    ],
    unknownCostRecordCount: 2,
    recentActivity: [],
});
const api = vi.hoisted(() => ({
    listBikes: vi.fn(),
    getBike: vi.fn(),
    getOverview: vi.fn(),
    listInstallations: vi.fn(),
}));
vi.mock('../src/lib/api', () => ({ getApi: () => api }));
function mount(props: GarageProps = {}) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    render(
        <QueryClientProvider client={client}>
            <Garage {...props} />
        </QueryClientProvider>,
    );
    return client;
}
function reset() {
    window.history.replaceState(null, '', '/');
    api.listBikes.mockResolvedValue({
        items: [bike(a), bike(b)],
        nextCursor: null,
    });
    api.getBike.mockImplementation(async (id) => bike(id));
    api.getOverview.mockImplementation(async (id) => snapshot(id));
    api.listInstallations.mockResolvedValue({ items: [], nextCursor: null });
}
describe('garage', () => {
    it('suppliedBikeBeyondFirstPageIsFetchedDirectly', async () => {
        reset();
        api.listBikes.mockResolvedValue({
            items: Array.from({ length: 50 }, (_, i) => ({
                ...bike(a),
                id: `page-${i}`,
            })),
            nextCursor: 'opaque',
        });
        window.history.replaceState(null, '', `/?bike=${b}`);
        mount();
        expect(
            await screen.findByRole('heading', { name: 'Bike B' }),
        ).toBeVisible();
        expect(api.getBike).toHaveBeenCalledWith(b, expect.any(AbortSignal));
        expect(
            screen.getByRole('button', { name: 'Load more bikes' }),
        ).toBeEnabled();
    });
    it('unknownSuppliedBikeNeverFallsBack', async () => {
        reset();
        window.history.replaceState(null, '', `/?bike=${b}`);
        api.getBike.mockRejectedValue(
            new ApiError(404, 'not_found', 'Missing'),
        );
        mount();
        expect(
            await screen.findByRole('heading', { name: 'Missing bike' }),
        ).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Add a ride' }),
        ).toBeDisabled();
    });
    it('unavailableAndUnsafeReadsRemainRecoverable', async () => {
        reset();
        api.getOverview.mockRejectedValue(new ClientRangeError());
        mount();
        expect(
            await screen.findByRole('heading', { name: 'Client range error' }),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    });
    it('invalidationClearsInfiniteCursors', async () => {
        const client = new QueryClient();
        client.setQueryData(queryKeys.rides(a), {
            pages: [{ items: [], nextCursor: 'obsolete' }],
            pageParams: [undefined, 'obsolete'],
        });
        client.setQueryData(queryKeys.rides(b), {
            pages: [{ items: [], nextCursor: 'keep' }],
            pageParams: [undefined],
        });
        await invalidateBike(client, a);
        expect(client.getQueryData(queryKeys.rides(a))).toBeUndefined();
        expect(client.getQueryData(queryKeys.rides(b))).toBeDefined();
    });

    it('dirtyNavigationRetainsFormUntilExplicitDiscard', async () => {
        reset();
        mount({ dirty: true });
        await screen.findByRole('heading', { name: 'Bike A' });
        fireEvent.click(screen.getByRole('button', { name: /Bike B/ }));
        expect(
            screen.getByRole('dialog', { name: 'Discard unsaved changes?' }),
        ).toBeVisible();
        expect(screen.getByRole('heading', { name: 'Bike A' })).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
        expect(screen.getByRole('heading', { name: 'Bike A' })).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: /Bike B/ }));
        fireEvent.click(
            screen.getByRole('button', { name: 'Discard changes' }),
        );
        expect(
            await screen.findByRole('heading', { name: 'Bike B' }),
        ).toBeVisible();
    });
    it('garageLoadMoreUsesOpaqueCursorAndDeduplicates', async () => {
        reset();
        api.listBikes.mockImplementation(async (page) =>
            page.cursor
                ? { items: [bike(a), bike(b)], nextCursor: null }
                : { items: [bike(a)], nextCursor: 'opaque-token' },
        );
        mount();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Load more bikes' }),
        );
        await screen.findByRole('button', { name: /Bike B/ });
        expect(screen.getAllByRole('button', { name: /Bike A/ })).toHaveLength(
            1,
        );
        expect(api.listBikes).toHaveBeenCalledWith(
            { pageSize: 50, cursor: 'opaque-token' },
            expect.any(AbortSignal),
        );
    });
    it('garageHasEmptyMissingAndUnavailableStates', async () => {
        reset();
        api.listBikes.mockResolvedValue({ items: [], nextCursor: null });
        mount();
        expect(await screen.findByText('Your garage is empty')).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Add a ride' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Create bike' }),
        ).toBeEnabled();
    });
    it('overviewShowsSeparateComponentMakeAndModel', async () => {
        reset();
        api.getOverview.mockImplementation(async (id) => ({
            ...snapshot(id),
            currentComponents: [
                {
                    componentId: 'c1',
                    installationId: 'i1',
                    position: 'chain',
                    currentInstallationMetres: 0,
                    currentInstallationSeconds: 0,
                    currentInstallationHasUnknownDuration: false,
                    initialUsageEstimateMetres: 0,
                    lifetimeMetres: 0,
                    lifetimeSeconds: 0,
                    lifetimeHasUnknownDuration: false,
                    combinedLifetimeMetres: 0,
                },
            ],
        }));
        api.listInstallations.mockResolvedValue({
            items: [
                {
                    installation: {
                        id: 'i1',
                        componentId: 'c1',
                        bikeId: a,
                        position: 'chain',
                        startUtc: '2026-09-01T00:00:00Z',
                        endUtc: null,
                        version: 1,
                    },
                    component: {
                        id: 'c1',
                        type: 'chain',
                        make: 'Campagnolo',
                        model: 'Ekar C13 C-Link 13-speed',
                        version: 1,
                        initialUsageEstimateMetres: 0,
                        installations: [],
                    },
                },
            ],
            nextCursor: null,
        });
        mount();
        expect(
            await screen.findByText('Campagnolo Ekar C13 C-Link 13-speed'),
        ).toBeVisible();
    });
    it('overviewUsesSnapshotNotPageSums', async () => {
        reset();
        mount();
        expect(
            await screen.findByText(
                (_, e) =>
                    e?.className === 'stat-value' && e.textContent === '987 km',
            ),
        ).toBeVisible();
        expect(screen.getByText('123 recorded rides')).toBeVisible();
        expect(screen.getByText('€12.00')).toBeVisible();
        expect(screen.getByText('USD 34.00')).toBeVisible();
        expect(screen.getByText('2 records with unknown cost')).toBeVisible();
        expect(screen.getAllByText('Not fitted').length).toBe(5);
    });
    it('lateResponseCannotReplaceActiveBike', async () => {
        reset();
        let resolve!: (v: unknown) => void;
        api.getOverview.mockImplementation((id) =>
            id === a
                ? new Promise((r) => {
                      resolve = r;
                  })
                : Promise.resolve(snapshot(id)),
        );
        mount();
        await screen.findByRole('button', { name: /Bike B/ });
        await waitFor(() => expect(resolve).toBeTypeOf('function'));
        fireEvent.click(screen.getByRole('button', { name: /Bike B/ }));
        await screen.findByRole('heading', { name: 'Bike B' });
        resolve(snapshot(a));
        await screen.findByText(
            (_, e) =>
                e?.className === 'stat-value' && e.textContent === '384 km',
        );
        expect(screen.queryByText('987 km')).not.toBeInTheDocument();
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { name: 'Bike B' }),
            ).toBeVisible(),
        );
    });
    it('urlReloadAndBackPreserveSelection', async () => {
        reset();
        window.history.replaceState(null, '', `/?bike=${b}&view=rides`);
        mount();
        expect(
            await screen.findByRole('heading', {
                name: 'Miles worth remembering.',
            }),
        ).toBeVisible();
        expect(
            readSelection(new URLSearchParams(`bike=${b}&view=rides`)),
        ).toEqual({ bikeId: b, view: 'rides' });
        fireEvent.click(screen.getByRole('link', { name: 'Overview' }));
        expect(
            await screen.findByRole('heading', { name: 'Bike B' }),
        ).toBeVisible();
        window.history.replaceState(null, '', `/?bike=${b}&view=rides`);
        window.dispatchEvent(new PopStateEvent('popstate'));
        expect(
            await screen.findByRole('heading', {
                name: 'Miles worth remembering.',
            }),
        ).toBeVisible();
    });
});
